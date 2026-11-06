// Crash-safe editing: remembers which project is open, so after a crash (or the phone closing the
// app for memory) the Home screen can offer to open it again. The project itself is autosaved.
const KEY = 'open-project'

export interface OpenMark { id: string; name: string; at: number }

export function markOpen(id: string, name: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ id, name, at: Date.now() } satisfies OpenMark)) } catch { /* storage off */ }
}

/** The editor was left the normal way (Back): nothing to recover. */
export function markClosed(id: string) {
  try { if ((JSON.parse(localStorage.getItem(KEY) ?? 'null') as OpenMark | null)?.id === id) localStorage.removeItem(KEY) } catch { /* storage off */ }
}

/** The project that was open when the app last closed, or null. */
export function wasOpen(): OpenMark | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as OpenMark | null
    return v && typeof v.id === 'string' && Date.now() - v.at < 14 * 864e5 ? v : null
  } catch { return null }
}

export function forgetOpen() {
  try { localStorage.removeItem(KEY) } catch { /* storage off */ }
}
