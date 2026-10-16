import type { Adjust } from '../types'

type RGB = [number, number, number]

/** A filter preset: colour adjustments plus effects the sliders don't expose. */
export interface Look extends Partial<Adjust> {
  mono?: number
  sepia?: number
  split?: { shadow: RGB; highlight: RGB; amount: number }
  duo?: { dark: RGB; light: RGB; amount: number }
}

export interface FilterPreset { id: string; name: string; group: string; look: Look }

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]

const groups: Record<string, [string, Look][]> = {
  // creator colour grades: tone + split toning, stacked on top of the clip's own Adjust sliders
  Looks: [
    ['Warm Sunset', { temperature: 0.4, tint: 0.08, contrast: 0.12, highlights: -0.1, vignette: 0.25, split: { shadow: hex('#4a1f3d'), highlight: hex('#ffb35c'), amount: 0.45 } }],
    ['Cold Blue', { temperature: -0.45, tint: -0.04, saturation: -0.15, contrast: 0.15, split: { shadow: hex('#0a2a55'), highlight: hex('#cfe6ff'), amount: 0.4 } }],
    ['Film Noir', { mono: 1, contrast: 0.65, shadows: -0.25, highlights: 0.1, vignette: 0.65, grain: 0.35 }],
    ['Vintage', { sepia: 0.35, fade: 0.35, temperature: 0.15, saturation: -0.25, vignette: 0.4, grain: 0.3, split: { shadow: hex('#2e3b2a'), highlight: hex('#ffe8b8'), amount: 0.3 } }],
    ['Vivid Pop', { saturation: 0.55, vibrance: 0.35, contrast: 0.25, exposure: 0.05, sharpen: 0.4 }],
    ['Matte', { fade: 0.5, contrast: -0.15, saturation: -0.15, shadows: 0.1, split: { shadow: hex('#2b2f3a'), highlight: hex('#f2e9dc'), amount: 0.2 } }],
  ],
  Basic: [
    ['Vivid', { saturation: 0.35, contrast: 0.15, vibrance: 0.2 }],
    ['Punch', { contrast: 0.35, saturation: 0.25, shadows: -0.1 }],
    ['Bright', { exposure: 0.25, highlights: -0.1, shadows: 0.15 }],
    ['Soft', { contrast: -0.2, fade: 0.25, highlights: -0.1 }],
    ['Clear', { contrast: 0.12, sharpen: 0.5, vibrance: 0.15 }],
    ['Crisp', { contrast: 0.2, sharpen: 0.7, saturation: 0.05 }],
    ['Natural', { vibrance: 0.15, shadows: 0.08, temperature: 0.03 }],
    ['Pop', { saturation: 0.5, vibrance: 0.2, contrast: 0.1, brightness: 0.03 }],
    ['Glow', { exposure: 0.15, highlights: 0.2, contrast: -0.1, fade: 0.1 }],
    ['Matte', { fade: 0.45, contrast: -0.1, saturation: -0.1 }],
  ],
  Portrait: [
    ['Warm Skin', { temperature: 0.2, tint: 0.05, shadows: 0.1, saturation: -0.05 }],
    ['Peach', { temperature: 0.18, tint: 0.12, fade: 0.15, exposure: 0.08 }],
    ['Rosy', { tint: 0.2, saturation: 0.1, highlights: 0.05 }],
    ['Porcelain', { saturation: -0.25, exposure: 0.15, contrast: -0.1, temperature: -0.05 }],
    ['Golden Hour', { temperature: 0.4, saturation: 0.15, highlights: 0.1, vignette: 0.25 }],
    ['Sunkissed', { temperature: 0.3, exposure: 0.1, fade: 0.1, vibrance: 0.2 }],
    ['Blush', { tint: 0.15, temperature: 0.08, fade: 0.2, contrast: -0.08 }],
    ['Honey', { temperature: 0.3, tint: 0.04, contrast: 0.08, split: { shadow: hex('#5a3b1a'), highlight: hex('#ffd38a'), amount: 0.35 } }],
  ],
  Film: [
    ['Kodak 200', { temperature: 0.18, fade: 0.2, saturation: 0.1, contrast: 0.08, grain: 0.25 }],
    ['Portra', { temperature: 0.1, tint: 0.05, saturation: -0.08, fade: 0.15, shadows: 0.12, grain: 0.2 }],
    ['Ektar', { saturation: 0.45, contrast: 0.2, temperature: 0.06, grain: 0.15 }],
    ['Fuji 400', { temperature: -0.06, tint: -0.08, fade: 0.15, split: { shadow: hex('#1d4a3f'), highlight: hex('#fff3d6'), amount: 0.3 }, grain: 0.2 }],
    ['Superia', { tint: -0.12, saturation: 0.15, contrast: 0.1, grain: 0.25 }],
    ['Velvia', { saturation: 0.6, contrast: 0.3, shadows: -0.15 }],
    ['Cinestill', { split: { shadow: hex('#0d4d5c'), highlight: hex('#ff7a5c'), amount: 0.45 }, contrast: 0.15, grain: 0.2 }],
    ['Polaroid', { fade: 0.35, temperature: 0.1, saturation: -0.15, tint: 0.05, vignette: 0.3 }],
    ['Instant', { fade: 0.3, temperature: -0.08, contrast: 0.1, split: { shadow: hex('#253a5e'), highlight: hex('#fff0c8'), amount: 0.3 } }],
    ['Expired', { tint: 0.15, temperature: 0.2, fade: 0.4, saturation: -0.2, grain: 0.4 }],
    ['Lomo', { contrast: 0.4, saturation: 0.35, vignette: 0.7, temperature: 0.05 }],
    ['Disposable', { exposure: 0.1, contrast: 0.2, temperature: 0.12, grain: 0.5, vignette: 0.35 }],
  ],
  Cinematic: [
    ['Teal & Orange', { split: { shadow: hex('#0b5f6b'), highlight: hex('#ff9a3c'), amount: 0.55 }, contrast: 0.2, saturation: 0.1 }],
    ['Blockbuster', { split: { shadow: hex('#123a63'), highlight: hex('#ffb066'), amount: 0.45 }, contrast: 0.3, vignette: 0.3 }],
    ['Noir Teal', { saturation: -0.5, split: { shadow: hex('#06343b'), highlight: hex('#cfe9e6'), amount: 0.4 }, contrast: 0.3 }],
    ['Moonlight', { temperature: -0.4, exposure: -0.2, saturation: -0.3, contrast: 0.15, vignette: 0.4 }],
    ['Desert', { temperature: 0.45, saturation: -0.1, fade: 0.15, contrast: 0.1 }],
    ['Arctic', { temperature: -0.35, exposure: 0.1, saturation: -0.2, highlights: 0.1 }],
    ['Matrix', { tint: -0.4, saturation: -0.2, contrast: 0.25, split: { shadow: hex('#022b0e'), highlight: hex('#b8ffb0'), amount: 0.35 } }],
    ['Blade', { split: { shadow: hex('#004c5a'), highlight: hex('#ff6a00'), amount: 0.6 }, contrast: 0.25, fade: 0.1 }],
    ['Dune', { temperature: 0.35, tint: 0.05, contrast: 0.2, saturation: -0.25, fade: 0.1 }],
    ['Pastel', { saturation: -0.15, fade: 0.3, exposure: 0.12, tint: 0.06, contrast: -0.15 }],
  ],
  Vintage: [
    ['Retro', { fade: 0.3, temperature: 0.15, saturation: -0.2, vignette: 0.35 }],
    ['70s', { temperature: 0.3, tint: 0.08, fade: 0.3, saturation: -0.1, grain: 0.3 }],
    ['80s', { tint: 0.18, saturation: 0.25, contrast: 0.1, split: { shadow: hex('#3a1a5e'), highlight: hex('#ffc2e0'), amount: 0.3 } }],
    ['Faded', { fade: 0.55, contrast: -0.2, saturation: -0.2 }],
    ['Sepia', { sepia: 1, contrast: 0.05 }],
    ['Antique', { sepia: 0.7, fade: 0.25, vignette: 0.5, grain: 0.3 }],
    ['Old Photo', { sepia: 0.55, mono: 0.3, fade: 0.3, vignette: 0.55, grain: 0.45 }],
    ['VHS', { saturation: 0.2, tint: 0.1, fade: 0.2, sharpen: -0.3, grain: 0.5, contrast: 0.1 }],
    ['Dusty', { temperature: 0.15, saturation: -0.35, fade: 0.35, grain: 0.3 }],
    ['Cream', { temperature: 0.12, fade: 0.25, exposure: 0.1, saturation: -0.1, highlights: -0.15 }],
  ],
  'B&W': [
    ['Mono', { mono: 1 }],
    ['High Contrast', { mono: 1, contrast: 0.5 }],
    ['Soft B&W', { mono: 1, contrast: -0.2, fade: 0.2 }],
    ['Silver', { mono: 1, exposure: 0.15, contrast: 0.15, highlights: 0.1 }],
    ['Noir', { mono: 1, contrast: 0.6, vignette: 0.6, exposure: -0.1 }],
    ['Ink', { mono: 1, contrast: 0.9, shadows: -0.3 }],
    ['Charcoal', { mono: 1, exposure: -0.2, fade: 0.2, grain: 0.4 }],
    ['Selenium', { mono: 1, duo: { dark: hex('#1a1f2e'), light: hex('#eef2ff'), amount: 0.6 } }],
    ['Platinum', { mono: 1, duo: { dark: hex('#2b2620'), light: hex('#f4efe6'), amount: 0.6 }, fade: 0.1 }],
    ['Gritty', { mono: 1, contrast: 0.4, sharpen: 0.8, grain: 0.6 }],
  ],
  Mood: [
    ['Moody', { exposure: -0.15, saturation: -0.25, contrast: 0.2, vignette: 0.45, temperature: -0.05 }],
    ['Dark', { exposure: -0.35, contrast: 0.25, shadows: -0.2, vignette: 0.5 }],
    ['Dreamy', { exposure: 0.15, fade: 0.3, contrast: -0.2, tint: 0.08, highlights: 0.2 }],
    ['Cold', { temperature: -0.35, saturation: -0.1 }],
    ['Warm', { temperature: 0.35, saturation: 0.05 }],
    ['Night', { temperature: -0.3, exposure: -0.3, tint: -0.05, contrast: 0.2, vignette: 0.5 }],
    ['Romantic', { tint: 0.18, temperature: 0.15, fade: 0.2, vignette: 0.3 }],
    ['Melancholy', { saturation: -0.45, temperature: -0.15, fade: 0.2 }],
    ['Calm', { saturation: -0.15, temperature: -0.1, fade: 0.15, contrast: -0.1 }],
    ['Storm', { saturation: -0.35, contrast: 0.35, temperature: -0.2, exposure: -0.15 }],
  ],
  Nature: [
    ['Food', { saturation: 0.3, temperature: 0.15, contrast: 0.15, sharpen: 0.4 }],
    ['Fresh', { vibrance: 0.35, exposure: 0.08, tint: -0.05, contrast: 0.08 }],
    ['Green', { tint: -0.2, saturation: 0.25, vibrance: 0.2 }],
    ['Forest', { tint: -0.15, saturation: 0.1, shadows: -0.1, temperature: -0.05, contrast: 0.15 }],
    ['Ocean', { temperature: -0.25, saturation: 0.3, vibrance: 0.2 }],
    ['Sky', { temperature: -0.15, highlights: -0.2, vibrance: 0.35 }],
    ['Autumn', { temperature: 0.35, tint: 0.1, saturation: 0.25, hue: -8 }],
    ['Spring', { vibrance: 0.3, tint: -0.06, exposure: 0.12, fade: 0.1 }],
  ],
  Urban: [
    ['Urban', { saturation: -0.3, contrast: 0.3, temperature: -0.08, sharpen: 0.5 }],
    ['Street', { saturation: -0.2, contrast: 0.25, fade: 0.1, grain: 0.3 }],
    ['Neon', { saturation: 0.6, contrast: 0.2, split: { shadow: hex('#3b0a6b'), highlight: hex('#00e5ff'), amount: 0.35 } }],
    ['Cyber', { split: { shadow: hex('#2a0059'), highlight: hex('#ff2bd6'), amount: 0.5 }, contrast: 0.25 }],
    ['Tokyo', { temperature: -0.15, tint: 0.12, saturation: 0.2, contrast: 0.15 }],
    ['Paris', { temperature: 0.1, fade: 0.25, tint: 0.06, saturation: -0.05 }],
    ['Bollywood', { saturation: 0.45, temperature: 0.2, contrast: 0.2, vibrance: 0.2 }],
    ['Monsoon', { temperature: -0.2, tint: -0.1, saturation: -0.1, fade: 0.15, contrast: 0.1 }],
  ],
  Duotone: [
    ['Pink Blue', { duo: { dark: hex('#1b2a8a'), light: hex('#ff7ad9'), amount: 1 } }],
    ['Purple Orange', { duo: { dark: hex('#3b1066'), light: hex('#ffad42'), amount: 1 } }],
    ['Blue Yellow', { duo: { dark: hex('#0b2f6b'), light: hex('#ffe45c'), amount: 1 } }],
    ['Red Navy', { duo: { dark: hex('#101a3d'), light: hex('#ff4b4b'), amount: 1 } }],
    ['Green Purple', { duo: { dark: hex('#3a0f5e'), light: hex('#7dff9a'), amount: 1 } }],
    ['Teal Coral', { duo: { dark: hex('#00454f'), light: hex('#ff8a73'), amount: 1 } }],
    ['Gold Black', { duo: { dark: hex('#0b0b0b'), light: hex('#f5c542'), amount: 1 } }],
    ['Mint Plum', { duo: { dark: hex('#4b1645'), light: hex('#b7ffe0'), amount: 1 } }],
    ['Sunset', { duo: { dark: hex('#4a0f3a'), light: hex('#ffb347'), amount: 0.85 } }],
    ['Lime Navy', { duo: { dark: hex('#0d1b4c'), light: hex('#d4ff3b'), amount: 1 } }],
    ['Cherry', { duo: { dark: hex('#2d0010'), light: hex('#ff9fb6'), amount: 0.9 } }],
    ['Ice', { duo: { dark: hex('#0a2340'), light: hex('#e3f6ff'), amount: 0.9 } }],
  ],
  Tint: [
    ['Red', '#ff3b3b'], ['Orange', '#ff8c1a'], ['Yellow', '#ffd60a'], ['Lime', '#a6ff00'], ['Emerald', '#1ed760'],
    ['Mint', '#3dffc5'], ['Cyan', '#16d9ff'], ['Azure', '#3d9bff'], ['Blue', '#3d4bff'], ['Violet', '#8f3dff'],
    ['Magenta', '#ff3df2'], ['Rose', '#ff5c93'],
  ].map(([n, c]) => [n, { mono: 1, duo: { dark: [0.02, 0.02, 0.03] as RGB, light: hex(c), amount: 0.75 } }] as [string, Look]),
}

export const FILTERS: FilterPreset[] = Object.entries(groups).flatMap(([group, list]) =>
  list.map(([name, look]) => ({ id: `${group}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, group, look })),
)

export const FILTER_GROUPS = Object.keys(groups)

export const filterById = (id: string | null) => (id ? FILTERS.find((f) => f.id === id) ?? null : null)

/** Flat parameter set consumed by the shader. */
export interface ColorParams extends Adjust {
  mono: number
  sepia: number
  splitShadow: RGB
  splitHighlight: RGB
  split: number
  duoDark: RGB
  duoLight: RGB
  duo: number
}

const ADJ_KEYS: (keyof Adjust)[] = [
  'exposure', 'brightness', 'contrast', 'saturation', 'vibrance', 'temperature', 'tint', 'hue',
  'highlights', 'shadows', 'fade', 'vignette', 'grain', 'sharpen',
]

export function colorParams(adjust: Adjust, filter: string | null, amount: number): ColorParams {
  const look = filterById(filter)?.look ?? {}
  const p = { ...adjust } as ColorParams
  for (const k of ADJ_KEYS) p[k] = adjust[k] + (look[k] ?? 0) * amount
  p.mono = (look.mono ?? 0) * amount
  p.sepia = (look.sepia ?? 0) * amount
  p.splitShadow = look.split?.shadow ?? [0.5, 0.5, 0.5]
  p.splitHighlight = look.split?.highlight ?? [0.5, 0.5, 0.5]
  p.split = (look.split?.amount ?? 0) * amount
  p.duoDark = look.duo?.dark ?? [0, 0, 0]
  p.duoLight = look.duo?.light ?? [1, 1, 1]
  p.duo = (look.duo?.amount ?? 0) * amount
  return p
}

export const ADJUST_SLIDERS: { key: keyof Adjust; label: string; min: number; max: number }[] = [
  { key: 'exposure', label: 'Exposure', min: -1, max: 1 },
  { key: 'brightness', label: 'Brightness', min: -1, max: 1 },
  { key: 'contrast', label: 'Contrast', min: -1, max: 1 },
  { key: 'saturation', label: 'Saturation', min: -1, max: 1 },
  { key: 'vibrance', label: 'Vibrance', min: -1, max: 1 },
  { key: 'temperature', label: 'Temperature', min: -1, max: 1 },
  { key: 'tint', label: 'Tint', min: -1, max: 1 },
  { key: 'hue', label: 'Hue', min: -180, max: 180 },
  { key: 'highlights', label: 'Highlights', min: -1, max: 1 },
  { key: 'shadows', label: 'Shadows', min: -1, max: 1 },
  { key: 'fade', label: 'Fade', min: 0, max: 1 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1 },
  { key: 'grain', label: 'Grain', min: 0, max: 1 },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 1 },
]
