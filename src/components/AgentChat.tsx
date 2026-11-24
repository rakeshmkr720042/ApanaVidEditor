import { useEffect, useMemo, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import type { Editor } from '../model/useEditor'
import type { Selection } from '../model/useEditor'
import type { Project } from '../types'
import { t, getLang } from '../lib/i18n'
import { isDesktop } from '../lib/desktop'
import { isAllowed } from '../lib/premium'
import { newNote, putNote } from '../lib/feedback'
import { SheetClose } from '../ui/kit'
import { Icon } from './Icon'
import { quickPlan, EXAMPLES } from '../agent/quick'
import { runPlan, describeStep } from '../agent/apply'
import { planWithAI, enhanceWithAI, enhanceOffline, missingReport, savePending, getPending, clearPending } from '../agent/plan'
import { PROVIDERS, getChoice, setChoice, listModels, providerInfo, baseOf, type AIChoice, type ProviderId } from '../agent/providers'
import { saveKey, removeKey, maskedKey, redact } from '../agent/providers/keys'
import { usage } from '../agent/usage'
import type { AgentCtx, Both, Plan } from '../agent/types'

/**
 * AI chat: edit by typing what you want. Simple requests are understood instantly without AI; the rest go to
 * Local AI (free, on your computer) or, with Pro, an online AI with your own key. Every plan is shown first,
 * runs all-or-nothing on a copy of the project, and lands as one Undo step.
 */

type Msg =
  | { id: number; who: 'me'; text: string }
  | { id: number; who: 'bot'; kind: 'plan'; plan: Plan; dropped: string[]; state: 'ready' | 'done' | 'failed' | 'cancelled'; note?: Both; before?: Project; request: string }
  | { id: number; who: 'bot'; kind: 'text'; text: Both; examples?: boolean; setup?: boolean }

interface Props {
  ed: Editor
  projectId: string
  time: number
  onClose: () => void
  /** After an edit: open a tool's panel and/or select something. */
  onAfter: (open: string | undefined, select: Selection | undefined) => void
  onPaywall: () => void
}

const L = (en: string, hi: string): Both => ({ en, hi })
const say = (b: Both) => (getLang() === 'hi' ? b.hi : b.en)
let nextId = 1
const CHATS = new Map<string, Msg[]>() // chat history per project for this app session

export function AgentChat({ ed, projectId, time, onClose, onAfter, onPaywall }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>(() => CHATS.get(projectId) ?? [])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<null | 'thinking' | 'fixing' | 'enhancing'>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)
  const stop = useRef<AbortController | null>(null)
  const list = useRef<HTMLDivElement>(null)
  const lang = getLang()
  const ctx: AgentCtx = useMemo(() => ({ sources: ed.sources, sel: ed.sel, playhead: time, lang }), [ed.sources, ed.sel, time, lang])
  const pending = useMemo(() => getPending(projectId), [projectId, msgs.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { CHATS.set(projectId, msgs); list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' }) }, [msgs, projectId])
  useEffect(() => () => stop.current?.abort(), [])

  const push = (m: Msg | Omit<Msg, 'id'>) => setMsgs((l) => [...l, { ...m, id: nextId++ } as Msg])
  const update = (id: number, patch: Partial<Msg>) => setMsgs((l) => l.map((m) => (m.id === id ? ({ ...m, ...patch } as Msg) : m)))

  /** The AI to use now, or why there is none. */
  const brain = (): { ai: AIChoice } | { why: Both; pro?: boolean } => {
    const c = getChoice()
    const p = providerInfo(c.provider)
    if (p.online && !isAllowed('aionline')) return { why: L('Online AI in the chat is a Pro feature.', 'चैट में ऑनलाइन AI प्रो फ़ीचर है।'), pro: true }
    if (p.online && !maskedKey(c.provider)) return { why: L(`Add your ${p.name} API key in AI settings.`, `AI सेटिंग में अपनी ${p.name} API key डालें।`) }
    if (!c.model) return { why: L('Pick a model in AI settings.', 'AI सेटिंग में मॉडल चुनें।') }
    return { ai: c }
  }

  async function send(raw = text) {
    const request = raw.trim()
    if (!request || busy) return
    setText(''); setHint(null)
    push({ who: 'me', text: request })
    const q = quickPlan(request, ctx)
    // understood completely without AI: instant
    if (q.plan.steps.length && !q.left.length) { push({ who: 'bot', kind: 'plan', plan: q.plan, dropped: [], state: 'ready', request }); return }
    const b = brain()
    if ('why' in b) {
      if (q.plan.steps.length) {
        push({ who: 'bot', kind: 'plan', plan: { ...q.plan, questions: [] }, dropped: [], state: 'ready', request, note: L(`I did not understand: "${q.left.join('", "')}". With Local AI or an online AI I can understand more.`, `यह समझ नहीं आया: "${q.left.join('", "')}"। लोकल AI या ऑनलाइन AI से मैं और समझ सकता हूँ।`) })
      } else push({ who: 'bot', kind: 'text', text: L(`I could not understand that without AI. ${b.why.en} Or try one of these:`, `बिना AI के यह समझ नहीं आया। ${b.why.hi} या इनमें से कुछ लिखें:`), examples: true, setup: true })
      if ('pro' in b && b.pro) onPaywall()
      return
    }
    const ctl = new AbortController()
    stop.current = ctl
    setBusy('thinking')
    try {
      const plan = await planWithAI(request, ed.project, ctx, b.ai, { signal: ctl.signal, onStage: (s) => setBusy(s) })
      if (!plan.steps.length && !plan.missing.length && !plan.questions.length) {
        push({ who: 'bot', kind: 'text', text: L('The AI could not turn that into edits. Try saying it differently, or tap ✨ to make it clearer.', 'AI इसे एडिट में नहीं बदल पाया। दूसरे शब्दों में लिखें या ✨ दबाकर साफ़ करें।'), examples: true })
      } else push({ who: 'bot', kind: 'plan', plan, dropped: plan.dropped, state: 'ready', request })
    } catch (e) {
      if ((e as Error).name === 'AbortError') push({ who: 'bot', kind: 'text', text: L('Stopped.', 'रोक दिया।') })
      else push({ who: 'bot', kind: 'text', text: L(redact((e as Error).message), redact((e as Error).message)), setup: true })
    } finally { setBusy(null); stop.current = null }
  }

  async function enhance() {
    const request = text.trim()
    if (!request || busy) return
    const q = quickPlan(request, ctx)
    if (q.plan.steps.length && !q.left.length) { setText(enhanceOffline(q.plan.steps, ctx)); setHint(t('Made clear without AI. Check it and send.')); return }
    const b = brain()
    if ('why' in b) { setHint(say(b.why)); return }
    const ctl = new AbortController()
    stop.current = ctl
    setBusy('enhancing')
    try {
      const r = await enhanceWithAI(request, ed.project, ctx, b.ai, ctl.signal)
      setText(r.clear)
      const extra = [...r.assumptions.map((a) => `• ${a}`), ...r.questions.map((x) => `? ${x}`)]
      setHint(extra.length ? extra.join('\n') : t('Check the clearer request and send it.'))
    } catch (e) { if ((e as Error).name !== 'AbortError') setHint(redact((e as Error).message)) } finally { setBusy(null); stop.current = null }
  }

  function apply(m: Extract<Msg, { kind: 'plan' }>, skipFailed = false) {
    const before = ed.project
    const r = runPlan(before, m.plan.steps, { ...ctx, playhead: time }, skipFailed)
    if (!r.ok) { update(m.id, { state: 'failed', note: r.error }); return }
    ed.replaceProject(r.project) // one change = one Undo
    const failed = r.results.filter((x) => !x.ok)
    update(m.id, { state: 'done', before, note: failed.length ? L(`Done, except: ${failed.map((x) => x.error?.en).join('; ')}`, `हो गया, बस यह नहीं हुआ: ${failed.map((x) => x.error?.hi).join('; ')}`) : undefined })
    if (m.plan.missing.length) savePending(projectId, { request: m.request, missing: m.plan.missing })
    onAfter(r.after.open, r.after.select)
  }

  function restore(m: Extract<Msg, { kind: 'plan' }>) {
    if (!m.before) return
    ed.replaceProject(m.before)
    update(m.id, { state: 'cancelled', note: L('Put back as it was before this change.', 'इस बदलाव से पहले जैसा कर दिया।'), before: undefined })
  }

  const copyMissing = async (m: Extract<Msg, { kind: 'plan' }>) => {
    const doable = m.plan.steps.map((s) => describeStep(s, ctx)[lang])
    const report = missingReport(m.request, m.plan.missing, doable)
    savePending(projectId, { request: m.request, missing: m.plan.missing })
    try { await navigator.clipboard.writeText(report); setHint(t('Copied. Paste it in the chat with Claude to get these features built.')) } catch { setHint(report) }
  }
  const noteMissing = async (m: Extract<Msg, { kind: 'plan' }>) => {
    await putNote(newNote('idea', missingReport(m.request, m.plan.missing, []), { where: 'AI chat' }))
    savePending(projectId, { request: m.request, missing: m.plan.missing })
    setHint(t('Saved to Testing notes.'))
  }

  if (settings) return <AISettings onClose={() => setSettings(false)} onPaywall={onPaywall} />

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet agent-chat" onClick={(e) => e.stopPropagation()} data-testid="agent-chat">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} disabled={!!busy && busy !== 'thinking'} />
        <h2><Icon name="ai" /> {t('AI chat')} <button className="link small" onClick={() => setSettings(true)} data-testid="agent-settings">{providerInfo(getChoice().provider).online ? providerInfo(getChoice().provider).name.split(' (')[0] : t('Local AI')} ⚙</button></h2>
        <div className="agent-list" ref={list}>
          {!msgs.length && (
            <div className="agent-empty">
              <p className="muted small">{t('Tell me what to change, in Hindi, Hinglish or English. I show the plan first; nothing changes until you tap Apply, and one Undo takes it all back.')}</p>
              <div className="agent-chips">{EXAMPLES.map((x) => <button key={x} className="chip" onClick={() => void send(x)}>{x}</button>)}</div>
            </div>
          )}
          {pending?.newTools && (
            <div className="agent-msg bot pending">
              <p>{t('New features arrived since you asked:')} “{pending.request}”</p>
              <button className="btn small primary" onClick={() => { clearPending(projectId); void send(pending.request) }}>{t('Finish it now')}</button>
              <button className="btn small" onClick={() => { clearPending(projectId); setMsgs((l) => [...l]) }}>{t('Forget it')}</button>
            </div>
          )}
          {msgs.map((m) => m.who === 'me'
            ? <div key={m.id} className="agent-msg me">{m.text}</div>
            : m.kind === 'text'
              ? (
                <div key={m.id} className="agent-msg bot">
                  <p style={{ whiteSpace: 'pre-wrap' }}>{say(m.text)}</p>
                  {m.examples && <div className="agent-chips">{EXAMPLES.slice(0, 4).map((x) => <button key={x} className="chip" onClick={() => void send(x)}>{x}</button>)}</div>}
                  {m.setup && <button className="btn small" onClick={() => setSettings(true)}>{t('AI settings')}</button>}
                </div>
              )
              : <PlanCard key={m.id} m={m} ctx={ctx} onApply={(skip) => apply(m, skip)} onCancel={() => update(m.id, { state: 'cancelled' })} onRestore={() => restore(m)}
                onCopy={() => void copyMissing(m)} onNote={() => void noteMissing(m)} onAnswer={(a) => void send(`${m.request}. ${a}`)} />)}
          {busy && (
            <div className="agent-msg bot busy" data-testid="agent-busy">
              <span className="spinner" /> {busy === 'fixing' ? t('Checking and fixing the plan…') : busy === 'enhancing' ? t('Making the request clearer…') : t('Thinking…')}
              <button className="btn small" onClick={() => stop.current?.abort()}>{t('Stop')}</button>
            </div>
          )}
        </div>
        {hint && <p className="muted small agent-hint" style={{ whiteSpace: 'pre-wrap' }}>{hint}</p>}
        <div className="agent-input">
          <textarea value={text} rows={2} placeholder={t('e.g. Saare clips pe warm filter, beech me fade, 9:16 bana do')} data-testid="agent-input"
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }} />
          <button className="btn" title={t('Make my request clearer')} disabled={!text.trim() || !!busy} onClick={() => void enhance()} data-testid="agent-enhance">✨</button>
          <button className="btn primary" disabled={!text.trim() || !!busy} onClick={() => void send()} data-testid="agent-send">{t('Send')}</button>
        </div>
      </div>
    </div>
  )
}

function PlanCard({ m, ctx, onApply, onCancel, onRestore, onCopy, onNote, onAnswer }: {
  m: Extract<Msg, { kind: 'plan' }>; ctx: AgentCtx; onApply: (skipFailed: boolean) => void; onCancel: () => void; onRestore: () => void
  onCopy: () => void; onNote: () => void; onAnswer: (a: string) => void
}) {
  const p = m.plan
  return (
    <div className={`agent-msg bot plan ${m.state}`} data-testid="agent-plan">
      <p><b>{p.by === 'quick' ? '⚡ ' : '🤖 '}{p.understood}</b></p>
      {p.steps.length > 0 && <ol className="agent-steps">{p.steps.map((s, i) => <li key={i}>{say(describeStep(s, ctx))}</li>)}</ol>}
      {p.missing.length > 0 && (
        <div className="agent-missing" data-testid="agent-missing">
          <p><b>{t('These features are not in the editor yet:')}</b></p>
          <ul>{p.missing.map((x, i) => <li key={i}>{x.need}{x.why ? <span className="muted"> ({x.why})</span> : null}</li>)}</ul>
          <div className="row"><button className="btn small" onClick={onCopy}>{t('Copy for Claude')}</button><button className="btn small" onClick={onNote}>{t('Save to Testing notes')}</button></div>
        </div>
      )}
      {p.questions.length > 0 && m.state === 'ready' && (
        <div className="agent-questions">{p.questions.map((q, i) => (
          <div key={i}><p className="small">❓ {q}</p><AnswerBox onAnswer={onAnswer} /></div>
        ))}</div>
      )}
      {m.dropped.length > 0 && <p className="muted small">{t('Left out (the AI got these wrong):')} {m.dropped.join('; ')}</p>}
      {m.note && <p className={`small ${m.state === 'failed' ? 'error-text' : 'muted'}`}>{say(m.note)}</p>}
      {m.state === 'ready' && p.steps.length > 0 && (
        <div className="row">
          <button className="btn primary small" onClick={() => onApply(false)} data-testid="agent-apply">{t('Apply')}</button>
          <button className="btn small" onClick={onCancel}>{t('Cancel')}</button>
        </div>
      )}
      {m.state === 'failed' && p.steps.length > 1 && <button className="btn small" onClick={() => onApply(true)}>{t('Do the parts that work')}</button>}
      {m.state === 'done' && (
        <div className="row"><span className="ok-text small">✓ {t('Done. One Undo takes it all back.')}</span>{m.before && <button className="btn small" onClick={onRestore} data-testid="agent-restore">{t('Put back')}</button>}</div>
      )}
    </div>
  )
}

function AnswerBox({ onAnswer }: { onAnswer: (a: string) => void }) {
  const [v, setV] = useState('')
  return <div className="row"><input value={v} onChange={(e) => setV(e.target.value)} placeholder={t('Your answer')} /><button className="btn small" disabled={!v.trim()} onClick={() => onAnswer(v.trim())}>{t('Send')}</button></div>
}

/** Which AI the chat uses: Local AI (free) or an online AI with your own key (Pro). */
function AISettings({ onClose, onPaywall }: { onClose: () => void; onPaywall: () => void }) {
  const [c, setC] = useState<AIChoice>(getChoice)
  const [key, setKey] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [agreed, setAgreed] = useState(() => { try { return localStorage.getItem('agent-online-ok') === '1' } catch { return false } })
  const [, redraw] = useState(0)
  const p = providerInfo(c.provider)
  const web = !Capacitor.isNativePlatform() && !isDesktop
  const locked = p.online && !isAllowed('aionline')
  const save = (next: AIChoice) => { setC(next); setChoice(next) }
  const u = usage()

  const pick = (id: ProviderId) => {
    const info = providerInfo(id)
    if (info.online && !isAllowed('aionline')) { onPaywall(); return }
    setStatus(null); setModels([])
    save({ provider: id, model: info.suggest[0] ?? '', base: id === 'ollama' ? getChoice().base ?? info.base : id === 'custom' ? c.base ?? '' : undefined })
  }

  const test = async () => {
    setBusy(true); setStatus(null)
    try {
      if (key.trim()) { await saveKey(c.provider, key, new URL(baseOf(c)).origin, !!c.tabOnly); setKey('') }
      const got = await listModels(c)
      setModels(got)
      const model = got.includes(c.model) ? c.model : (got.find((m) => p.suggest.includes(m)) ?? got.find((m) => /gemma/i.test(m)) ?? got[0] ?? c.model)
      save({ ...c, model })
      setStatus({ ok: true, text: `${t('Connected.')} ${got.length} ${t('models')}.` })
    } catch (e) { setStatus({ ok: false, text: redact((e as Error).message) }) } finally { setBusy(false); redraw((x) => x + 1) }
  }

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet agent-chat" onClick={(e) => e.stopPropagation()} data-testid="agent-ai-settings">
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} disabled={busy} />
        <h2>{t('AI settings')}</h2>
        <p className="muted small">{t('Simple requests work without any AI. For the rest, pick which AI understands your requests.')}</p>
        <div className="agent-providers">
          {PROVIDERS.map((x) => (
            <button key={x.id} className={`chip ${c.provider === x.id ? 'on' : ''}`} onClick={() => pick(x.id)} data-testid={`agent-provider-${x.id}`}>
              {x.name}{x.online && !isAllowed('aionline') ? ' 👑' : ''}
            </button>
          ))}
        </div>
        {p.online && !agreed && !locked && (
          <div className="agent-privacy" data-testid="agent-privacy">
            <p className="small"><b>{t('Before you use an online AI')}</b></p>
            <ul className="small">
              <li>{t('What is sent: your request and a short list of your clips, times and text. Never your video or photo files.')}</li>
              <li>{t('Who gets it: the company you picked, under their rules.')}</li>
              <li>{t('Who pays: your own account with that company (your API key).')}</li>
              <li>{t('Your key stays on this device only. It is never put in projects, shared files or sent to us.')}</li>
            </ul>
            <button className="btn small primary" onClick={() => { try { localStorage.setItem('agent-online-ok', '1') } catch { /* private */ } setAgreed(true) }}>{t('I understand')}</button>
          </div>
        )}
        {(!p.online || (agreed && !locked)) && (
          <div className="agent-form">
            {(p.id === 'ollama' || p.id === 'custom') && (
              <label className="field"><span>{t('Server address')}</span><input value={c.base ?? ''} placeholder={p.base || 'https://…/v1'} onChange={(e) => save({ ...c, base: e.target.value })} /></label>
            )}
            {p.online && (
              <>
                <label className="field"><span>{t('API key')} {maskedKey(c.provider) && <span className="muted">({t('saved')} {maskedKey(c.provider)})</span>}</span>
                  <input type="password" autoComplete="off" value={key} placeholder={maskedKey(c.provider) ? t('Type a new key to replace it') : t('Paste your API key')} onChange={(e) => setKey(e.target.value)} data-testid="agent-key" /></label>
                {p.keyUrl && <p className="small"><a href={p.keyUrl} target="_blank" rel="noreferrer">{t('Where do I get a key?')}</a></p>}
                {web && <label className="small"><input type="checkbox" checked={!!c.tabOnly} onChange={(e) => save({ ...c, tabOnly: e.target.checked })} /> {t('Forget the key when this tab closes')}</label>}
                {maskedKey(c.provider) && <button className="btn small" onClick={() => { removeKey(c.provider); redraw((x) => x + 1) }}>{t('Remove key')}</button>}
              </>
            )}
            <label className="field"><span>{t('Model')}</span>
              {models.length
                ? <select value={c.model} onChange={(e) => save({ ...c, model: e.target.value })}>{models.map((m) => <option key={m} value={m}>{m}</option>)}</select>
                : <input value={c.model} onChange={(e) => save({ ...c, model: e.target.value })} placeholder={p.suggest[0] ?? ''} />}
            </label>
            <button className="btn primary" disabled={busy} onClick={() => void test()} data-testid="agent-test">{busy ? t('Checking…') : key.trim() ? t('Save key & test') : t('Test')}</button>
            {status && <p className={`small ${status.ok ? 'ok-text' : 'error-text'}`} style={{ whiteSpace: 'pre-wrap' }}>{status.text}</p>}
            {p.online && u.requests > 0 && <p className="muted small">{t('This month')}: {u.requests} {t('requests')}, {u.input + u.output} tokens</p>}
            {!p.online && <p className="muted small">{t('Free and private: runs on your own computer with Ollama. From a phone, use the laptop\'s Wi-Fi address (Home → Local AI shows how).')}</p>}
          </div>
        )}
        {locked && <button className="btn primary" onClick={onPaywall}>{t('Get Pro for online AI')}</button>}
      </div>
    </div>
  )
}
