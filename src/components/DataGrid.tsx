import { row, table, type DataDoc, type DataTable } from '../lib/datachart'
import { t } from '../lib/i18n'

const MAX_COLUMNS = 8

/** A small spreadsheet: each table has a title, column names, and rows of a label and values. */
export function DataGrid({ doc, onChange, onPick }: { doc: DataDoc; onChange: (d: DataDoc) => void; onPick: (i: number) => void }) {
  const setTable = (id: string, patch: Partial<DataTable>) => onChange({ tables: doc.tables.map((x) => (x.id === id ? { ...x, ...patch } : x)) })
  const addTable = () => {
    onChange({ tables: [...doc.tables, table('', [''], [row(), row()])] })
    onPick(doc.tables.length)
  }

  return (
    <div className="data-list">
      {doc.tables.map((tb, n) => (
        <div className="data-table" key={tb.id} onFocus={() => onPick(n)}>
          <div className="data-title">
            <input className="text-input" value={tb.title} placeholder={t('Chart title')} onChange={(e) => setTable(tb.id, { title: e.target.value })} />
            {doc.tables.length > 1 && (
              <button className="btn small ghost" onClick={() => onChange({ tables: doc.tables.filter((x) => x.id !== tb.id) })} aria-label="Remove">✕</button>
            )}
          </div>
          <div className="data-scroll">
            <table className="data-grid">
              <thead>
                <tr>
                  <th><input className="text-input" value={tb.head} placeholder={t('Name')} onChange={(e) => setTable(tb.id, { head: e.target.value })} /></th>
                  {tb.series.map((s, j) => (
                    <th key={j}>
                      <div className="data-col">
                        <input className="text-input" value={s} placeholder={`${t('Value')} ${tb.series.length > 1 ? j + 1 : ''}`.trim()}
                          onChange={(e) => setTable(tb.id, { series: tb.series.map((x, k) => (k === j ? e.target.value : x)) })} />
                        {tb.series.length > 1 && (
                          <button className="btn small ghost" aria-label="Remove"
                            onClick={() => setTable(tb.id, { series: tb.series.filter((_, k) => k !== j), rows: tb.rows.map((r) => ({ ...r, cells: r.cells.filter((_, k) => k !== j) })) })}>✕</button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th>
                    {tb.series.length < MAX_COLUMNS && (
                      <button className="btn small ghost" title={t('Add column')} aria-label={t('Add column')}
                        onClick={() => setTable(tb.id, { series: [...tb.series, ''], rows: tb.rows.map((r) => ({ ...r, cells: [...r.cells, ''] })) })}>＋</button>
                    )}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tb.rows.map((r) => (
                  <tr key={r.id}>
                    <td><input className="text-input" value={r.label} placeholder={t('Label')}
                      onChange={(e) => setTable(tb.id, { rows: tb.rows.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) })} /></td>
                    {tb.series.map((_, j) => (
                      <td key={j}><input className="text-input num" value={r.cells[j] ?? ''} inputMode="decimal" placeholder="0"
                        onChange={(e) => setTable(tb.id, { rows: tb.rows.map((x) => (x.id === r.id ? { ...x, cells: tb.series.map((_, k) => (k === j ? e.target.value : x.cells[k] ?? '')) } : x)) })} /></td>
                    ))}
                    <td><button className="btn small ghost" aria-label="Remove" onClick={() => setTable(tb.id, { rows: tb.rows.filter((x) => x.id !== r.id) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button className="btn small ghost" onClick={() => setTable(tb.id, { rows: [...tb.rows, row('', tb.series.map(() => ''))] })}>＋ {t('Row')}</button>
            <input className="text-input data-source" value={tb.source} placeholder={t('Source (optional)')} onChange={(e) => setTable(tb.id, { source: e.target.value })} />
          </div>
        </div>
      ))}
      <button className="btn small" onClick={addTable}>＋ {t('Chart')}</button>
    </div>
  )
}
