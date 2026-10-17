import { item, missingAnswer, type QuizDeck, type QuizItem, type QuizMode } from '../lib/quiz'
import { t } from '../lib/i18n'

const LETTERS = 'ABCDEF'
const MAX_OPTIONS = 6

/** A small list editor: questions with their options (tap a letter to mark the right one), or flashcards. */
export function QuizEditor({ deck, mode, onChange, onPick }: { deck: QuizDeck; mode: QuizMode; onChange: (d: QuizDeck) => void; onPick: (i: number) => void }) {
  const setItem = (id: string, patch: Partial<QuizItem>) => onChange({ ...deck, items: deck.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) })
  const removeOption = (it: QuizItem, k: number) => setItem(it.id, {
    options: it.options.filter((_, j) => j !== k),
    correct: it.correct === k ? -1 : it.correct > k ? it.correct - 1 : it.correct,
  })
  const add = () => {
    // a new multiple choice question starts with four empty options
    onChange({ ...deck, items: [...deck.items, item('', mode === 'quiz' ? ['', '', '', ''] : [])] })
    onPick(deck.items.length)
  }

  return (
    <div className="quiz-list">
      <input className="text-input quiz-title" value={deck.title} placeholder={t('Quiz title (optional)')}
        onChange={(e) => onChange({ ...deck, title: e.target.value })} />
      {deck.items.map((it, n) => (
        <div className="quiz-item" key={it.id} onFocus={() => onPick(n)}>
          <div className="quiz-q">
            <span className="quiz-num">{n + 1}</span>
            <textarea className="text-input" rows={2} value={it.q} placeholder={t(mode === 'cards' ? 'Front (question)' : 'Question')}
              onChange={(e) => setItem(it.id, { q: e.target.value })} />
            <button className="btn small ghost" onClick={() => onChange({ ...deck, items: deck.items.filter((x) => x.id !== it.id) })} aria-label="Remove">✕</button>
          </div>
          {mode === 'quiz' && it.options.map((o, k) => (
            <div className="quiz-opt" key={k}>
              <button className={`quiz-mark${k === it.correct ? ' on' : ''}`} onClick={() => setItem(it.id, { correct: k })}
                aria-label={`${LETTERS[k]}: ${t('Right answer')}`} title={t('Right answer')}>{k === it.correct ? '✓' : LETTERS[k]}</button>
              <input className="text-input" value={o} placeholder={`${t('Option')} ${LETTERS[k]}`}
                onChange={(e) => setItem(it.id, { options: it.options.map((x, j) => (j === k ? e.target.value : x)) })} />
              <button className="btn small ghost" onClick={() => removeOption(it, k)} aria-label="Remove">✕</button>
            </div>
          ))}
          {mode === 'quiz' && it.options.length < MAX_OPTIONS && (
            <button className="btn small ghost" onClick={() => setItem(it.id, { options: [...it.options, ''] })}>＋ {t('Option')}</button>
          )}
          {(mode === 'cards' || !it.options.length) && (
            <input className="text-input" value={it.answer} placeholder={(mode === 'cards' && it.correct >= 0 && it.options[it.correct]) || t(mode === 'cards' ? 'Back (answer)' : 'Answer')}
              onChange={(e) => setItem(it.id, { answer: e.target.value })} />
          )}
          <input className="text-input" value={it.explain} placeholder={t('Explanation (optional)')}
            onChange={(e) => setItem(it.id, { explain: e.target.value })} />
          {it.q.trim() && missingAnswer(it) && (
            <p className="small warn">{t(mode === 'quiz' && it.options.length ? 'Tap the letter of the right answer.' : 'Write the answer.')}</p>
          )}
        </div>
      ))}
      <button className="btn small" onClick={add}>＋ {t(mode === 'cards' ? 'Card' : 'Question')}</button>
    </div>
  )
}
