import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FONT_INFO, ensureFont, isDevanagari, type FontKind } from '../engine/text'
import { convertWordBeforeCaret, hasLatinWords, hinglishWord, toDevanagari, wordAtCaret } from '../lib/hinglish'
import { Chips } from '../ui/kit'
import { t } from '../lib/i18n'

const TYPING_KEY = 'hindi-typing'
const readTyping = () => { try { return localStorage.getItem(TYPING_KEY) === '1' } catch { return false } }

const MATRAS = ['ा', 'ि', 'ी', 'ु', 'ू', 'े', 'ै', 'ो', 'ौ', 'ं', 'ँ', '्', 'ः', 'ृ', '़', '।', '॥', '₹', 'ॐ']
const LETTERS = ['ट', 'ठ', 'ड', 'ढ', 'ण', 'ड़', 'ढ़', 'ष', 'ञ', 'ङ', 'ऋ', 'क्ष', 'त्र', 'ज्ञ', 'श्र', 'अं', 'अः']

/**
 * The text box with Hindi typing help: with "Hinglish → हिंदी" on, each word typed in English letters turns into
 * Hindi when the space after it is typed ("namaste " -> "नमस्ते "). A preview shows the word being typed, a key row
 * adds matras and letters that are hard to type, and "Convert all" changes the whole text in one go.
 * The phone's own Hindi keyboard works too: this only helps people who type Hindi in English letters.
 */
export function HindiTextInput({ value, onChange, placeholder, rows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [typing, setTyping] = useState(readTyping)
  const [keys, setKeys] = useState<'' | 'matra' | 'letters'>('')
  const [caret, setCaret] = useState(value.length)
  const pendingCaret = useRef<number | null>(null)

  useLayoutEffect(() => {
    const at = pendingCaret.current
    if (at === null || !ref.current) return
    pendingCaret.current = null
    ref.current.setSelectionRange(at, at)
  })

  const toggle = (on: boolean) => {
    setTyping(on)
    try { localStorage.setItem(TYPING_KEY, on ? '1' : '0') } catch { /* private mode */ }
  }

  const insert = (s: string) => {
    const el = ref.current
    const a = el?.selectionStart ?? value.length
    const b = el?.selectionEnd ?? value.length
    pendingCaret.current = a + s.length
    setCaret(a + s.length)
    onChange(value.slice(0, a) + s + value.slice(b))
    el?.focus()
  }

  const word = typing ? wordAtCaret(value, caret) : ''
  const preview = word ? hinglishWord(word) : ''

  return (
    <div className="hindi-input">
      <textarea
        ref={ref} className="text-input" value={value} autoFocus rows={rows} placeholder={placeholder} lang={typing || isDevanagari(value) ? 'hi' : undefined}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onChange={(e) => {
          const el = e.currentTarget
          let next = el.value
          let at = el.selectionStart
          // only on typing (not paste): convert the word that was just finished by a space, comma, full stop or new line
          const typed = (e.nativeEvent as InputEvent).inputType
          if (typing && (typed === 'insertText' || typed === 'insertLineBreak' || typed === undefined) && next.length === value.length + 1) {
            const c = convertWordBeforeCaret(next, at)
            if (c) { next = c.text; at = c.caret; pendingCaret.current = at }
          }
          setCaret(at)
          onChange(next)
        }}
      />
      <div className="hindi-bar">
        <label className="toggle hindi-toggle">
          <span>Hinglish → हिंदी</span>
          <input type="checkbox" checked={typing} onChange={(e) => toggle(e.target.checked)} />
          <i />
        </label>
        {preview && preview !== word && (
          <button className="btn small hindi-preview" title={t('Tap to put this Hindi word in now')} onClick={() => {
            const a = caret - word.length
            pendingCaret.current = a + preview.length
            setCaret(a + preview.length)
            onChange(value.slice(0, a) + preview + value.slice(caret))
            ref.current?.focus()
          }}>{preview}</button>
        )}
        <span className="grow" />
        <button className={`btn small${keys === 'matra' ? ' on' : ''}`} onClick={() => setKeys(keys === 'matra' ? '' : 'matra')} title={t('Matras')}>ा ि ्</button>
        <button className={`btn small${keys === 'letters' ? ' on' : ''}`} onClick={() => setKeys(keys === 'letters' ? '' : 'letters')} title={t('More Hindi letters')}>क्ष ड़</button>
        {hasLatinWords(value) && (
          <button className="btn small" onClick={() => { pendingCaret.current = null; onChange(toDevanagari(value)) }}>{t('Convert all to Hindi')}</button>
        )}
      </div>
      {typing && <p className="muted small">{t('Type Hindi in English letters, then a space: namaste → नमस्ते, aa = ा, ee = ी, oo = ू. Capitals inside a word give ट ड ण (kaaTa → काटा).')}</p>}
      {keys && (
        <div className="hindi-keys" lang="hi">
          {(keys === 'matra' ? MATRAS : LETTERS).map((k) => (
            <button key={k} onPointerDown={(e) => e.preventDefault()} onClick={() => insert(k)}>{k}</button>
          ))}
        </div>
      )}
    </div>
  )
}

const KIND_LABEL: Record<FontKind, string> = { simple: 'Simple', bold: 'Bold', stylish: 'Stylish', classic: 'Classic', hand: 'Handwritten' }
const KINDS: FontKind[] = ['simple', 'bold', 'stylish', 'classic', 'hand']
type Filter = 'hindi' | 'all' | 'english'
const fontsFor = (filter: Filter) => FONT_INFO.filter((f) => filter === 'all' || (filter === 'hindi' ? f.hindi : !f.hindi))

/** First line of the text, short, to show in each font; a Hindi + English sample when there is no text. */
function sampleOf(text: string, filter: Filter) {
  const line = text.split('\n').find((l) => l.trim())?.trim() ?? ''
  if (!line) return filter === 'english' ? 'Aa Bb' : 'नमस्ते Aa'
  return line.length > 16 ? line.slice(0, 15) + '…' : line
}

/**
 * Fonts grouped by look, each shown with the person's own words (live preview). Fonts marked अ have their own
 * Hindi letters (matras, half letters and joined letters come out right); the others show Hindi in Noto Sans Devanagari.
 */
export function FontPicker({ value, text, onPick }: { value: string; text: string; onPick: (family: string) => void }) {
  const hindiText = isDevanagari(text)
  const [filter, setFilter] = useState<Filter>(hindiText ? 'hindi' : 'all')
  const [, loaded] = useState(0)
  const shown = fontsFor(filter)
  useEffect(() => { Promise.all(fontsFor(filter).map((f) => ensureFont(f.family))).then(() => loaded((n) => n + 1)) }, [filter])
  const sample = sampleOf(text, filter)
  const current = FONT_INFO.find((f) => f.family === value)
  return (
    <>
      <Chips options={[{ value: 'hindi', label: 'हिंदी fonts' }, { value: 'all', label: 'All' }, { value: 'english', label: 'English only' }]} value={filter} onChange={(v) => setFilter(v as Filter)} />
      {hindiText && current && !current.hindi && (
        <p className="muted small hindi-warn">{t('This font has no Hindi letters, so the Hindi words show in Noto Sans Devanagari. Pick a font marked अ for a Hindi look.')}</p>
      )}
      {KINDS.map((k) => {
        const list = shown.filter((f) => f.kind === k)
        if (!list.length) return null
        return (
          <div key={k}>
            <span className="field-label">{t(KIND_LABEL[k])}</span>
            <div className="font-grid">
              {list.map((f) => (
                <button key={f.family} className={value === f.family ? 'on' : ''} lang={isDevanagari(sample) ? 'hi' : undefined}
                  style={{ fontFamily: `"${f.family}", "Noto Sans Devanagari", sans-serif` }}
                  onPointerEnter={() => ensureFont(f.family)} onClick={() => { ensureFont(f.family); onPick(f.family) }}>
                  <span className="font-sample">{sample}</span>
                  <small>{f.hindi && <b className="hindi-mark" title={t('Has Hindi letters')}>अ</b>}{f.family}</small>
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <p className="muted small">{t('All fonts are free to use in your videos (Open Font License) and work without internet.')}</p>
    </>
  )
}
