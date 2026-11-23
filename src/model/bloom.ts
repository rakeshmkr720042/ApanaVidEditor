import type { Bloom } from '../types'
import { isAllowed } from '../lib/premium'
import { flowerInfo, type FlowerKind } from '../engine/bloom'

/** Rose is free; the other bloom flowers need Pro (feature 'nature') when the lock is on. */
export const bloomLocked = (k: FlowerKind) => !flowerInfo(k).free && !isAllowed('nature')

/** True when a real-photo bloom still misses the photos it needs (the bud and the fully open flower). */
export const photosMissing = (b: Bloom) => !!b.photo && !(b.photos?.bud && b.photos?.full)
