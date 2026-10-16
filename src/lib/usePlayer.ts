import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Clip, MediaSource } from '../types'
import { clipLen } from '../types'

/** Plays a list of trimmed clips back-to-back on one <video> element. */
export function usePlayer(clips: Clip[], sources: Record<string, MediaSource>) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const current = useRef(-1) // index of the clip loaded in the video element
  const token = useRef(0) // invalidates stale async seeks

  const offsets = useMemo(() => {
    let acc = 0
    return clips.map((c) => { const o = acc; acc += clipLen(c); return o })
  }, [clips])
  const total = clips.reduce((s, c) => s + clipLen(c), 0)

  const clipsRef = useRef(clips); clipsRef.current = clips
  const offsetsRef = useRef(offsets); offsetsRef.current = offsets
  const totalRef = useRef(total); totalRef.current = total

  const indexAt = useCallback((t: number) => {
    const cs = clipsRef.current, os = offsetsRef.current
    for (let i = 0; i < cs.length; i++) if (t < os[i] + clipLen(cs[i])) return i
    return cs.length - 1
  }, [])

  /** Shows a given source time of a clip (used for seeking and trim previews). */
  const showSourceTime = useCallback(async (clip: Clip, time: number) => {
    const v = videoRef.current
    if (!v) return
    const src = sources[clip.sourceId]
    const my = ++token.current
    if (v.dataset.src !== src.id) {
      v.dataset.src = src.id
      v.src = src.url
      await new Promise((r) => v.addEventListener('loadedmetadata', r, { once: true }))
      if (my !== token.current) return
    }
    v.currentTime = time
  }, [sources])

  const seek = useCallback((t: number) => {
    const cs = clipsRef.current
    if (!cs.length) return
    t = Math.max(0, Math.min(totalRef.current, t))
    const i = indexAt(t)
    current.current = i
    setPlayhead(t)
    const c = cs[i]
    return showSourceTime(c, Math.min(c.out - 0.03, c.in + (t - offsetsRef.current[i])))
  }, [indexAt, showSourceTime])

  const pause = useCallback(() => {
    videoRef.current?.pause()
    setPlaying(false)
  }, [])

  const play = useCallback(async () => {
    const v = videoRef.current
    if (!v || !clipsRef.current.length) return
    let t = playhead
    if (t >= totalRef.current - 0.05) t = 0
    await seek(t)
    setPlaying(true)
    await v.play().catch(() => setPlaying(false))
  }, [playhead, seek])

  // Playback loop: follow the video clock and hop to the next clip at each out point.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let switching = false
    const tick = async () => {
      raf = requestAnimationFrame(tick)
      const v = videoRef.current
      const cs = clipsRef.current
      const i = current.current
      if (!v || switching || i < 0 || !cs[i]) return
      const c = cs[i]
      if (v.currentTime >= c.out - 0.02) {
        if (i + 1 >= cs.length) {
          v.pause()
          setPlaying(false)
          setPlayhead(totalRef.current)
          return
        }
        switching = true
        current.current = i + 1
        const next = cs[i + 1]
        if (v.dataset.src !== next.sourceId || Math.abs(v.currentTime - next.in) > 0.05) {
          await showSourceTime(next, next.in)
          await v.play().catch(() => {})
        }
        switching = false
        return
      }
      setPlayhead(offsetsRef.current[i] + Math.max(0, v.currentTime - c.in))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, showSourceTime])

  // Keep playhead valid when clips change (delete, trim, undo).
  useEffect(() => {
    if (!clips.length) {
      setPlayhead(0)
      setPlaying(false)
      const v = videoRef.current
      if (v) { v.removeAttribute('src'); delete v.dataset.src; v.load() }
      return
    }
    if (!playing) seek(Math.min(playhead, total))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips])

  return { videoRef, playhead, playing, total, offsets, play, pause, seek, showSourceTime }
}
