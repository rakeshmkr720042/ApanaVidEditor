import type { Bloom, MediaSource } from '../types'
import { readyPhotosOf, usesReadyPhotos } from '../engine/readyFlowers'
import { isAllowed } from '../lib/premium'
import { flowerInfo, type FlowerKind } from '../engine/bloom'

/** Rose is free; the other bloom flowers need Pro (feature 'nature') when the lock is on. */
export const bloomLocked = (k: FlowerKind) => !flowerInfo(k).free && !isAllowed('nature')

/** True when a real-photo bloom still misses the photos it needs (the bud and the fully open flower). */
export const photosMissing = (b: Bloom) => !!b.photo && !(b.photos?.bud && b.photos?.full)

/** A cut-out the flower photo slots made (flower-bud.png …): part of a bloom, not a photo to show on its own. */
export const isFlowerCutout = (s: MediaSource) => /^flower-(bud|half|open|full)\.png$/i.test(s.name)

/**
 * The bloom with another flower picked: ready photos follow the flower (the rose's ready photos are not used for
 * a lotus); the user's own photos stay.
 */
export function withFlower(b: Bloom, flower: FlowerKind): Bloom {
  if (b.photos && !usesReadyPhotos(b.photos)) return { ...b, flower }
  const ready = readyPhotosOf(flower)
  if (ready) return { ...b, flower, photos: { ...ready }, photo: b.photo || !b.photos ? true : b.photo }
  return { ...b, flower, photos: null, photo: false }
}
