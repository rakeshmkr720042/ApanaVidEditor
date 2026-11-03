/**
 * Audio meter for the preview: every playing <video>/<audio> element is routed through one AudioContext into a
 * left/right analyser, so the editor can show how loud the mix is (in dB) and warn when it clips.
 *
 * An element routed into a context only sounds while that context runs, so elements are attached only once the
 * context is running (it is started from the Play press), and play() resumes it again after the phone paused it.
 */

export interface Levels { l: number; r: number } // peak, dBFS (-Infinity = silence)

const KEY = 'audio-meter'
export const meterWanted = () => { try { return localStorage.getItem(KEY) !== 'off' } catch { return true } }
export const setMeterWanted = (on: boolean) => { try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode */ } }

export class Meter {
  private ctx: AudioContext | null = null
  private bus: GainNode | null = null
  private an: AnalyserNode[] = []
  private buf = new Float32Array(1024)
  private nodes = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>()
  failed = false

  /** Starts (or wakes) the context. Call from a user action such as Play. */
  start() {
    if (this.failed) return
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AC) { this.failed = true; return }
        const ctx = new AC()
        const bus = ctx.createGain()
        // mono sounds count on both sides
        bus.channelCount = 2; bus.channelCountMode = 'explicit'; bus.channelInterpretation = 'speakers'
        const split = ctx.createChannelSplitter(2)
        const an = [ctx.createAnalyser(), ctx.createAnalyser()]
        for (const a of an) { a.fftSize = 1024; a.smoothingTimeConstant = 0 }
        bus.connect(ctx.destination)
        bus.connect(split)
        split.connect(an[0], 0)
        split.connect(an[1], 1)
        this.ctx = ctx; this.bus = bus; this.an = an
      }
      if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => {})
    } catch { this.failed = true }
  }

  get running() { return !!this.ctx && this.ctx.state === 'running' }

  /** Routes an element through the meter (once; it keeps playing out loud through the context). */
  attach(el: HTMLMediaElement) {
    if (!this.running || this.nodes.has(el)) return
    try {
      const n = this.ctx!.createMediaElementSource(el)
      n.connect(this.bus!)
      this.nodes.set(el, n)
    } catch { /* already routed elsewhere: leave it playing directly */ }
  }

  detach(el: HTMLMediaElement) {
    const n = this.nodes.get(el)
    if (n) { try { n.disconnect() } catch { /* gone */ } this.nodes.delete(el) }
  }

  /** Peak level of the last ~20 ms per channel, in dBFS. */
  levels(): Levels {
    if (!this.running) return { l: -Infinity, r: -Infinity }
    const peak = (a: AnalyserNode) => {
      a.getFloatTimeDomainData(this.buf)
      let m = 0
      for (let i = 0; i < this.buf.length; i++) { const v = Math.abs(this.buf[i]); if (v > m) m = v }
      return m > 0 ? 20 * Math.log10(m) : -Infinity
    }
    return { l: peak(this.an[0]), r: peak(this.an[1]) }
  }

  close() { void this.ctx?.close().catch(() => {}); this.ctx = null }
}
