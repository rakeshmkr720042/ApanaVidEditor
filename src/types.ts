export interface MediaSource {
  id: string
  file: File
  url: string
  name: string
  duration: number
  width: number
  height: number
  thumbs: string[]
}

/** A piece of a source placed on the timeline, using source time [in, out). */
export interface Clip {
  id: string
  sourceId: string
  in: number
  out: number
}

export const MIN_CLIP = 0.2

export const clipLen = (c: Clip) => c.out - c.in
