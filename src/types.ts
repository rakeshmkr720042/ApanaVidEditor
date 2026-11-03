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

/** A curve as points (x, y in 0..1), always including the two ends; between them it bends smoothly. */
export type CurvePoints = [number, number][]

/**
 * Pro colour grading of a clip or overlay: tone curves, per-colour (HSL) changes and a .cube LUT.
 * Every part is optional, missing = unchanged.
 */
export interface Grade {
  curves?: { all?: CurvePoints; r?: CurvePoints; g?: CurvePoints; b?: CurvePoints } | null
  /** Eight colour bands (red, orange, yellow, green, aqua, blue, purple, magenta): [hue shift -1..1, saturation -1..1, lightness -1..1]. */
  hsl?: [number, number, number][] | null
  lut?: { id: string; amount: number } | null // id of a Project.luts entry
}

/** An imported .cube colour look, kept in the project as RGB bytes (r fastest, then g, then b). */
export interface Lut { id: string; name: string; size: number; data: string /* base64 */ }

/** A moving video effect on a clip or overlay (glow, light leak, sparkles, old film…), see src/engine/effects.ts. */
export interface VideoEffect { id: string; amount: number /* 0..1 */ }

/** Slow pan/zoom over a clip, mostly for photos in a slideshow. */
export type KenBurns = 'zoom-in' | 'zoom-out' | 'pan-left' | 'pan-right' | 'pan-up' | 'pan-down'

/**
 * Background-noise removal for a clip's or layer's sound. The cleaned sound is worked out once per
 * source and setting (src/engine/denoise.ts) and used by the preview and the export; the file stays as it was.
 */
export interface Denoise {
  level: 'light' | 'medium' | 'strong'
  kind: 'voice' | 'any' // voice: AI speech cleaner (RNNoise); any: steady-noise reducer that keeps music
  hum: 0 | 50 | 60 // electric hum to notch out (with its overtones)
  rumble: boolean // cut wind, traffic and AC rumble under 80 Hz
  gate: boolean // quieten what is left between words
}

export type VoiceFx = 'none' | 'deep' | 'child' | 'chipmunk' | 'monster' | 'robot' | 'alien' | 'telephone' | 'radio' | 'megaphone'

/**
 * Sound effects for a clip's or layer's sound: equalizer, voice changer, pitch, compressor, echo and reverb,
 * loudness, stereo. Worked out with Remove noise, once per source and setting (src/engine/soundfx.ts),
 * and used by the preview and the export alike. Missing fields are "off".
 */
export interface AudioFx {
  bass: number // dB, -12..12 (low shelf 120 Hz)
  mid: number // dB, -12..12 (peak 1.5 kHz)
  treble: number // dB, -12..12 (high shelf 6 kHz)
  voice: VoiceFx
  pitch: number // semitones, -12..12, the speed stays the same
  compress: 0 | 1 | 2 | 3 // even out loud and quiet parts: off, light, medium, strong
  echo: number // 0..1
  reverb: number // 0..1
  room: 'room' | 'hall' | 'cave'
  loudness: number | null // target loudness in LUFS (-14 YouTube…), null = as it is
  limiter: boolean // stop peaks from clipping
  channels: 'stereo' | 'mono' | 'left' | 'right' | 'swap' | 'novocal' // novocal: karaoke, the singer taken out
  pan: number // -1 left .. 1 right
  reverse?: boolean // sounds on a track only: play backwards
}

/**
 * Green screen (chroma key): makes one colour of the picture see-through. Spill and shrink are missing in
 * projects saved before they existed (then 0.5 and 0).
 */
export interface ChromaKey {
  enabled: boolean
  color: string // #rrggbb, the screen colour
  similarity: number // strength: how far from the screen colour still goes (0..0.6)
  smoothness: number // edge softness (0..0.3)
  spill?: number // 0..1, pulls the green (or blue) glow out of hair and edges
  shrink?: number // 0..1, eats into the edge to drop a leftover outline
}

/** What shows through a green screen: a colour, or a photo/video filling the frame. It moves with its clip or layer. */
export interface Backdrop {
  kind: 'color' | 'media'
  color: string // kind color
  sourceId?: string // kind media
  in?: number // video: source second it starts from; it loops when shorter than the clip
  fit?: 'fill' | 'fit' // missing = fill
  blur?: number // 0..1, soft-focus look behind the person
}

export interface Clip {
  id: string
  sourceId: string
  in: number
  out: number
  speed: number
  ramp: string | null // speed-ramp preset id ('custom' = rampPts), overrides speed
  rampPts?: number[] // the user's own speed curve (8 speeds over the clip), used when ramp = 'custom'
  pos?: ClipPos | null // zoom & move of the picture (no keyframes), missing = none
  keys?: ClipKey[] // zoom & move keyframes, t in SOURCE seconds (they stay on the video through trims and splits)
  volKeys?: VolKey[] // volume keyframes (source seconds); when set they decide the volume
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
  kenBurns?: KenBurns | null // missing in projects saved before slideshows
  fromTemplate?: boolean // part of an intro/outro; never decides the "original" frame shape
  denoise?: Denoise | null // background-noise removal, missing = off
  fx?: AudioFx | null // sound effects, missing = off
  chroma?: ChromaKey | null // green screen, missing = off
  backdrop?: Backdrop | null // shows through the green screen, missing = the project background
  gap?: number // seconds of empty (black) time before this clip, left when snap is off
  effect?: VideoEffect | null // video effect, missing = none
  grade?: Grade | null // curves, HSL, LUT; missing = none
  cutout?: Cutout | null // background removal (person cutout), missing = off; shows `backdrop` behind
  stabilize?: Stabilize | null // shake taken out (found by src/engine/motion.ts), missing = off
  motionBlur?: number | null // 0..1 smear of movement (frames blend into each other), missing = off
  smoothSlow?: number | null // source frames per second: slow motion blends neighbouring frames, missing = off
  photo3d?: Photo3D | null // photos: 3D zoom (near things move more than far ones), missing = off
}

/** Zoom & move of a main-video clip's picture: offset (fraction of the frame), zoom and turn. */
export interface ClipPos { x: number; y: number; scale: number; rotation: number }
export interface ClipKey { t: number; pos: ClipPos }
/** A volume point: at source time t the sound is v (0..2, like the volume slider). */
export interface VolKey { t: number; v: number }

/**
 * Shake removal: the camera's path as found in the video (how far the picture has moved, in fractions of the
 * frame), sampled `fps` times a second from source time `from`. The renderer smooths it by `strength` and moves
 * each frame back onto the smooth path, zoomed in just enough to hide the moved edges.
 */
export interface Stabilize {
  strength: number // 0..1 how smooth the camera path becomes
  fps: number
  from: number
  x: number[]
  y: number[]
}

/** A photo that moves in 3D: split into layers by distance, and the near layers move more as the camera moves. */
export interface Photo3D {
  motion: 'in' | 'out' | 'left' | 'right' | 'up' | 'orbit'
  amount: number // 0..1
  depth: string // small greyscale PNG data URL: white = near
}

/**
 * Background removal without a green screen: an on-device AI finds the person in each frame and everything else
 * is taken away (src/engine/cutout.ts). An outline can be drawn round the person.
 */
export interface Cutout {
  enabled: boolean
  soft: number // 0..1 edge softness
  outline?: 'none' | 'line' | 'glow' | 'scribble' // missing = none
  color?: string // outline colour
  width?: number // 0..1 outline thickness
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
  track?: string // id of the Track row it sits on (given to every layer by withTracks)
}

/** A saved pose of a layer at a moment, counted from the layer's start. Between keyframes the layer glides. */
export interface BoxKey { t: number; box: Box; lin?: boolean } // lin: glides straight to the next one (motion tracking)

/** Layers with a box can move, grow, turn and fade over time with keyframes. */
interface Keyed { keys?: BoxKey[] }

export type TextAnim = 'none' | 'fade' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop' | 'typewriter' | 'zoom' | 'bounce'
  | 'blur' | 'spin' | 'drop' | 'wipe' | 'letters' // letters: text only, one letter after another

/** A movement that repeats the whole time an item shows (after its entry animation). */
export type LoopAnim = 'none' | 'pulse' | 'float' | 'swing' | 'shimmer' | 'heartbeat'

/** Paint for text letters instead of a flat colour. */
export type TextFill = 'gold' | 'rose-gold' | 'silver' | 'royal' | 'sunset' | 'love' | 'rainbow'

/**
 * Word-by-word captions: the word being spoken stands out (Reels/Shorts style). Word times are shared out over
 * the caption's time by word length, with a little extra after commas and full stops.
 */
export type WordFxStyle = 'color' | 'box' | 'pop' | 'karaoke' | 'reveal' | 'one'
export interface WordFx {
  style: WordFxStyle // color: the word changes colour; box: a coloured box behind it; pop: it grows; karaoke: words fill as
  // they are said; reveal: words appear one by one; one: only the word being said shows, big
  color: string // highlight colour
  caps?: boolean // show the words in CAPITALS
}

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
  fill?: TextFill | null // gradient paint, missing = the flat colour
  glow?: string | null // soft glow of this colour round the letters, missing = none
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

export interface TextLayer extends LayerBase, Keyed {
  type: 'text'
  text: string
  subtitle: boolean
  style: TextStyle
  box: Box
  animIn: TextAnim
  animOut: TextAnim
  loop?: LoopAnim // missing = none
  frame?: CaptionFrame | null // when set, box position/scale/rotation are ignored
  words?: WordFx | null // word-by-word highlight, missing = off
  behind?: boolean // drawn behind the person in the main video (text behind person), missing = in front
}

/** Many copies of a sticker moving over the whole picture (falling petals, rising hearts, confetti bursts…). */
export interface Shower {
  motion: 'fall' | 'rise' | 'float' | 'burst' | 'swirl'
  count: number // 5..150
  size: number // 0.3..2
  speed: number // 0.3..3
}

export interface StickerLayer extends LayerBase, Keyed {
  type: 'sticker'
  emoji: string // an emoji, or 'petal' / 'paper' (drawn rose petal / confetti, showers only)
  shower?: Shower | null // missing = one sticker in its box
  loop?: LoopAnim // missing = none
  box: Box
  animIn: TextAnim
  animOut: TextAnim
}

/** How an overlay mixes with what is under it (canvas composite operations). */
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'add' | 'difference' | 'color-dodge' | 'soft-light'

export interface MediaLayer extends LayerBase, Keyed {
  type: 'media' // picture-in-picture video or image overlay
  sourceId: string
  in: number
  box: Box
  volume: number
  chroma: ChromaKey
  backdrop?: Backdrop | null // full frame behind the layer, through its green screen
  mask: 'none' | 'circle' | 'rounded' | 'heart' | 'star' | 'oval'
  border: number
  adjust: Adjust
  filter: string | null
  filterAmount: number
  crop?: Crop | null // part of the source to show (screen recordings of a custom area)
  speed?: number // playback speed, missing = 1
  volKeys?: VolKey[] // volume keyframes (source seconds), missing = the plain volume
  flipH?: boolean
  flipV?: boolean
  blend?: BlendMode // missing = normal
  animIn?: TextAnim // missing = none
  animOut?: TextAnim
  denoise?: Denoise | null
  fx?: AudioFx | null
  effect?: VideoEffect | null
  grade?: Grade | null
  cutout?: Cutout | null // background removal (person cutout), missing = off
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
  speed?: number // playback speed, missing = 1
  volKeys?: VolKey[] // volume keyframes (source seconds), missing = the plain volume
  denoise?: Denoise | null
  fx?: AudioFx | null
  duck?: number | null // 0..1: volume while someone speaks (other sounds lower it automatically), missing = off
  beats?: number[] // beat times in source seconds (found by src/engine/beats.ts), missing = not looked for
  bpm?: number
}

/** A hit on the whole video on every beat of the music: zoom punch, shake, white flash or blur. */
export interface BeatFx {
  kind: 'zoom' | 'shake' | 'flash' | 'blur'
  strength: number // 0..1
  every: 1 | 2 | 4 // every beat, every 2nd, every 4th (each bar)
  layer?: string // the music layer whose beats count, missing = the first one with beats
}

export type WaveStyle = 'bars' | 'line' | 'circle'

/** An animated picture of a sound (audio bars, a spectrum line, or a ring), moving with that sound. */
export interface WaveLayer extends LayerBase, Keyed {
  type: 'wave'
  sourceId: string // the audio or video whose sound it follows
  in: number // source time at the layer's start
  style: WaveStyle
  color: string
  color2: string // the bars blend into this towards their tips
  box: Box
}

export type Layer = TextLayer | StickerLayer | MediaLayer | BlurLayer | AudioLayer | WaveLayer
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

/** The presenter's details for the name banner, filled in once and kept on the device. */
export interface PresenterProfile {
  name: string
  qualification: string
  experience: string
  extra: string // a short tag, e.g. channel name or "Guest"
  photo: string | null // small square JPEG data URL
}

/**
 * A news-style name banner of the presenter (src/engine/presenter.ts), drawn on top of the video in preview and
 * export: at the start, every `every` minutes and at the end.
 */
export interface Presenter {
  enabled: boolean
  profile: PresenterProfile
  style: 'lower' | 'card' | 'full' // lower-third strip, corner card, full-screen card
  theme: string
  duration: number // seconds each time, 2..15
  atStart: boolean
  atEnd: boolean
  every: number // minutes between repeats in the middle, 0 = none
}

/** A timeline row under the main video. Its switches apply to every layer on it. */
export interface Track {
  id: string
  kind: 'visual' | 'audio'
  name?: string // empty = "Track 2", "Audio 1"…
  hidden?: boolean // left out of the preview and the export
  muted?: boolean
  locked?: boolean // its layers can't be selected, moved or changed
  volume?: number // 0..2, multiplies each layer's own volume
  keep?: boolean // made with "+ Track": stays when empty
}

/** Switches for the main video row. */
export interface MainTrack { muted?: boolean; locked?: boolean }

export interface Project {
  clips: Clip[]
  layers: Layer[]
  settings: ProjectSettings
  watermark?: Watermark | null
  presenter?: Presenter | null
  tracks?: Track[] // top to bottom; a higher row is drawn in front. Missing in projects saved before tracks.
  main?: MainTrack
  /** The subtitles as first made (spoken language), kept when they are swapped for a translation. */
  luts?: Lut[] // imported .cube looks used by clips and overlays
  originalSubs?: { lang: string; cues: { start: number; end: number; text: string }[] } | null
  beatFx?: BeatFx | null // beat effects, missing = off
  markers?: Marker[] // named spots on the timeline (sorted by time), missing = none
}

/** A named spot on the timeline: to find a moment again, plan cuts, or list YouTube chapters. */
export interface Marker {
  id: string
  t: number // timeline seconds
  name: string
  color: string
}

export const MIN_CLIP = 0.2
