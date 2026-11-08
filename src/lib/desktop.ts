/** Bridge to the Electron shell (electron/preload.cjs). Undefined in the browser and on Android. */
interface DesktopBridge {
  platform: string
  onOpenFiles(cb: (files: { name: string; data: Uint8Array }[]) => void): () => void
  ready(): void
  /** Screen recording: the shell asks which screen or window to capture. */
  onPickScreen?(cb: (sources: ScreenSource[]) => void): () => void
  pickScreen?(id: string | null): void
  /** Reads a web page or picture outside the browser's cross-origin rules (Article to video). */
  fetchUrl?(url: string): Promise<{ ok: boolean; status: number; type: string; url: string; data: Uint8Array }>
  /** YouTube upload: Google sign-in in the default browser (loopback + PKCE). The refresh token comes back encrypted. */
  googleSignIn?(o: { clientId: string; clientSecret: string; scope: string }): Promise<{ access: string; expiresIn: number; refresh?: string }>
  googleCancel?(): void
  /** Apna Editor account sign-in: Google in the default browser via the website; returns a Google ID token. */
  googleLogin?(): Promise<{ idToken: string }>
  googleRefresh?(o: { clientId: string; clientSecret: string; refresh: string }): Promise<{ access: string; expiresIn: number }>
  /** A request to www.googleapis.com from the main process. */
  /** Local AI setup (Windows): what this computer has, and installing Ollama + a Gemma 4 model. */
  aiCheck?(): Promise<ComputerInfo>
  aiSetup?(model: string): Promise<{ ok: boolean; model: string }>
  aiCancel?(): void
  onAIProgress?(cb: (p: AISetupProgress) => void): () => void
  /** Smart annotate while screen recording: cursor, clicks, keys and drawing on the screen (electron/annotate.js). */
  annoStart?(opts?: { overlay?: boolean; hotkeys?: boolean }): Promise<AnnoAbility | null>
  annoStop?(): void
  annoMode?(mode: AnnoModeName, on?: boolean): void
  onAnno?(cb: (events: AnnoEvent[]) => void): () => void
  onAnnoState?(cb: (s: AnnoState) => void): () => void
  /** Stops Windows from sleeping while an export runs. */
  keepAwake?(on: boolean): void
  /** Help → User guide / Keyboard shortcuts in the menu bar (topic id, or null for the contents). */
  onHelp?(cb: (topic: string | null) => void): () => void
  googleFetch?(r: { url: string; method: string; headers: Record<string, string>; body?: Uint8Array | string }): Promise<{ status: number; location: string | null; range: string | null; text: string }>
}

export interface ComputerInfo {
  windows: boolean; ram: number; cores: number; cpu: string
  gpus: { name: string; vram: number }[]; vram: number; freeDisk: number | null
  ollamaInstalled: boolean; ollamaRunning: boolean; models: string[]
}
export interface AISetupProgress { step: string; text: string; status?: string; p?: number; done?: number; total?: number }

export type AnnoModeName = 'draw' | 'laser' | 'spotlight' | 'zoom' | 'hide'
export interface AnnoAbility { cursor: boolean; clicks: boolean; keys: boolean; window: boolean; hotkeys: Record<AnnoModeName, string> }
export interface AnnoState { modes: Record<AnnoModeName, boolean>; tool: string; color: string; hotkeys: Record<AnnoModeName, string> }
/** What happened, with the time (ms since 1970) it happened; x, y are 0..1 of the recorded picture. */
export type AnnoEvent = { at: number } & (
  | { k: 'm'; x: number; y: number }
  | { k: 'click'; x: number; y: number; right: boolean }
  | { k: 'key'; text: string }
  | { k: 'mode'; mode: Exclude<AnnoModeName, 'draw'>; on: boolean }
  | { k: 'stroke'; tool: string; color: string | null; pts: number[]; ar: number }
)

export interface ScreenSource { id: string; name: string; thumb: string; screen: boolean }

export const desktop = (window as unknown as { desktop?: DesktopBridge }).desktop
export const isDesktop = !!desktop

// Files from File > Open Video or Explorer wait here until an editor picks them up.
let pending: File[] = []
const listeners = new Set<() => void>()

const mimeByExt: Record<string, string> = {
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg',
}

/** Calls onFiles when the desktop app is asked to open files. Returns an unsubscribe function. */
export function listenForOpenedFiles(onFiles: () => void) {
  if (!desktop) return () => {}
  const off = desktop.onOpenFiles((files) => {
    pending.push(...files.map((f) => new File([f.data as BlobPart], f.name, { type: mimeByExt[f.name.split('.').pop()!.toLowerCase()] ?? '' })))
    listeners.forEach((l) => l())
    onFiles()
  })
  desktop.ready()
  return off
}

export const hasPendingFiles = () => pending.length > 0

/** Removes and returns the waiting files. */
export function takePendingFiles() {
  const f = pending
  pending = []
  return f
}

/** Runs cb whenever new files arrive. Returns an unsubscribe function. */
export function onPendingFiles(cb: () => void) {
  listeners.add(cb)
  return () => { listeners.delete(cb) }
}
