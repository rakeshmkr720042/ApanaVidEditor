import { useEffect, useMemo, useState } from 'react'
import type { MediaSource, Project, TextLayer } from '../types'
import type { Editor } from '../model/useEditor'
import { DEFAULT_CUT, findCuts, findMoments, pickWithAI, soundMap, type CutSettings, type FoundCut, type Moment, type SoundMap } from '../engine/smartcut'
import { findSpots } from '../engine/spots'
import { allPieces, applyCuts, cutShort, punchIn, type SpotAt } from '../model/smartcut'
import { warn } from '../lib/blackbox'
import { localAI } from '../lib/localai'
import { offerAISetup } from '../lib/aisetup'
import { fmtTime } from '../lib/format'
import { Chips, Panel, Slider, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

type Tab = 'cut' | 'zoom' | 'shorts'
const LENGTHS = [15, 30, 60, 90]
const keyOf = (c: FoundCut) => `${c.clipId}:${c.from.toFixed(2)}`
const SETTINGS_KEY = 'smart-cut'

function loadSettings(): CutSettings & { zoom: number; punch: boolean } {
  try { return { ...DEFAULT_CUT, zoom: 1.2, punch: false, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') } } catch { return { ...DEFAULT_CUT, zoom: 1.2, punch: false } }
}

/** The video sources the main video plays, with the part of each that is used. */
function mainSources(p: Project, sources: Record<string, MediaSource>) {
  const ranges: Record<string, [number, number]> = {}
  for (const c of p.clips) {
    const s = sources[c.sourceId]
    if (!s || s.kind === 'image') continue
    const r = ranges[s.id]
    ranges[s.id] = r ? [Math.min(r[0], c.in), Math.max(r[1], c.out)] : [c.in, c.out]
  }
  return { list: Object.keys(ranges).map((id) => sources[id]), ranges }
}

/**
 * Smart cut: takes the pauses and "umm / aaa" out of talking videos, punch-in zooms on the cuts, and finds the
 * best moments of a long video to make Shorts from.
 */
export function SmartCutPanel({ ed, onToast, onSeek, onShort, onClose }: {
  ed: Editor; onToast: (s: string) => void; onSeek: (t: number) => void; onShort: (p: Project, label: string) => void; onClose: () => void
}) {
  const [tab, setTab] = useState<Tab>('cut')
  const [s, setS] = useState(loadSettings)
  const set = (patch: Partial<typeof s>) => {
    if (['minPause', 'pad', 'level', 'fillers'].some((k) => k in patch)) { setOff(new Set()); setDone(null) }
    setS((o) => { const n = { ...o, ...patch }; try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(n)) } catch { /* private mode */ } return n })
  }
  const [maps, setMaps] = useState<Record<string, SoundMap | null> | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [off, setOff] = useState<Set<string>>(new Set())
  const [len, setLen] = useState(30)
  const [moments, setMoments] = useState<Moment[] | null>(null)
  const [useAI, setUseAI] = useState(false)
  const main = useMemo(() => mainSources(ed.project, ed.sources), [ed.project, ed.sources])
  const hasSubs = ed.project.layers.some((l): l is TextLayer => l.type === 'text' && l.subtitle)
  const ai = !!localAI()
  useEffect(() => { void offerAISetup() }, [])

  const listen = async () => {
    if (maps) return maps
    if (!main.list.length) { onToast(t('Add a video with sound first')); return null }
    const out: Record<string, SoundMap | null> = {}
    for (let i = 0; i < main.list.length; i++) {
      setBusy(`${t('Listening to the sound…')} ${i + 1}/${main.list.length}`)
      out[main.list[i].id] = await soundMap(main.list[i], (q) => setBusy(`${t('Listening to the sound…')} ${Math.round(((i + q) / main.list.length) * 100)}%`))
    }
    setBusy(null)
    setMaps(out)
    if (!Object.values(out).some(Boolean)) onToast(t('No sound found in the main video'))
    return out
  }

  // the cuts follow the settings straight away once the sound has been read
  const cuts = useMemo(() => (maps ? findCuts(ed.project, ed.sources, maps, s) : null), [maps, ed.project, ed.sources, s])
  const chosen = cuts?.filter((c) => !off.has(keyOf(c))) ?? []
  const saved = chosen.reduce((a, c) => a + c.len, 0)
  const pauses = chosen.filter((c) => c.kind === 'pause').length, fillers = chosen.length - pauses

  // finding the face needs the AI cutout model; if it can't run here (old phone, out of memory), frame the centre
  const spotsFor = (pct: string): Promise<SpotAt> => findSpots(main.list, main.ranges, (q) => setBusy(`${t(pct)} ${Math.round(q * 100)}%`))
    .catch((e) => { warn('Face finding failed, using the centre', e); return () => null })

  const cut = async () => {
    if (!chosen.length) return
    let { project, pieces } = applyCuts(ed.project, chosen)
    if (s.punch) {
      const spotAt = await spotsFor('Finding the face…')
      const ids = allPieces(pieces.filter((ps) => ps.length > 1))
      project = { ...project, clips: punchIn(project.clips, ids, ed.sources, s.zoom, spotAt) }
      setBusy(null)
    }
    ed.replaceProject(project)
    const msg = `✅ ${t('Cut')} ${chosen.length} · ${fmtTime(saved)} ${t('shorter. Undo takes it back.')}`
    setDone(msg)
    onToast(msg)
  }

  const zoomAll = async () => {
    const ids = new Set(ed.project.clips.filter((c) => ed.sources[c.sourceId]?.kind === 'video').map((c) => c.id))
    if (ids.size < 2) { onToast(t('Needs at least 2 video clips (cut the video first)')); return }
    const spotAt = await spotsFor('Finding the face…')
    setBusy(null)
    ed.replaceProject({ ...ed.project, clips: punchIn(ed.project.clips, ids, ed.sources, s.zoom, spotAt) })
    onToast(t('Every other clip is zoomed in. Undo takes it back.'))
  }

  const findBest = async () => {
    const m = await listen()
    if (!m) return
    let list: Moment[] | null = null
    if (useAI && ai && hasSubs) {
      setBusy(t('Local AI is choosing…'))
      list = await pickWithAI(ed.project, m, len).catch(() => null)
      if (!list) onToast(t('Local AI could not choose; picked by the sound instead'))
    }
    list ??= findMoments(ed.project, m, len)
    setBusy(null)
    setMoments(list)
    if (!list.length) onToast(t('The video is too short for a Short'))
  }

  const makeShort = async (mo: Moment, i: number) => {
    const spotAt = await spotsFor('Framing the person…')
    setBusy(null)
    onShort(cutShort(ed.project, mo.from, mo.to, ed.sources, spotAt), `${t('Short')} ${i + 1}`)
  }

  return (
    <Panel title="Smart cut" onClose={onClose} tall>
      <Chips options={[{ value: 'cut', label: 'Cut pauses' }, { value: 'zoom', label: 'Punch-in zoom' }, { value: 'shorts', label: 'Make Shorts' }]} value={tab} onChange={setTab} />
      {busy && <p className="muted small">{busy}</p>}

      {tab === 'cut' && (
        <>
          <p className="muted small">{t('Takes out the quiet parts between sentences, for a fast talking-head video. The sound is checked on this device.')}</p>
          <Slider label="Shortest pause to cut" min={0.3} max={2} step={0.1} value={s.minPause} format={(v) => `${v.toFixed(1)} s`} onChange={(minPause) => set({ minPause })} />
          <Slider label="Keep next to words" min={0.05} max={0.4} step={0.05} value={s.pad} format={(v) => `${v.toFixed(2)} s`} onChange={(pad) => set({ pad })} />
          <Slider label="What counts as quiet" min={0} max={1} value={s.level} format={(v) => (v < 0.34 ? t('Only silence') : v < 0.67 ? t('Normal') : t('Soft sounds too'))} onChange={(level) => set({ level })} />
          <Toggle label="Also cut umm / aaa sounds (beta)" value={s.fillers} onChange={(fillers) => set({ fillers })} />
          <Toggle label="Punch-in zoom on every other cut" value={s.punch} onChange={(punch) => set({ punch })} />
          {s.punch && <Slider label="Zoom" min={1.1} max={1.5} step={0.05} value={s.zoom} format={(v) => `${Math.round(v * 100)}%`} onChange={(zoom) => set({ zoom })} />}
          {!cuts
            ? <button className="btn" disabled={!!busy || !ed.project.clips.length} onClick={listen}>🔍 {t('Find pauses')}</button>
            : (
              <>
                <p className="small">
                  {done && !chosen.length ? done : chosen.length
                    ? `${pauses} ${t('pauses')}${s.fillers ? `, ${fillers} ${t('umm sounds')}` : ''} · ${fmtTime(ed.layout.total)} → ${fmtTime(ed.layout.total - saved)}`
                    : t('No pauses found with these settings.')}
                </p>
                {cuts.length > 0 && (
                  <div className="sc-list">
                    {cuts.slice(0, 200).map((c) => {
                      const k = keyOf(c)
                      return (
                        <label key={k} className={`sc-row${c.kind === 'filler' ? ' filler' : ''}`}>
                          <input type="checkbox" checked={!off.has(k)} onChange={(e) => setOff((o) => { const n = new Set(o); if (e.target.checked) n.delete(k); else n.add(k); return n })} />
                          <button className="link" onClick={(e) => { e.preventDefault(); onSeek(Math.max(0, c.t - 1)) }}>{fmtTime(c.t)}</button>
                          <span>{c.kind === 'filler' ? (c.text ? `“${c.text}”` : t('umm / aaa')) : t('pause')}</span>
                          <span className="muted">{c.len.toFixed(1)} s</span>
                        </label>
                      )
                    })}
                    {cuts.length > 200 && <p className="muted small">+{cuts.length - 200}</p>}
                  </div>
                )}
                <button className="btn primary" disabled={!chosen.length || !!busy} onClick={cut}>✂️ {t('Cut them')} ({chosen.length})</button>
                <p className="muted small">{t('Tap a time to hear it first. Captions and text move with the words.')}</p>
              </>
            )}
        </>
      )}

      {tab === 'zoom' && (
        <>
          <p className="muted small">{t('Zooms in on every other clip, on the face, so each cut looks like a second camera (jump-cut zoom). Cut the pauses first for many cuts.')}</p>
          <Slider label="Zoom" min={1.1} max={1.5} step={0.05} value={s.zoom} format={(v) => `${Math.round(v * 100)}%`} onChange={(zoom) => set({ zoom })} />
          <button className="btn" disabled={!!busy} onClick={zoomAll}>🔎 {t('Zoom every other clip')}</button>
        </>
      )}

      {tab === 'shorts' && (
        <>
          <p className="muted small">{t('Finds the liveliest parts of a long video and makes each one a 9:16 Short (a new project), framed on the person. Captions come along.')}</p>
          <span className="field-label">{t('Length')}</span>
          <Chips options={LENGTHS.map((v) => ({ value: v, label: `${v} s` }))} value={len} onChange={(v) => { setLen(v); setMoments(null) }} />
          {ai && hasSubs && <Toggle label="Let Local AI choose (reads the captions)" value={useAI} onChange={setUseAI} />}
          {!hasSubs && <p className="muted small">{t('Tip: make captions first (Subtitles) so the moments show what is said.')}</p>}
          <button className="btn" disabled={!!busy || !ed.project.clips.length} onClick={findBest}>✨ {t('Find best moments')}</button>
          {moments?.map((m, i) => (
            <div key={`${m.from}`} className="sc-moment">
              <div className="row">
                <b>{t('Short')} {i + 1}</b>
                <span className="muted small">{fmtTime(m.from)} – {fmtTime(m.to)} · {Math.round(m.to - m.from)} s{m.byAI ? ' · AI' : ''}</span>
              </div>
              {m.text && <p className="small sc-text">{m.text.length > 140 ? `${m.text.slice(0, 140)}…` : m.text}</p>}
              <div className="row">
                <button className="btn small" onClick={() => onSeek(m.from)}>▶ {t('Watch')}</button>
                <button className="btn small primary" disabled={!!busy} onClick={() => makeShort(m, i)}>📱 {t('Make Short')}</button>
              </div>
            </div>
          ))}
        </>
      )}
    </Panel>
  )
}
