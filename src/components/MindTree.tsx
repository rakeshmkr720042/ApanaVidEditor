import { useState } from 'react'
import { node, type MindNode } from '../lib/mindmap'
import { t } from '../lib/i18n'

const MAX_DEPTH = 3 // topic → branch → point → sub-point

function edit(n: MindNode, id: string, fn: (n: MindNode) => MindNode | null): MindNode | null {
  if (n.id === id) return fn(n)
  return { ...n, children: n.children.flatMap((c) => { const r = edit(c, id, fn); return r ? [r] : [] }) }
}

/** Adds a sibling right after the node with `id`. */
function addAfter(n: MindNode, id: string, fresh: MindNode): MindNode {
  const i = n.children.findIndex((c) => c.id === id)
  if (i >= 0) return { ...n, children: [...n.children.slice(0, i + 1), fresh, ...n.children.slice(i + 1)] }
  return { ...n, children: n.children.map((c) => addAfter(c, id, fresh)) }
}

/** A small tree editor: the central topic, its branches, and points under each branch. */
export function MindTree({ map, onChange }: { map: MindNode; onChange: (m: MindNode) => void }) {
  const [focus, setFocus] = useState<string | null>(null)
  const change = (id: string, fn: (n: MindNode) => MindNode | null) => { const r = edit(map, id, fn); if (r) onChange(r) }
  const addChild = (id: string) => { const f = node(''); setFocus(f.id); change(id, (n) => ({ ...n, children: [...n.children, f] })) }
  const addSibling = (id: string) => { const f = node(''); setFocus(f.id); onChange(addAfter(map, id, f)) }

  const row = (n: MindNode, depth: number) => (
    <div key={n.id}>
      <div className={`mind-node d${Math.min(depth, 3)}`} style={{ paddingLeft: (depth - 1) * 18 }}>
        <input className="text-input" value={n.text} autoFocus={focus === n.id}
          placeholder={t(depth === 1 ? 'Branch' : 'Point')}
          onChange={(e) => change(n.id, (x) => ({ ...x, text: e.target.value }))}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSibling(n.id) } }} />
        {depth < MAX_DEPTH && <button className="btn small ghost" onClick={() => addChild(n.id)} aria-label={t('Add a point')} title={t('Add a point')}>＋</button>}
        <button className="btn small ghost" onClick={() => change(n.id, () => null)} aria-label="Remove">✕</button>
      </div>
      {n.children.map((c) => row(c, depth + 1))}
    </div>
  )

  return (
    <div className="mind-tree">
      <input className="text-input mind-topic" value={map.text} placeholder={t('Central topic')}
        onChange={(e) => onChange({ ...map, text: e.target.value })} />
      {map.children.map((c) => row(c, 1))}
      <button className="btn small" onClick={() => addChild(map.id)}>＋ {t('Branch')}</button>
    </div>
  )
}
