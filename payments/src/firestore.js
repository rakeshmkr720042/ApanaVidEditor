// A tiny Firestore REST client: read documents and commit writes in a transaction.
import { HttpError } from './util.js'

export function toValue(v) {
  if (v === null || v === undefined) return { nullValue: null }
  if (v instanceof Date) return { timestampValue: v.toISOString() }
  if (typeof v === 'boolean') return { booleanValue: v }
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }
  if (typeof v === 'string') return { stringValue: v }
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } }
  return { mapValue: { fields: toFields(v) } }
}
export const toFields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, toValue(v)]))

/** Timestamps come back as Date. */
export function fromValue(v) {
  if ('nullValue' in v) return null
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return v.doubleValue
  if ('stringValue' in v) return v.stringValue
  if ('timestampValue' in v) return new Date(v.timestampValue)
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue)
  if ('mapValue' in v) return fromFields(v.mapValue.fields ?? {})
  return null
}
export const fromFields = (f) => Object.fromEntries(Object.entries(f ?? {}).map(([k, v]) => [k, fromValue(v)]))

/**
 * @param o.projectId Firebase project
 * @param o.token () => Promise<string> access token ('owner' on the emulator)
 * @param o.base  REST root, e.g. https://firestore.googleapis.com/v1 or http://127.0.0.1:8080/v1
 */
export function firestore({ projectId, token, base = 'https://firestore.googleapis.com/v1', fetchFn = fetch }) {
  const root = `projects/${projectId}/databases/(default)/documents`
  const name = (path) => `${root}/${path}`
  async function call(method, url, body) {
    const res = await fetchFn(`${base}/${url}`, {
      method,
      headers: { authorization: `Bearer ${await token()}`, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 404 && method === 'GET') return null
    const j = await res.json().catch(() => ({}))
    if (!res.ok) {
      const status = j.error?.status
      const e = new HttpError(status === 'ABORTED' ? 409 : 503, status === 'ABORTED' ? 'busy' : 'db', 'Database error')
      e.detail = j.error?.message
      throw e
    }
    return j
  }
  const docData = (d) => (d ? fromFields(d.fields) : null)

  return {
    name,
    async get(path) { return docData(await call('GET', name(path))) },
    /** Runs fn(tx) and commits its writes atomically; retries when another write got there first. */
    async transaction(fn) {
      for (let attempt = 0; ; attempt++) {
        const { transaction } = await call('POST', `${root}:beginTransaction`, { options: { readWrite: {} } })
        const writes = []
        const tx = {
          async getAll(...paths) {
            const out = await call('POST', `${root}:batchGet`, { documents: paths.map(name), transaction })
            const byName = new Map(out.map((r) => (r.found ? [r.found.name, docData(r.found)] : [r.missing, null])))
            return paths.map((p) => byName.get(name(p)) ?? null)
          },
          /** Changes only these fields; the document must exist. */
          update(path, data, serverTime = []) {
            writes.push({ update: { name: name(path), fields: toFields(data) }, updateMask: { fieldPaths: Object.keys(data) }, currentDocument: { exists: true }, updateTransforms: serverTime.map((f) => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })) })
          },
          /** A new document; fails if it is already there. */
          create(path, data, serverTime = []) {
            writes.push({ update: { name: name(path), fields: toFields(data) }, currentDocument: { exists: false }, updateTransforms: serverTime.map((f) => ({ fieldPath: f, setToServerValue: 'REQUEST_TIME' })) })
          },
        }
        let result
        try {
          result = await fn(tx)
          await call('POST', `${root}:commit`, { writes, transaction })
          return result
        } catch (e) {
          await call('POST', `${root}:rollback`, { transaction }).catch(() => { /* already ended */ })
          if (e.code !== 'busy' || attempt >= 4) throw e
        }
      }
    },
    async create(path, data, serverTime = []) {
      return this.transaction(async (tx) => { tx.create(path, data, serverTime) })
    },
  }
}
