// Bare browser globals so app modules can be imported in Node (nothing here is used by the code under test).
const g = globalThis as Record<string, unknown>
const store = new Map<string, string>()
g.window ??= g
g.localStorage ??= { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) }
g.document ??= { baseURI: 'http://localhost/', createElement: () => ({ getContext: () => null, style: {} }), addEventListener() {}, fonts: { add() {} } }
