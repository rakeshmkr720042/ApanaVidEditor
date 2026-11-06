import { Component, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearLog, entriesNow, error as logError, logText, onChange, onOpen, onProblem, openBlackbox, type Entry } from '../lib/blackbox'
import { isNative, saveTextNative } from '../lib/save'
import { isDesktop } from '../lib/desktop'
import { getLang, t } from '../lib/i18n'
import safety from '../help/sections/85-safety'
import { Icon } from './Icon'
import { SheetClose } from '../ui/kit'

const fileName = () => `apna-editor-blackbox-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.txt`

/** The blackbox viewer: newest first, with copy / share / save so the log can reach the developer. */
export function BlackboxSheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Entry[]>(entriesNow)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [help, setHelp] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [today] = useState(() => new Date().toLocaleDateString())
  useEffect(() => onChange(() => setList(entriesNow())), [])

  const shown = useMemo(() => {
    const l = onlyProblems ? list.filter((e) => e.lvl === 'error' || e.lvl === 'crash' || e.lvl === 'warn') : list
    return l.slice().reverse()
  }, [list, onlyProblems])
  const problems = list.filter((e) => e.lvl === 'error' || e.lvl === 'crash').length

  const say = (m: string) => { setMsg(m); setTimeout(() => setMsg((x) => (x === m ? null : x)), 4000) }
  const copy = async () => {
    const text = await logText()
    try { await navigator.clipboard.writeText(text); say(t('Copied. Paste it in a chat for the developer.')) } catch {
      // older WebViews: select a hidden textarea instead
      const ta = Object.assign(document.createElement('textarea'), { value: text })
      document.body.appendChild(ta); ta.select()
      const ok = document.execCommand('copy'); ta.remove()
      say(t(ok ? 'Copied. Paste it in a chat for the developer.' : 'Could not copy. Use Save file instead.'))
    }
  }
  const save = async (share: boolean) => {
    const text = await logText()
    const name = fileName()
    try {
      if (isNative) {
        const uri = await saveTextNative(name, text)
        if (share) { const { Share } = await import('@capacitor/share'); await Share.share({ title: name, files: [uri] }).catch(() => {}) }
        else say(`${t('Saved to')} Documents/Apna Editor/${name}`)
        return
      }
      const file = new File([text], name, { type: 'text/plain' })
      if (share && !isDesktop && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name }).catch(() => {})
        return
      }
      const a = document.createElement('a')
      a.href = URL.createObjectURL(file); a.download = name; a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 5000)
      say(t('Saved as a .txt file in Downloads'))
    } catch (e) { say((e as Error).message) }
  }
  const clear = () => { if (confirm(t('Clear the whole blackbox log?'))) clearLog() }

  const lang = getLang()
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet blackbox" onClick={(e) => e.stopPropagation()} data-testid="blackbox">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} />
        <h2><Icon name="blackbox" size={20} /> {t('Blackbox log')} <span className="muted small">{list.length} · {problems} {t('problems')}</span></h2>
        <p className="muted small">{t('Records taps, export steps and every error on this device, so the cause of a crash is never lost.')} <button className="link-btn" onClick={() => setHelp((v) => !v)}>{t(help ? 'Hide help' : 'How it works')}</button></p>
        {help && (
          <div className="bb-help">
            {safety.topics.map((tp) => {
              const x = tp[lang]
              return (
                <div key={tp.id}>
                  <b>{x.title}</b>
                  <p>{x.what}</p>
                  <ol>{x.steps.map((st, i) => <li key={i}>{st}</li>)}</ol>
                  {x.tips?.map((tip, i) => <p key={i} className="bb-bullet">• {tip}</p>)}
                </div>
              )
            })}
          </div>
        )}
        <div className="row wrap">
          <button className="btn primary" onClick={copy} data-testid="bb-copy"><Icon name="copy" size={16} /> {t('Copy')}</button>
          <button className="btn" onClick={() => save(true)}>{t('Share')}</button>
          <button className="btn" onClick={() => save(false)}><Icon name="download" size={16} /> {t('Save file')}</button>
          <button className="btn ghost" onClick={clear}><Icon name="trash" size={16} /> {t('Clear')}</button>
        </div>
        <label className="bb-filter"><input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} /> {t('Errors only')}</label>
        {msg && <p className="muted small" data-testid="bb-msg">{msg}</p>}
        <div className="bb-list">
          {!shown.length && <p className="muted">{t(onlyProblems ? 'No problems recorded.' : 'The log is empty.')}</p>}
          {shown.map((e, i) => {
            const d = new Date(e.t)
            const k = e.t * 1000 + i
            return (
              <div key={k} className={`bb-row ${e.lvl}`} onClick={() => e.data && setOpen(open === k ? null : k)}>
                <span className="bb-time">{d.toLocaleDateString() === today ? '' : `${d.getDate()}/${d.getMonth() + 1} `}{d.toTimeString().slice(0, 8)}</span>
                <span className="bb-lvl">{e.lvl}</span>
                <span className="bb-msg">{e.msg}{e.data && <span className="muted"> {open === k ? '▾' : '▸'}</span>}</span>
                {open === k && e.data && <pre className="bb-data">{e.data}</pre>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Lives once at the top of the app: opens the blackbox from any button or Ctrl+Shift+L, and shows a
 * short "Problem recorded" note whenever an error is logged.
 */
export function BlackboxHost() {
  const [open, setOpen] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  useEffect(() => onOpen(() => setOpen(true)), [])
  useEffect(() => onProblem((m) => setProblem(m)), [])
  useEffect(() => {
    if (!problem) return
    const id = setTimeout(() => setProblem(null), 6000)
    return () => clearTimeout(id)
  }, [problem])
  return (
    <>
      {problem && !open && (
        <button className="bb-pill" onClick={() => { setProblem(null); setOpen(true) }} data-testid="bb-pill">
          <Icon name="blackbox" size={14} /> {t('Problem recorded')} · {t('tap to see')}
        </button>
      )}
      {open && <BlackboxSheet onClose={() => setOpen(false)} />}
    </>
  )
}

/** Catches a screen that crashed while drawing: logs it and offers a way back instead of a blank page. */
export class CrashGuard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: Error, info: { componentStack?: string | null }) {
    logError(`Screen crashed: ${e.message}`, `${e.stack ?? ''}\n${info.componentStack ?? ''}`)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="app crash-guard">
        <h2>{t('Something went wrong on this screen')}</h2>
        <p className="muted">{t('Your project is saved. The cause is recorded in the blackbox log.')}</p>
        <div className="row wrap">
          <button className="btn primary" onClick={() => location.reload()}>{t('Reload the app')}</button>
          <button className="btn" onClick={() => { location.hash = ''; this.setState({ failed: false }) }}>{t('Go to Home')}</button>
          <button className="btn" onClick={openBlackbox}><Icon name="blackbox" size={16} /> {t('Blackbox log')}</button>
        </div>
      </div>
    )
  }
}
