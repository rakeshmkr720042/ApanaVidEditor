import { useEffect, useState } from 'react'
import { getTrending, onTrending } from './trending'

/** The trending pack, re-rendering when a newer one arrives. */
export function useTrending() {
  const [pack, setPack] = useState(getTrending)
  useEffect(() => onTrending(() => setPack(getTrending())), [])
  return pack
}
