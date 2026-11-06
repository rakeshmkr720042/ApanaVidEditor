import { lazy, Suspense, useEffect, useState } from 'react'
import { desktop } from '../lib/desktop'
import { getLang } from '../lib/i18n'
import { Icon } from '../components/Icon'
import { HELP_EVENT } from './open'

// The guide's text (both languages) loads only when it is first opened.
const HelpSheet = lazy(() => import('./HelpSheet'))

/**
 * Always mounted. Opens the User guide on openHelp(), F1, or Help → User guide in the Windows menu.
 * After "Show me" the guide steps aside, and a small button brings it back on the same topic.
 */
export function HelpHost() {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState<string | null>(null)
  const [aside, setAside] = useState(false)

  useEffect(() => {
    const show = (id: string | null) => { setTopic(id); setAside(false); setOpen(true) }
    const onEvent = (e: Event) => show((e as CustomEvent<string | null>).detail ?? null)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'F1') { e.preventDefault(); show(null) } }
    window.addEventListener(HELP_EVENT, onEvent)
    window.addEventListener('keydown', onKey)
    const off = desktop?.onHelp?.((id) => show(id ?? null))
    return () => { window.removeEventListener(HELP_EVENT, onEvent); window.removeEventListener('keydown', onKey); off?.() }
  }, [])

  // the "back to the guide" button goes away by itself
  useEffect(() => {
    if (!aside) return
    const id = setTimeout(() => setAside(false), 15000)
    return () => clearTimeout(id)
  }, [aside])

  return (
    <>
      {open && (
        <Suspense fallback={null}>
          <HelpSheet start={topic} onClose={() => setOpen(false)}
            onAside={(id) => { setTopic(id); setOpen(false); setAside(true) }} />
        </Suspense>
      )}
      {aside && !open && (
        <button className="help-return" onClick={() => { setAside(false); setOpen(true) }} data-testid="help-return">
          <Icon name="book" size={16} /> {getLang() === 'hi' ? 'गाइड पर वापस' : 'Back to the guide'}
        </button>
      )}
    </>
  )
}
