import { useEffect, useRef, useState } from 'react'
import type { Player } from '../engine/player'
import { t } from '../lib/i18n'
import { Icon } from './Icon'

const HOLD_MS = 350 // pressed longer than this = fast scan instead of a 5 s jump
const STEP_MS = 50

/** Fast scan speed after holding for `ms`: 4x, then 8x after 1.5 s, 16x after 3 s. */
function scanSpeed(ms: number) { return ms > 3000 ? 16 : ms > 1500 ? 8 : 4 }

interface Props {
  player: Player | null
  dir: -1 | 1
  /** Jump on a short tap (seconds, signed). */
  onSkip: (d: number) => void
  disabled?: boolean
  className?: string
}

/**
 * Fast backward / fast forward. A tap jumps 5 s; holding it scans through the video
 * (4x, 8x, then 16x the longer it is held) and the preview follows. Letting go keeps
 * playing if the video was playing before.
 */
export function SkipButton({ player, dir, onSkip, disabled, className = 'icon-btn' }: Props) {
  const [speed, setSpeed] = useState(0)
  const hold = useRef<{ timer: number; tick: number; start: number; wasPlaying: boolean; scanning: boolean } | null>(null)

  const stop = (cancel = false) => {
    const h = hold.current
    if (!h) return
    hold.current = null
    clearTimeout(h.timer); clearInterval(h.tick)
    setSpeed(0)
    if (h.scanning) { if (h.wasPlaying && !cancel) player?.play() }
    else if (!cancel) onSkip(dir * 5)
  }
  const stopRef = useRef(stop)
  useEffect(() => { stopRef.current = stop })
  useEffect(() => () => stopRef.current(true), []) // only when the button goes away

  const down = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || !player || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* old browsers */ }
    stop(true)
    const h = { timer: 0, tick: 0, start: 0, wasPlaying: player.playing, scanning: false }
    hold.current = h
    h.timer = window.setTimeout(() => {
      h.scanning = true
      h.start = performance.now()
      if (player.playing) player.pause()
      h.tick = window.setInterval(() => {
        const s = scanSpeed(performance.now() - h.start)
        setSpeed(s)
        const next = player.t + dir * s * (STEP_MS / 1000)
        player.seek(next)
        if (next <= 0 || next >= player.total) stop()
      }, STEP_MS)
      setSpeed(4)
    }, HOLD_MS)
  }

  const back = dir < 0
  return (
    <button
      className={`${className} skip-btn${speed ? ' scanning' : ''}`}
      disabled={disabled}
      onPointerDown={down}
      onPointerUp={() => stop()}
      onPointerCancel={() => stop(true)}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); onSkip(dir * 5) } }}
      aria-label={back ? 'Back 5 seconds' : 'Forward 5 seconds'}
      title={t(back ? 'Back 5 s (← or J). Hold: fast backward' : 'Forward 5 s (→ or L). Hold: fast forward')}
      data-testid={back ? 'rewind' : 'forward'}
    >
      <Icon name={back ? 'rewind' : 'forward'} />
      {speed > 0 && <span className="scan-speed">{speed}x</span>}
    </button>
  )
}
