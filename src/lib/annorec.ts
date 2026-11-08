import type { AnnoMark, AnnotateLayer } from '../types'
import type { AnnoEvent } from './desktop'
import { ANNO_TOOLS, cursorPath, defaultAnnoStyle, markFromStroke, spansFrom, type AnnoTool } from '../model/annotate'
import { uid } from './format'

/** What a recording with Smart annotate collected, ready to become an Annotate item. */
export type AnnoTake = Pick<AnnotateLayer, 'cursor' | 'marks' | 'spans' | 'style'>

const TOOL_IDS = new Set<string>(ANNO_TOOLS.map((t) => t.value))

/**
 * Collects Smart annotate events during a screen recording and times them on the recording's own clock
 * (pauses taken out). Events from the Windows app carry the moment they happened, so the batching on the way
 * does not shift them.
 */
export class AnnoRecorder {
  private start = 0
  private pausedAt = 0
  private pausedFor = 0
  private running = false
  private samples: { t: number; x: number; y: number }[] = []
  private marks: AnnoMark[] = []
  private toggles: { t: number; mode: 'laser' | 'spotlight' | 'zoom' | 'hide'; on: boolean }[] = []
  private badge = 1
  /** Modes that were already on when recording started. */
  private initial = new Set<'laser' | 'spotlight' | 'zoom' | 'hide'>()

  begin(at = Date.now()) {
    this.start = at
    this.pausedFor = 0
    this.pausedAt = 0
    this.running = true
    for (const mode of this.initial) this.toggles.push({ t: 0, mode, on: true })
  }
  pause(at = Date.now()) { if (this.running && !this.pausedAt) this.pausedAt = at }
  resume(at = Date.now()) { if (this.pausedAt) { this.pausedFor += at - this.pausedAt; this.pausedAt = 0 } }

  /** Recording seconds at a moment, or null while paused / before the start. */
  private time(at: number) {
    if (!this.running || at < this.start || (this.pausedAt && at >= this.pausedAt)) return null
    return (at - this.start - this.pausedFor) / 1000
  }

  add(events: AnnoEvent[]) {
    for (const e of events) {
      if (e.k === 'mode' && !this.running) { if (e.on) this.initial.add(e.mode); else this.initial.delete(e.mode); continue }
      const t = this.time(e.at)
      if (t === null) continue
      if (e.k === 'm') this.samples.push({ t, x: e.x, y: e.y })
      else if (e.k === 'click') this.marks.push({ id: uid(), kind: 'click', t, x: e.x, y: e.y, ...(e.right ? { right: true } : {}) })
      else if (e.k === 'key') this.marks.push({ id: uid(), kind: 'key', t, text: e.text })
      else if (e.k === 'mode') this.toggles.push({ t, mode: e.mode, on: e.on })
      else if (e.k === 'stroke') {
        const tool = (TOOL_IDS.has(e.tool) ? e.tool : 'auto') as AnnoTool
        // the shape appears as the stroke ends, already drawn
        const m = markFromStroke(tool, e.pts, e.ar || 16 / 9, Math.max(0, t - 0.3), this.badge)
        if (!m) continue
        if (m.kind === 'badge') this.badge++
        if (e.color && m.kind !== 'click') m.color = e.color
        this.marks.push(m)
      }
    }
  }

  get count() { return this.marks.length }

  /** Everything collected, for a recording `dur` seconds long; null when nothing was caught. */
  finish(dur: number): AnnoTake | null {
    this.running = false
    if (!this.samples.length && !this.marks.length) return null
    return {
      cursor: cursorPath(this.samples, dur),
      marks: this.marks,
      spans: spansFrom(this.toggles, dur),
      style: defaultAnnoStyle(),
    }
  }
}
