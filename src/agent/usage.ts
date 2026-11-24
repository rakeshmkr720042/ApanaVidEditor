/** How much the user's online AI was used this month (requests and tokens), kept on this device only. */
const KEY = 'agent-usage'
interface U { month: string; requests: number; input: number; output: number }
const month = () => new Date().toISOString().slice(0, 7)

export function usage(): U {
  try {
    const u = JSON.parse(localStorage.getItem(KEY) ?? 'null') as U | null
    if (u && u.month === month()) return u
  } catch { /* private mode */ }
  return { month: month(), requests: 0, input: 0, output: 0 }
}

export function addUsage(x?: { input: number; output: number }) {
  const u = usage()
  const next = { ...u, requests: u.requests + 1, input: u.input + (x?.input ?? 0), output: u.output + (x?.output ?? 0) }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* private mode */ }
}
