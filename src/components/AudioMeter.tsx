import { useEffect, useRef, useState } from 'react'
import type { Player } from '../engine/player'
import { t } from '../lib/i18n'

const FLOOR = -48 // dB at the left end of the bar
const pct = (db: number) => Math.max(0, Math.min(1, (db - FLOOR) / -FLOOR)) * 100

/**
 * Left / right level of the preview sound while it plays: green, yellow from -12 dB, red from -3 dB, with a
 * peak line that holds for a moment and a red "CLIP" light when the sound hits the top (it will crackle).
 */
export function AudioMeter({ player, playing }: { player: Player | null; playing: boolean }) {
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  const peaks = useRef<(HTMLSpanElement | null)[]>([])
  const [clip, setClip] = useState(false)
  const [db, setDb] = useState<number | null>(null)

  useEffect(() => {
    if (!player || !playing) {
      for (const b of bars.current) if (b) b.style.width = '100%'
      return
    }
    let raf = 0
    const hold = [{ v: -Infinity, at: 0 }, { v: -Infinity, at: 0 }]
    const shown = [-Infinity, -Infinity]
    let clipAt = 0
    let loud = -Infinity
    let lastText = 0
    const loop = () => {
      const lv = player.meter?.levels() ?? { l: -Infinity, r: -Infinity }
      const now = performance.now()
      ;[lv.l, lv.r].forEach((v, i) => {
        // fall back slowly (about 24 dB a second), rise at once
        shown[i] = Math.max(v, shown[i] - 0.4)
        if (v >= hold[i].v || now - hold[i].at > 1200) hold[i] = { v, at: now }
        if (v > -0.3) clipAt = now
        const b = bars.current[i]
        if (b) b.style.width = `${100 - pct(shown[i])}%`
        const p = peaks.current[i]
        if (p) p.style.left = `${pct(hold[i].v)}%`
      })
      loud = Math.max(loud, lv.l, lv.r)
      if (now - lastText > 400) { setDb(Number.isFinite(loud) ? loud : null); loud = -Infinity; lastText = now }
      setClip(now - clipAt < 1500)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [player, playing])

  return (
    <span className={`lvl${clip ? ' clip' : ''}`} title={t('Sound level (dB). Red CLIP = too loud, it will crackle: lower the volume.')} data-testid="audio-meter">
      <span className="lvl-bars">
        {[0, 1].map((i) => (
          <span className="lvl-bar" key={i}>
            <span className="lvl-mask" ref={(el) => { bars.current[i] = el }} />
            <span className="lvl-peak" ref={(el) => { peaks.current[i] = el }} />
          </span>
        ))}
      </span>
      <span className="lvl-db">{clip ? 'CLIP' : playing && db !== null ? `${Math.round(db)} dB` : ''}</span>
    </span>
  )
}
