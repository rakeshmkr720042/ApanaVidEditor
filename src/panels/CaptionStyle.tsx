import { useEffect, useState } from 'react'
import type { Layer, TextLayer, WordFx, WordFxStyle } from '../types'
import type { Editor } from '../model/useEditor'
import { isSub } from '../model/useEditor'
import { CAPTION_LOOKS, splitShort, withEmoji, withoutEmoji } from '../lib/captions'
import { ensureFont, prefetchFonts } from '../engine/text'
import { Chips, ColorRow, Toggle } from '../ui/kit'
import { t } from '../lib/i18n'

const WORD_STYLES: { value: WordFxStyle | ''; label: string }[] = [
  { value: '', label: 'Off' },
  { value: 'color', label: 'Colour' },
  { value: 'box', label: 'Box' },
  { value: 'pop', label: 'Pop' },
  { value: 'karaoke', label: 'Karaoke' },
  { value: 'reveal', label: 'Word by word' },
  { value: 'one', label: 'One word' },
]

/**
 * Trending caption looks and word-by-word highlight. For subtitles every change goes to all of them (captions
 * should match); for other text, to that text only.
 */
export function CaptionStyle({ ed, layer }: { ed: Editor; layer: TextLayer }) {
  const subs = layer.subtitle
  const [, fontsReady] = useState(0)
  useEffect(() => { prefetchFonts().then(() => fontsReady((n) => n + 1)) }, [])
  const match = (l: Layer) => (subs ? isSub(l) : l.id === layer.id)
  const update = (fn: (l: TextLayer) => Partial<TextLayer>) => ed.updateLayers(match, (l) => fn(l as TextLayer))
  const fx = layer.words ?? null
  const setFx = (patch: Partial<WordFx> | null) => update((l) => ({ words: patch === null ? null : { style: 'color', color: '#ffe600', ...l.words, ...patch } }))
  const count = subs ? ed.project.layers.filter(isSub).length : 1

  const split = (max: number) => {
    const p = ed.project
    const { remove, add } = splitShort(p.layers.filter(isSub), max)
    if (!add.length) return
    ed.replaceProject({ ...p, layers: [...p.layers.filter((l) => !remove.has(l.id)), ...add] })
    ed.setSel({ type: 'layer', id: add[0].id })
  }

  return (
    <>
      <span className="field-label">{t('Trending looks')}</span>
      <div className="preset-grid caption-looks">
        {CAPTION_LOOKS.map((look) => (
          <button
            key={look.name}
            className={look.words?.style === fx?.style && look.style.font === layer.style.font ? 'on' : ''}
            onPointerEnter={() => look.style.font && ensureFont(look.style.font)}
            onClick={() => {
              if (look.style.font) ensureFont(look.style.font)
              update((l) => ({
                style: { ...l.style, ...look.style, size: look.size ?? (l.words?.style === 'one' ? 0.055 : l.style.size) },
                words: look.words && { ...look.words },
              }))
            }}
            style={{
              fontFamily: `"${look.style.font}"`, color: look.style.color, background: look.style.background ?? 'var(--panel-2)',
              WebkitTextStroke: look.style.stroke ? `1px ${look.style.stroke}` : undefined, textShadow: look.style.glow ? `0 0 8px ${look.style.glow}` : undefined,
            }}
          >
            {look.words?.caps ? t(look.name).toLocaleUpperCase() : t(look.name)}
            {look.words && <i className="look-dot" style={{ background: look.words.color }} />}
          </button>
        ))}
      </div>
      <span className="field-label">{t('Highlight the word being said')}</span>
      <Chips options={WORD_STYLES} value={fx?.style ?? ''} onChange={(v) => setFx(v ? { style: v as WordFxStyle } : null)} wrap />
      {fx && (
        <>
          <span className="field-label">{t('Highlight colour')}</span>
          <ColorRow value={fx.color} onChange={(c) => setFx({ color: c ?? '#ffe600' })} />
          <div className="row-toggles">
            <Toggle label="CAPITALS" value={!!fx.caps} onChange={(caps) => setFx({ caps })} />
          </div>
          <p className="muted small">{t('Word timing follows each caption\'s length. If a word lights up early or late, drag the caption\'s ends on the timeline.')}</p>
        </>
      )}
      {subs && (
        <>
          <span className="field-label">{t('Short captions')}</span>
          <div className="row">
            {[2, 3, 4].map((n) => (
              <button key={n} className="btn small" onClick={() => split(n)}>{n} {t('words a screen')}</button>
            ))}
          </div>
          <span className="field-label">{t('Emojis')}</span>
          <div className="row">
            <button className="btn small" onClick={() => update((l) => ({ text: withEmoji(l.text) }))}>😀 {t('Add matching emojis')}</button>
            <button className="btn small" onClick={() => update((l) => ({ text: withoutEmoji(l.text) }))}>{t('Remove emojis')}</button>
          </div>
          <p className="muted small">{`${t('Changes go to all')} ${count} ${t('captions')}`}</p>
        </>
      )}
    </>
  )
}
