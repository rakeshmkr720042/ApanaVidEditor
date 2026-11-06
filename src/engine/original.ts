import type { Clip, Project } from '../types'
import { defaultAdjust, type LaidClip } from '../model/timeline'

/**
 * A main clip as it came from the camera: no look, effect, crop, zoom, mask, green screen or transition.
 * Timing (trims, speed) and turning (rotate / flip) are kept, so "before" shows the same moment as "after".
 */
export const plainClip = (c: Clip): Clip => ({
  ...c,
  pos: null, keys: undefined, shapeMask: null, crop: null, filter: null, filterAmount: 0, adjust: defaultAdjust(),
  transition: null, kenBurns: null, chroma: null, cutout: null, effect: null, grade: null, stabilize: null,
  motionBlur: null, smoothSlow: null, photo3d: null,
})

/** The project and its laid-out clips with every edit taken off the picture (for the before / after view). */
export function originalOf(project: Project, items: LaidClip[]): { project: Project; items: LaidClip[] } {
  return {
    project: { ...project, clips: project.clips.map(plainClip), layers: [], watermark: null, presenter: null, beatFx: null },
    items: items.map((it) => ({ ...it, clip: plainClip(it.clip) })),
  }
}
