export type MediaKind = 'video' | 'image' | 'audio'

/** An imported (or generated) file. Lives outside undo history. */
export interface MediaSource {
  id: string
  kind: MediaKind
  file: Blob
  url: string
  name: string
  duration: number // seconds (images: Infinity-like, use 0)
  width: number
  height: number
  hasAudio: boolean
  thumbs: string[]
  wave?: string // video sources: waveform image of the sound over the whole file ('' = no sound / not decodable)
}

/** Colour settings, also produced by filter presets. All 0 = unchanged. */
export interface Adjust {
  exposure: number // -1..1
  brightness: number // -1..1
  contrast: number // -1..1
  saturation: number // -1..1
  vibrance: number // -1..1
  temperature: number // -1..1
  tint: number // -1..1
  hue: number // -180..180 degrees
  highlights: number // -1..1
  shadows: number // -1..1
  fade: number // 0..1 (lifted blacks)
  vignette: number // 0..1
  grain: number // 0..1
  sharpen: number // 0..1
}

export interface Crop { x: number; y: number; w: number; h: number } // normalised 0..1 of source frame

export interface Transition { type: string; duration: number }

export interface Clip {
  id: string
  sourceId: string
  in: number
  out: number
  speed: number
  ramp: string | null // speed-ramp preset id, overrides speed
  volume: number // 0..2
  fadeIn: number
  fadeOut: number
  rotate: 0 | 90 | 180 | 270
  flipH: boolean
  flipV: boolean
  crop: Crop | null
  fit: 'fit' | 'fill'
  filter: string | null
  filterAmount: number // 0..1
  adjust: Adjust
  transition: Transition | null // transition into the next clip
  fromTemplate?: boolean // part of an intro/outro; never decides the "original" frame shape
}

export interface Box {
  x: number // centre, 0..1 of canvas width
  y: number // centre, 0..1 of canvas height
  scale: number // multiplier
  rotation: number // degrees
  opacity: number
}

interface LayerBase {
  id: string
  start: number // timeline seconds
  end: number
}

export type TextAnim = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop' | 'typewriter' | 'zoom' | 'bounce'

export interface TextStyle {
  font: string
  size: number // fraction of canvas height
  color: string
  align: 'left' | 'center' | 'right'
  stroke: string | null
  strokeWidth: number
  shadow: boolean
  background: string | null
  bold: boolean
  italic: boolean
  letterSpacing: number
}

export type CaptionFramePreset = 'bottom' | 'top' | 'left' | 'right' | 'center' | 'custom'

/** A fixed box the text sits in (a bottom strip, the left half of the screen…), wrapping to fit it. */
export interface CaptionFrame {
  preset: CaptionFramePreset
  rect: { x: number; y: number; w: number; h: number } // normalised, top-left
  fill: string // #rrggbb
  fillOpacity: number // 0..1
  border: string | null
  borderWidth: number // 0..3, like overlay borders
  radius: number // 0..1 of the short side's half
  valign: 'top' | 'middle' | 'bottom'
}

export interface TextLayer extends LayerBase {
  type: 'text'
  text: string
  subtitle: boolean
  style: TextStyle
  box: Box
  animIn: TextAnim
  animOut: TextAnim
  frame?: CaptionFrame | null // when set, box position/scale/rotation are ignored
}

export interface StickerLayer extends LayerBase {
  type: 'sticker'
  emoji: string
  box: Box
  animIn: TextAnim
  animOut: TextAnim
}

export interface MediaLayer extends LayerBase {
  type: 'media' // picture-in-picture video or image overlay
  sourceId: string
  in: number
  box: Box
  volume: number
  chroma: { enabled: boolean; color: string; similarity: number; smoothness: number }
  mask: 'none' | 'circle' | 'rounded'
  border: number
  adjust: Adjust
  filter: string | null
  filterAmount: number
}

export interface BlurLayer extends LayerBase {
  type: 'blur'
  rect: { x: number; y: number; w: number; h: number } // normalised, top-left
  shape: 'rect' | 'ellipse'
  mode: 'blur' | 'pixelate'
  strength: number // 0..1
}

export interface AudioLayer extends LayerBase {
  type: 'audio'
  sourceId: string
  in: number
  volume: number
  fadeIn: number
  fadeOut: number
  label: string
  kind: 'music' | 'sound' | 'voice'
}

export type Layer = TextLayer | StickerLayer | MediaLayer | BlurLayer | AudioLayer
export type VisualLayer = Exclude<Layer, AudioLayer>

export type AspectRatio = 'original' | '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | '3:4' | '21:9'

export interface ProjectSettings {
  aspect: AspectRatio
  background: 'black' | 'white' | 'blur' | string
  fps: number
}

/** 3x3 anchor grid (top/middle/bottom × left/centre/right), or a dragged spot. */
export type WatermarkPos = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'custom'

/** The user's own watermark, drawn on top of everything in preview and export. */
export interface Watermark {
  enabled: boolean
  kind: 'text' | 'image'
  text: string
  font: string
  size: number // text height, fraction of the canvas short side
  color: string
  bold: boolean
  shadow: boolean
  sourceId: string | null // image watermark
  imageSize: number // image height, fraction of the canvas short side
  opacity: number // 0.1..1
  position: WatermarkPos
  x: number // centre, 0..1 of canvas width (position = custom)
  y: number
  motion: 'static' | 'float'
  speed: number // floating speed multiplier
  range: 'full' | 'custom'
  start: number // timeline seconds (range = custom)
  end: number
}

export interface Project {
  clips: Clip[]
  layers: Layer[]
  settings: ProjectSettings
  watermark?: Watermark | null
}

export const MIN_CLIP = 0.2
