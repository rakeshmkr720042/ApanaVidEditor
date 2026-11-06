import type { HelpFind } from './types'

/** The CSS selector a "Show me" points at. */
export function selectorOf(f: HelpFind) {
  if (f.selector) return f.selector
  if (f.tool) return `[data-tool="${CSS.escape(f.tool)}"]`
  return null
}

/** The first matching element that is on screen (not hidden). */
export function findTarget(f: HelpFind): HTMLElement | null {
  const sel = selectorOf(f)
  if (!sel) return null
  for (const el of document.querySelectorAll<HTMLElement>(sel)) {
    if (el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden') return el
  }
  return null
}

let current: (() => void) | null = null

/**
 * Scrolls the element into view and draws a pulsing ring with a label around it for a few seconds.
 * The ring is its own fixed layer, so a scrolling toolbar or a clipped panel cannot hide it.
 */
export function spotlight(el: HTMLElement, label: string, ms = 4500) {
  current?.()
  el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  const ring = document.createElement('div')
  ring.className = 'help-spot'
  ring.setAttribute('aria-hidden', 'true')
  const tag = document.createElement('div')
  tag.className = 'help-spot-tag'
  tag.textContent = label
  document.body.append(ring, tag)
  let raf = 0
  const place = () => {
    const r = el.getBoundingClientRect()
    const pad = 6
    Object.assign(ring.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` })
    const above = r.top > 60
    const x = Math.min(Math.max(8, r.left + r.width / 2), innerWidth - 8)
    Object.assign(tag.style, { left: `${x}px`, top: above ? `${r.top - pad - 8}px` : `${r.bottom + pad + 8}px` })
    tag.classList.toggle('below', !above)
    raf = requestAnimationFrame(place)
  }
  place()
  const done = () => {
    cancelAnimationFrame(raf)
    ring.remove(); tag.remove()
    clearTimeout(timer)
    removeEventListener('pointerdown', done, true)
    if (current === done) current = null
  }
  const timer = setTimeout(done, ms)
  // any tap ends it (and still reaches the button underneath)
  setTimeout(() => addEventListener('pointerdown', done, true), 300)
  current = done
}
