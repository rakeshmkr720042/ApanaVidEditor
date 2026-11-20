import { isAllowed } from '../lib/premium'
import { flowerInfo, type FlowerKind } from '../engine/bloom'

/** Rose is free; the other bloom flowers need Pro (feature 'nature') when the lock is on. */
export const bloomLocked = (k: FlowerKind) => !flowerInfo(k).free && !isAllowed('nature')
