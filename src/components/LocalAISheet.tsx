import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { DEFAULT_URL, getLocalAI, listModels, pickModel, setLocalAI } from '../lib/localai'
import { isDesktop } from '../lib/desktop'
import { getVoiceClone, setVoiceClone, testSpace } from '../engine/voiceclone'
import { Toggle, SheetClose } from '../ui/kit'
import { t } from '../lib/i18n'

/** Settings for Local AI: the address of the user's Ollama server and which model to use. */
export function LocalAISheet({ onClose }: { onClose: () => void }) {
  const [c, setC] = useState(getLocalAI)
  const [models, setModels] = useState<string[]>(c.model ? [c.model] : [])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const save = (patch: Parameters<typeof setLocalAI>[0]) => setC(setLocalAI(patch))
  const web = !Capacitor.isNativePlatform() && !isDesktop

  // personal voice cloning: off and empty until the user adds their own Space
  const [vc, setVc] = useState(getVoiceClone)
  const [vcStatus, setVcStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const saveVc = (patch: Parameters<typeof setVoiceClone>[0]) => { setVc(setVoiceClone(patch)); setVcStatus(null) }
  const testVc = async () => {
    setBusy(true); setVcStatus(null)
    try {
      await testSpace(vc.url)
      saveVc({ on: true })
      setVcStatus({ ok: true, text: t('Connected. "My voice (clone)" is now in AI Dub → Voice-over.') })
    } catch (e) { setVcStatus({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }

  const test = async () => {
    setBusy(true); setStatus(null)
    try {
      const got = await listModels(c.url)
      setModels(got)
      if (!got.length) { setStatus({ ok: false, text: t('Connected, but no models are installed. In PowerShell run: ollama pull gemma4:e4b (or your model)') }); return }
      const model = got.includes(c.model) ? c.model : pickModel(got)
      save({ model, on: true })
      setStatus({ ok: true, text: `${t('Connected.')} ${got.length} ${t(got.length === 1 ? 'model' : 'models')}: ${got.join(', ')}` })
    } catch (e) { setStatus({ ok: false, text: (e as Error).message }) } finally { setBusy(false) }
  }

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet local-ai" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grab" />
        <SheetClose onClose={onClose} disabled={!!busy} />
        <h2>{t('Local AI')}</h2>
        <p className="muted small">{t('Use an AI model running on your own computer with Ollama (for example Gemma). It can shorten text into key points, write quiz questions, and translate subtitles. Nothing is sent to the internet.')}</p>
        <Toggle label="Use Local AI" value={c.on} onChange={(on) => save({ on })} />
        <label className="field-label" htmlFor="ai-url">{t('Local AI server URL')}</label>
        <input id="ai-url" className="text-input" inputMode="url" value={c.url} placeholder={DEFAULT_URL} spellCheck={false}
          onChange={(e) => save({ url: e.target.value.trim() })} />
        <span className="field-label">{t('Model')}</span>
        {models.length > 1 ? (
          <select className="select" value={c.model} onChange={(e) => save({ model: e.target.value })} aria-label={t('Model')}>
            {models.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        ) : (
          <input className="text-input" value={c.model} placeholder="gemma4:e4b" spellCheck={false} aria-label={t('Model')}
            onChange={(e) => save({ model: e.target.value.trim() })} />
        )}
        <Toggle label="Translate subtitles with Local AI" value={c.translate} onChange={(translate) => save({ translate })} />
        <div className="row">
          <button className="btn primary" disabled={busy || !c.url} onClick={test}>{t(busy ? 'Connecting…' : 'Test connection')}</button>
          {c.url !== DEFAULT_URL && <button className="btn" disabled={busy} onClick={() => save({ url: DEFAULT_URL })}>{t('Use this computer')}</button>}
        </div>
        {status && <p className={`small ${status.ok ? 'ok-text' : 'error-text'}`}>{status.text}</p>}
        <details>
          <summary className="small">{t('How to set it up')}</summary>
          <div className="help small">
            {t('1. Install Ollama on your computer and download a model, for example:')}{'\n'}<code>ollama pull gemma4:e4b</code>{'\n'}
            {t('2. On the same computer keep the address http://localhost:11434 and tap Test connection.')}{'\n'}
            {web && <>{t('3. In the browser, allow this site once in PowerShell, then quit and restart Ollama:')}{'\n'}<code>setx OLLAMA_ORIGINS "{location.origin}"</code>{'\n'}</>}
            {t('From a phone: on the laptop run the line below and restart Ollama, allow it in Windows Firewall, then type the laptop\'s Wi-Fi address here, like http://192.168.1.5:11434 (ipconfig shows it as IPv4). Both must be on the same Wi-Fi. Use the Android app for this; the web page can only reach localhost.')}{'\n'}<code>setx OLLAMA_HOST "0.0.0.0"</code>
          </div>
        </details>
        <h2>{t('My voice (personal)')}</h2>
        <p className="muted small">{t('Dub videos in your own voice with your voice cloning server (a free Hugging Face Space). Your voice sample is sent to that server, so this needs internet.')}</p>
        <Toggle label="Use voice cloning" value={vc.on} onChange={(on) => saveVc({ on })} />
        <label className="field-label" htmlFor="vc-url">{t('Voice cloning server URL')}</label>
        <input id="vc-url" className="text-input" inputMode="url" value={vc.url} placeholder="username/apana-voice-clone" spellCheck={false}
          onChange={(e) => saveVc({ url: e.target.value.trim() })} />
        <div className="row">
          <button className="btn primary" disabled={busy || !vc.url} onClick={testVc}>{t(busy ? 'Connecting…' : 'Test connection')}</button>
        </div>
        {vcStatus && <p className={`small ${vcStatus.ok ? 'ok-text' : 'error-text'}`}>{vcStatus.text}</p>}
        <button className="btn" disabled={busy} onClick={onClose}>{t('Done')}</button>
      </div>
    </div>
  )
}
