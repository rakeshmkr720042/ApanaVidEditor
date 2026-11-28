// Smart annotate overlay: a see-through window over the recorded screen, kept out of the recording. In draw mode
// the presenter draws here; each stroke is sent to the app, which turns it into a box / underline / arrow… in the
// editor. The stroke shows here for a moment so the presenter sees what was drawn.
const TOOLS = [
  ['auto', '✨ Smart pen', '1'], ['highlight', '🖍 Highlighter', '2'], ['arrow', '➜ Arrow', '3'], ['box', '▭ Box', '4'],
  ['badge', '① Number', '5'], ['tap', '◎ Click', '6'], ['pen', '✎ Pen', '7'],
]
const COLORS = ['#ff3b30', '#ffd60a', '#34c759', '#0a84ff', '#ffffff']
const canvas = document.getElementById('c')
const ctx = canvas.getContext('2d')
const bar = document.getElementById('bar')
const chip = document.getElementById('chip')
let state = { modes: {}, tool: 'auto', color: '#ff3b30', hotkeys: {}, chip: 'bottom', inset: { top: 0, left: 0, bottom: 0, right: 0 } }
// the draw bar's place (0..1 of the screen, null = bottom centre) and whether it is folded, kept between recordings
const BAR_KEY = 'anno-bar'
let barPlace = null
let barMini = false
try {
  const v = JSON.parse(localStorage.getItem(BAR_KEY) || 'null')
  if (v && typeof v === 'object') { barMini = !!v.mini; if (Number.isFinite(v.x) && Number.isFinite(v.y)) barPlace = { x: v.x, y: v.y } }
} catch { /* nothing kept */ }
const saveBar = () => { try { localStorage.setItem(BAR_KEY, JSON.stringify({ ...(barPlace ?? {}), mini: barMini })) } catch { /* private */ } }
let strokes = [] // { pts: [[x, y]], tool, color, at }
let live = null
let chipTimer = 0

function size() {
  canvas.width = innerWidth * devicePixelRatio
  canvas.height = innerHeight * devicePixelRatio
}
addEventListener('resize', size)
size()

function buildBar() {
  bar.innerHTML = ''
  const grip = Object.assign(document.createElement('span'), { className: 'grip', textContent: '⋮⋮', title: 'Drag to move' })
  grip.addEventListener('pointerdown', startDrag)
  bar.appendChild(grip)
  for (const [id, label, key] of TOOLS) {
    const b = document.createElement('button')
    b.textContent = label
    b.title = `${label} (${key})`
    b.className = `tool${state.tool === id ? ' on' : ''}`
    b.onclick = () => window.overlay.tool(id, state.color)
    bar.appendChild(b)
  }
  bar.appendChild(Object.assign(document.createElement('span'), { className: 'sep' }))
  for (const c of COLORS) {
    const b = document.createElement('button')
    b.className = `sw${state.color === c ? ' on' : ''}`
    b.style.background = c
    b.onclick = () => window.overlay.tool(state.tool, c)
    bar.appendChild(b)
  }
  bar.appendChild(Object.assign(document.createElement('span'), { className: 'sep' }))
  const fold = document.createElement('button')
  fold.textContent = barMini ? `✎ ${TOOLS.find((x) => x[0] === state.tool)?.[1] ?? ''} ▸` : '–'
  fold.title = barMini ? 'Show all tools' : 'Make this bar small'
  fold.dataset.fold = '1'
  fold.onclick = () => { barMini = !barMini; saveBar(); buildBar() }
  bar.appendChild(fold)
  const done = document.createElement('button')
  done.textContent = '✓ Done (Esc)'
  done.onclick = () => window.overlay.done()
  bar.appendChild(done)
  bar.classList.toggle('mini', barMini)
  placeBar()
}

/** Puts the bar at its kept place, always fully on the screen and above the taskbar. */
function placeBar() {
  const ins = state.inset || {}
  if (!barPlace) {
    bar.classList.remove('placed')
    bar.style.left = bar.style.top = ''
    bar.style.bottom = `${(ins.bottom || 0) + 60}px`
    return
  }
  bar.classList.add('placed')
  bar.style.bottom = ''
  const w = bar.offsetWidth || 300, h = bar.offsetHeight || 40
  const minX = ins.left || 0, minY = ins.top || 0
  const maxX = Math.max(minX, innerWidth - (ins.right || 0) - w), maxY = Math.max(minY, innerHeight - (ins.bottom || 0) - h)
  bar.style.left = `${Math.min(maxX, Math.max(minX, barPlace.x * innerWidth))}px`
  bar.style.top = `${Math.min(maxY, Math.max(minY, barPlace.y * innerHeight))}px`
}
addEventListener('resize', () => { if (state.modes.draw) placeBar() })

let drag = null
function startDrag(e) {
  e.preventDefault()
  e.stopPropagation()
  const r = bar.getBoundingClientRect()
  drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId }
  bar.setPointerCapture(e.pointerId)
  bar.classList.add('dragging')
}
bar.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return
  barPlace = { x: (e.clientX - drag.dx) / innerWidth, y: (e.clientY - drag.dy) / innerHeight }
  placeBar()
})
const endDrag = (e) => {
  if (!drag || e.pointerId !== drag.id) return
  drag = null
  bar.classList.remove('dragging')
  // keep the clamped place, so a bar dropped half off the screen comes back whole next time
  const r = bar.getBoundingClientRect()
  barPlace = { x: r.left / innerWidth, y: r.top / innerHeight }
  saveBar()
}
bar.addEventListener('pointerup', endDrag)
bar.addEventListener('pointercancel', endDrag)

function showChip() {
  const on = Object.entries(state.modes).filter(([k, v]) => v && k !== 'draw').map(([k]) => k)
  const names = { laser: 'Laser', spotlight: 'Spotlight', zoom: 'Zoom', hide: 'Effects hidden' }
  chip.innerHTML = on.length
    ? `✨ ${on.map((k) => `<b>${names[k]}</b>`).join(' · ')}`
    : `✨ Smart annotate · <b>${state.hotkeys.draw || 'Alt+Shift+D'}</b> draw`
  const ins = state.inset || {}
  chip.style.bottom = `${(ins.bottom || 0) + 12}px`
  chip.style.opacity = '1'
  clearTimeout(chipTimer)
  if (!on.length) chipTimer = setTimeout(() => { chip.style.opacity = '0' }, 4000)
}

window.overlay.onState((s) => {
  state = { ...state, ...s }
  document.body.classList.toggle('drawing', !!s.modes.draw)
  for (const c of ['chip-bottom-left', 'chip-bottom-right', 'chip-off']) document.body.classList.toggle(c, `chip-${s.chip}` === c)
  buildBar()
  showChip()
})

addEventListener('keydown', (e) => {
  if (!state.modes.draw) return
  if (e.key === 'Escape') window.overlay.done()
  const t = TOOLS.find((x) => x[2] === e.key)
  if (t) window.overlay.tool(t[0], state.color)
})

addEventListener('pointerdown', (e) => {
  if (!state.modes.draw || e.target.closest('#bar')) return
  canvas.setPointerCapture(e.pointerId)
  live = { pts: [[e.clientX / innerWidth, e.clientY / innerHeight]], tool: state.tool, color: state.color, at: 0 }
})
addEventListener('pointermove', (e) => {
  if (!live) return
  live.pts.push([e.clientX / innerWidth, e.clientY / innerHeight])
})
addEventListener('pointerup', () => {
  if (!live) return
  const s = live
  live = null
  s.at = performance.now()
  strokes.push(s)
  window.overlay.stroke({ tool: s.tool, color: s.color, pts: s.pts.flat() })
})

function draw() {
  const W = canvas.width, H = canvas.height
  ctx.clearRect(0, 0, W, H)
  const now = performance.now()
  strokes = strokes.filter((s) => now - s.at < 1600)
  for (const s of [...strokes, ...(live ? [live] : [])]) {
    const a = s === live ? 1 : 1 - (now - s.at) / 1600
    ctx.globalAlpha = Math.max(0, a) * (s.tool === 'highlight' ? 0.45 : 0.9)
    ctx.strokeStyle = s.tool === 'highlight' ? '#ffe600' : s.color
    ctx.lineWidth = (s.tool === 'highlight' ? 18 : 5) * devicePixelRatio
    ctx.lineCap = ctx.lineJoin = 'round'
    if (s.pts.length === 1) {
      ctx.beginPath()
      ctx.arc(s.pts[0][0] * W, s.pts[0][1] * H, 14 * devicePixelRatio, 0, Math.PI * 2)
      ctx.stroke()
      continue
    }
    ctx.beginPath()
    s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)))
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  requestAnimationFrame(draw)
}
requestAnimationFrame(draw)
