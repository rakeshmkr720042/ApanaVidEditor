import { useEffect, useState } from 'react'
import type { Editor } from '../model/useEditor'
import { Chips, Panel } from '../ui/kit'
import { t } from '../lib/i18n'
import { uid } from '../lib/format'
import { fmtTime } from '../lib/format'
import { deleteTemplate, listTemplates, saveMedia, saveTemplate, type TemplateRecord } from '../lib/db'
import { getDefaultTemplate, placeTemplate, setDefaultTemplate, templateMedia, type TemplateKind } from '../lib/templates'
import { TemplateBuilder } from '../components/TemplateBuilder'

interface Props { ed: Editor; onClose: () => void; onToast: (msg: string) => void }

/** Saved intro/outro screens: make one once, then add it to any video with one tap. */
export function TemplatesPanel({ ed, onClose, onToast }: Props) {
  const [list, setList] = useState<TemplateRecord[] | null>(null)
  const [kind, setKind] = useState<TemplateKind>('intro')
  const [builder, setBuilder] = useState<{ editing: TemplateRecord | null } | null>(null)
  const [defaults, setDefaults] = useState({ intro: getDefaultTemplate('intro'), outro: getDefaultTemplate('outro') })
  const refresh = () => listTemplates().then(setList, () => setList([]))
  useEffect(() => { refresh() }, [])

  const apply = async (tpls: { tpl: TemplateRecord; where: 'start' | 'end' }[]) => {
    let p = ed.project
    for (const { tpl, where } of tpls) {
      const out = placeTemplate(p, tpl, where)
      for (const s of out.sources) { ed.addSource(s); await saveMedia(s) }
      p = out.project
    }
    ed.replaceProject(p)
    onToast(tpls.length > 1 ? t('Intro and outro added') : tpls[0].where === 'start' ? t('Added at the start') : t('Added at the end'))
  }

  const remove = async (tpl: TemplateRecord) => {
    if (!confirm(`${t('Delete template')} "${tpl.name}"?`)) return
    await deleteTemplate(tpl.id)
    if (defaults[tpl.kind] === tpl.id) toggleDefault(tpl)
    refresh()
  }

  const toggleDefault = (tpl: TemplateRecord) => {
    const id = defaults[tpl.kind] === tpl.id ? null : tpl.id
    setDefaultTemplate(tpl.kind, id)
    setDefaults((d) => ({ ...d, [tpl.kind]: id }))
  }

  const saveCurrent = async () => {
    const p = ed.project
    const name = prompt(t('Template name'), kind === 'intro' ? t('My intro') : t('My outro'))
    if (!name?.trim()) return
    const first = p.clips[0]
    await saveTemplate({
      id: uid(), name: name.trim(), kind, updatedAt: Date.now(), duration: ed.layout.total,
      thumb: first ? ed.sources[first.sourceId]?.thumbs[0] ?? null : null,
      clips: p.clips, layers: p.layers, media: templateMedia(p.clips, p.layers, ed.sources),
    })
    onToast(t('Saved as a template'))
    refresh()
  }

  const shown = list?.filter((x) => x.kind === kind) ?? []
  const defIntro = list?.find((x) => x.id === defaults.intro)
  const defOutro = list?.find((x) => x.id === defaults.outro)

  return (
    <>
      <Panel title="Intro & Outro" onClose={onClose} tall actions={<button className="btn small" onClick={() => setBuilder({ editing: null })}>+ {t('New')}</button>}>
        {(defIntro || defOutro) && (
          <button className="btn primary wide tpl-quick" onClick={() => apply([
            ...(defIntro ? [{ tpl: defIntro, where: 'start' as const }] : []),
            ...(defOutro ? [{ tpl: defOutro, where: 'end' as const }] : []),
          ])}>
            ★ {defIntro && defOutro ? t('Add my intro + outro') : defIntro ? t('Add my intro') : t('Add my outro')}
          </button>
        )}
        <Chips options={[{ value: 'intro', label: '▶ Intro' }, { value: 'outro', label: '⏹ Outro' }]} value={kind} onChange={setKind} />
        {list && !shown.length && (
          <p className="muted small">
            {kind === 'intro'
              ? t('Make your channel intro once (name, logo, music) and add it to any video with one tap.')
              : t('Make an end screen once (subscribe button, next video) and add it to any video with one tap.')}
          </p>
        )}
        <div className="tpl-list">
          {shown.map((tpl) => (
            <div key={tpl.id} className="tpl-card">
              <div className="tpl-thumb">{tpl.thumb ? <img src={tpl.thumb} alt="" /> : null}<span>{fmtTime(tpl.duration)}</span></div>
              <div className="tpl-info">
                <b>{tpl.name}</b>
                <div className="row">
                  <button className="btn small" onClick={() => apply([{ tpl, where: 'start' }])}>⇤ {t('Start')}</button>
                  <button className="btn small" onClick={() => apply([{ tpl, where: 'end' }])}>{t('End')} ⇥</button>
                  <button className={`btn small${defaults[tpl.kind] === tpl.id ? ' primary' : ''}`} title={t('Use as my default')} onClick={() => toggleDefault(tpl)}>★</button>
                  {tpl.design ? <button className="btn small" aria-label="Edit" onClick={() => setBuilder({ editing: tpl })}>✎</button> : null}
                  <button className="btn small ghost" aria-label="Delete" onClick={() => remove(tpl)}>🗑</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button className="btn wide" disabled={!ed.project.clips.length} onClick={saveCurrent}>{t('Save this video as a template')}</button>
      </Panel>
      {builder && (
        <TemplateBuilder project={ed.project} sources={ed.sources} kind={kind} editing={builder.editing}
          onClose={() => setBuilder(null)}
          onSave={async (tpl) => { await saveTemplate(tpl); setKind(tpl.kind); await refresh(); onToast(t('Template saved')) }} />
      )}
    </>
  )
}
