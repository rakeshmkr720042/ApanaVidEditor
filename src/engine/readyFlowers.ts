import type { BloomPhotos } from '../types'

/**
 * Ready-made real flower photos that ship with the app (public/flowers/<flower>/), so a real-photo bloom works
 * without the user's own photos. A bloom points at them with ids like 'ready:rose:bud' instead of media file ids;
 * they are not project media (never missing, never copied into a project file).
 * The rose, lotus, sakura and marigold photos were made by the app's owner for the app.
 */
const PREFIX = 'ready:'
export const isReadyPhoto = (id: string | null | undefined): boolean => !!id && id.startsWith(PREFIX)

/** The web address of a ready photo. */
export function readyUrl(id: string): string {
  const [flower, stage] = id.slice(PREFIX.length).split(':')
  const base = import.meta.env.BASE_URL
  return new URL(`${base}flowers/${flower}/${stage}.webp`, location.href).href
}

/** The ready photo sets: closed bud, opening bud, half open, fully open, and a garden behind them. */
export const READY_PHOTOS: Partial<Record<string, BloomPhotos>> = {
  rose: { bud: 'ready:rose:bud', half: 'ready:rose:half', open: 'ready:rose:open', full: 'ready:rose:full', garden: 'ready:rose:garden' },
  lotus: { bud: 'ready:lotus:bud', half: 'ready:lotus:half', open: null, full: 'ready:lotus:full' },
  sakura: { bud: 'ready:sakura:bud', half: 'ready:sakura:half', open: 'ready:sakura:open', full: 'ready:sakura:full' },
  marigold: { bud: 'ready:marigold:bud', half: null, open: 'ready:marigold:open', full: 'ready:marigold:full' },
}
export const readyPhotosOf = (flower: string): BloomPhotos | null => READY_PHOTOS[flower] ?? null
/** True when every photo of a bloom is one of the ready ones. */
export const usesReadyPhotos = (p: BloomPhotos | null | undefined) => !!p && isReadyPhoto(p.bud) && [p.bud, p.half, p.open, p.full].every((id) => !id || isReadyPhoto(id))

/** Decodes a ready photo (works in the page and in a worker). */
export async function loadReadyPhoto(id: string): Promise<ImageBitmap> {
  const r = await fetch(readyUrl(id))
  if (!r.ok) throw new Error(`ready photo ${id}: ${r.status}`)
  return createImageBitmap(await r.blob())
}
