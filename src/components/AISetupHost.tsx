import { useEffect, useState } from 'react'
import { desktop, type AISetupProgress, type ComputerInfo } from '../lib/desktop'
import { AI_SETUP_EVENT, haveGemma, needDisk, OLLAMA_SIZE, PLANS, recommend } from '../lib/aisetup'
import { DEFAULT_URL, setLocalAI } from '../lib/localai'
import { openHelp } from '../help/open'
import { SheetClose } from '../ui/kit'
import { t } from '../lib/i18n'

type Stage = 'check' | 'plan' | 'run' | 'done' | 'error'

const gb = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)} GB`

/**
 * Always mounted. The Local AI setup dialog: checks this computer, suggests a Gemma 4 model that
 * fits, and only after "Allow and install" installs Ollama (if missing) and downloads the model.
 */
export function AISetupHost() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener(AI_SETUP_EVENT, show)
    return () => window.removeEventListener(AI_SETUP_EVENT, show)
  }, [])
  return open ? <AISetupDialog onClose={() => setOpen(false)} /> : null
}

function AISetupDialog({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('check')
  const [pc, setPc] = useState<ComputerInfo | null>(null)
  const [model, setModel] = useState('')
  const [prog, setProg] = useState<AISetupProgress | null>(null)
  const [error, setError] = useState('')

  const check = async () => {
    setStage('check'); setError('')
    try {
      const c = await desktop!.aiCheck!()
      setPc(c)
      setModel(haveGemma(c) ?? recommend(c).model)
      setStage('plan')
    } catch (e) { setError((e as Error).message); setStage('error') }
  }
  useEffect(() => { void check() }, [])
  useEffect(() => desktop?.onAIProgress?.(setProg), [])

  const plan = PLANS.find((p) => p.model === model)
  const best = pc ? recommend(pc) : null
  const have = pc ? haveGemma(pc) : null
  const already = !!pc?.models.includes(model)
  const download = (already ? 0 : plan?.size ?? 0) + (pc?.ollamaInstalled ? 0 : OLLAMA_SIZE)
  const lowDisk = !!(pc && plan && !already && pc.freeDisk !== null && pc.freeDisk < needDisk(plan, pc))
  const weak = !!(pc && pc.ram < 6)

  const install = async () => {
    setStage('run'); setError(''); setProg(null)
    try {
      await desktop!.aiSetup!(model)
      setLocalAI({ on: true, url: DEFAULT_URL, model })
      setStage('done')
    } catch (e) {
      const msg = (e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
      setError(msg); setStage('error')
    }
  }

  const running = stage === 'run'
  const pct = prog?.p !== undefined && prog.p >= 0 ? Math.round(prog.p * 100) : null
  const sizeLine = prog?.total && prog.done !== undefined && prog.total > 50 * 1024 * 1024
    ? ` ${gb(prog.done / 1e9)} / ${gb(prog.total / 1e9)}` : ''

  return (
    <div className="sheet-backdrop" onClick={running ? undefined : onClose}>
      <div className="sheet ai-setup" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('Set up free Local AI')}>
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} disabled={running} />
        <h2>{t('Set up free Local AI')}</h2>
        <p className="muted small">{t('Gemma 4 is a free, open AI model from Google. It runs on this computer with the free Ollama app, so your text never leaves the computer and it works without internet after setup.')}</p>

        {stage === 'check' && <p className="small">{t('Checking this computer…')}</p>}

        {pc && (stage === 'plan' || stage === 'run' || stage === 'error') && (
          <div className="ai-pc small">
            <div><b>{t('Memory (RAM)')}:</b> {gb(pc.ram)}</div>
            <div><b>{t('Processor')}:</b> {pc.cpu || '—'} ({pc.cores} {t('threads')})</div>
            <div><b>{t('Graphics')}:</b> {pc.gpus.length ? pc.gpus.map((g) => `${g.name}${g.vram ? ` (${gb(g.vram)})` : ''}`).join(', ') : '—'}</div>
            <div><b>{t('Free disk space')}:</b> {pc.freeDisk === null ? '—' : gb(pc.freeDisk)}</div>
            <div><b>Ollama:</b> {t(pc.ollamaRunning ? 'installed and running' : pc.ollamaInstalled ? 'installed' : 'not installed')}</div>
          </div>
        )}

        {stage === 'plan' && pc && (
          <>
            <span className="field-label">{t('Model for this computer')}</span>
            <select className="select" value={model} onChange={(e) => setModel(e.target.value)} aria-label={t('Model for this computer')}>
              {have && !PLANS.some((p) => p.model === have) && <option value={have}>{have} — {t('already downloaded')}</option>}
              {PLANS.map((p) => (
                <option key={p.model} value={p.model}>
                  {p.name} · {gb(p.size)}{p.model === best?.model ? ` · ${t('recommended')}` : ''}{pc.models.includes(p.model) ? ` · ${t('already downloaded')}` : ''}{!p.ok(pc) ? ` · ${t('too big for this computer')}` : ''}
                </option>
              ))}
            </select>
            {plan && <p className="muted small">{t(plan.fits)}</p>}
            <div className="ai-consent small">
              <b>{t('What will happen')}</b>
              <ol>
                {!pc.ollamaInstalled && <li>{t('Download and install Ollama from ollama.com (about 1.2 GB), into your own user folder.')}</li>}
                {!pc.ollamaRunning && <li>{t('Start Ollama in the background.')}</li>}
                {!already && <li>{`${t('Download the model')} ${model} (${gb(plan?.size ?? 0)}).`}</li>}
                <li>{t('Switch on Local AI in this editor.')}</li>
              </ol>
              {download > 0 && <div>{t('Total download')}: <b>{gb(download)}</b>. {t('Use Wi-Fi; it can take a while.')}</div>}
            </div>
            {weak && <p className="small error-text">{t('This computer has less than 6 GB memory. Local AI may be very slow or not work.')}</p>}
            {plan && !plan.ok(pc) && <p className="small error-text">{t('This model is bigger than this computer can run well. It may be very slow.')}</p>}
            {lowDisk && <p className="small error-text">{t('Not enough free disk space. Free some space first.')}</p>}
            <div className="row">
              <button className="btn primary" disabled={lowDisk} onClick={install}>{t('Allow and install')}</button>
              <button className="btn" onClick={onClose}>{t('Not now')}</button>
            </div>
            <p className="muted small">{t('You can do this later from Home → Local AI.')}</p>
          </>
        )}

        {running && (
          <>
            <p className="small">{t(prog?.text?.startsWith('Downloading gemma') ? 'Downloading the model…' : prog?.text ?? 'Starting…')}{pct !== null ? ` ${pct}%` : ''}{sizeLine}</p>
            <div className={`progress${pct === null ? ' waiting' : ''}`}><div style={pct === null ? undefined : { width: `${pct}%` }} /></div>
            <p className="muted small">{t('Keep the app open until this finishes. If it stops, Try again continues where it stopped.')}</p>
            <button className="btn" onClick={() => desktop?.aiCancel?.()}>{t('Stop')}</button>
          </>
        )}

        {stage === 'done' && (
          <>
            <p className="small ok-text">✓ {t('Local AI is ready')}: {model}</p>
            <p className="muted small">{t('Key points, quiz questions, subtitle translation and Smart cut can now use it. It works offline.')}</p>
            <button className="btn primary" onClick={onClose}>{t('Done')}</button>
          </>
        )}

        {stage === 'error' && (
          <>
            <p className="small error-text">{t(error)}</p>
            <div className="row">
              <button className="btn primary" onClick={pc ? install : check}>{t('Try again')}</button>
              <button className="btn" onClick={onClose}>{t('Close')}</button>
            </div>
            <details open>
              <summary className="small">{t('Install by hand instead')}</summary>
              <div className="help small">
                {t('Open PowerShell (Start → type PowerShell) and run these two lines, one after the other:')}{'\n'}
                <code>winget install --id Ollama.Ollama -e</code>{'\n'}
                <code>ollama pull {model || 'gemma4:e4b-it-qat'}</code>{'\n'}
                {t('Or download Ollama from ollama.com/download. Then open Home → Local AI and tap Test connection.')}
              </div>
            </details>
            <button className="btn" onClick={() => { onClose(); openHelp('local-ai-setup') }}>{t('Help')}</button>
          </>
        )}
      </div>
    </div>
  )
}
