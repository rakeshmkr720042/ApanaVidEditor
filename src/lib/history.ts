import { useCallback, useReducer } from 'react'

interface H<T> { past: T[]; present: T; future: T[]; anchor: T | null }

type A<T> =
  | { type: 'set'; value: T }
  | { type: 'live'; value: T } // change without an undo step (during a drag)
  | { type: 'begin' }
  | { type: 'end' }
  | { type: 'undo' }
  | { type: 'redo' }

const LIMIT = 100

function reducer<T>(h: H<T>, a: A<T>): H<T> {
  switch (a.type) {
    case 'set':
      return { past: [...h.past, h.present].slice(-LIMIT), present: a.value, future: [], anchor: null }
    case 'live':
      return { ...h, present: a.value }
    case 'begin':
      return { ...h, anchor: h.present }
    case 'end':
      if (!h.anchor || h.anchor === h.present) return { ...h, anchor: null }
      return { past: [...h.past, h.anchor].slice(-LIMIT), present: h.present, future: [], anchor: null }
    case 'undo':
      if (!h.past.length) return h
      return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], anchor: null }
    case 'redo':
      if (!h.future.length) return h
      return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), anchor: null }
  }
}

export function useHistory<T>(initial: T) {
  const [h, dispatch] = useReducer(reducer<T>, { past: [], present: initial, future: [], anchor: null })
  return {
    value: h.present,
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    set: useCallback((value: T) => dispatch({ type: 'set', value }), []),
    live: useCallback((value: T) => dispatch({ type: 'live', value }), []),
    begin: useCallback(() => dispatch({ type: 'begin' }), []),
    end: useCallback(() => dispatch({ type: 'end' }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
  }
}
