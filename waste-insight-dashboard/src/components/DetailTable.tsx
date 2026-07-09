import { useState, useMemo } from 'react'
import type { WasteRow, Dataset } from '../types'

const PAGE_SIZE = 20

// แผนกที่ผลิตภายในโรงงาน — เฉพาะงานเหล่านี้ที่ Value ≥ 5,000 ถึงจะไฮไลต์แดง
const IN_HOUSE_DEPTS = new Set(['PR1','PR2','CON1','CON2','GL1','PDTN'])

function fmtK(v: number | null) {
  if (!v) return '—'
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `${(v/1_000).toFixed(1)}k`
  return v.toLocaleString()
}
function fmtFull(v: number | null) {
  if (!v && v !== 0) return '—'
  return v.toLocaleString(undefined, { maximumFractionDigits: 0 })
}
function fmtDate(s: string | null) {
  if (!s) return '—'
  const p = s.split('-') // "dd-mmm-yyyy"
  return p.length >= 3 ? `${p[0]}-${p[1]}-${p[2].slice(2)}` : s
}

type SortKey = 'Date' | 'JO' | 'Dept' | 'Value'
type SortDir  = 'asc' | 'desc'

// Parse "dd-mmm-yyyy" → Date
const MONTH_IDX: Record<string, number> = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11}
function parseWasteDate(s: string | null): Date | null {
  if (!s) return null
  const p = s.split('-')  // ["dd","mmm","yyyy"]
  if (p.length < 3) return null
  const m = MONTH_IDX[p[1]]
  if (m === undefined) return null
  return new Date(Number(p[2]), m, Number(p[0]))
}
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
function isThisWeek(s: string | null): boolean {
  const d = parseWasteDate(s)
  if (!d) return false
  return (Date.now() - d.getTime()) <= ONE_WEEK_MS
}

function rowKey(r: WasteRow): string {
  return `${r.JO}||${r.Date ?? ''}||${r.Problem ?? r.Cause ?? ''}`
}

interface Props {
  rows:         WasteRow[]
  dataset:      Dataset
  actionedJos?: Set<string>
}

export function DetailTable({ rows, dataset, actionedJos }: Props) {
  const [search,  setSearch]  = useState('')
  const [page,    setPage]    = useState(1)
  const [sortKey, setSortKey] = useState<SortKey>('Date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [tooltip, setTooltip] = useState<{ row: WasteRow; x: number; y: number } | null>(null)

  const isReplan = dataset === 'Replan'

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? rows.filter(r => (r.SearchText??'').toLowerCase().includes(q) || (r.JO??'').toLowerCase().includes(q)) : rows
  }, [rows, search])

  const sorted = useMemo(() => [...filtered].sort((a,b) => {
    let d = 0
    if (sortKey==='Date')  d = (a.Date??'').localeCompare(b.Date??'')
    if (sortKey==='JO')    d = (a.JO??'').localeCompare(b.JO??'')
    if (sortKey==='Dept')  d = (a.Dept??'').localeCompare(b.Dept??'')
    if (sortKey==='Value') d = (a.Value??0) - (b.Value??0)
    return sortDir==='desc' ? -d : d
  }), [filtered, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  const curPage    = Math.min(page, totalPages)
  const pageRows   = sorted.slice((curPage-1)*PAGE_SIZE, curPage*PAGE_SIZE)
  const totalValue = filtered.reduce((s,r) => s + (r.Value??0), 0)

  const toggleSort = (k: SortKey) => {
    if (sortKey===k) setSortDir(d => d==='desc'?'asc':'desc')
    else { setSortKey(k); setSortDir('desc') }
    setPage(1)
  }
  const thSort = (k: SortKey) =>
    `cursor-pointer select-none hover:text-blue-600 ${sortKey===k ? 'text-blue-600' : ''}`

  return (
    <div className="card min-h-[200px] relative" onMouseLeave={() => setTooltip(null)}>
      {/* Color legend */}
      <div className="flex items-center gap-3 px-4 pt-2 text-[10px] text-slate-400">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-200 inline-block"/>Value ≥ 5,000 (ในโรงงาน)</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-yellow-100 border border-yellow-200 inline-block"/>เพิ่มใหม่ 7 วัน</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
        <h3 className="card-title shrink-0">Detail Records</h3>
        <span className="text-xs text-slate-400">{filtered.length.toLocaleString()} rows</span>
        <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
          placeholder="Search JO, cause, machine…"
          className="ml-auto w-52 border border-slate-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-400 bg-slate-50"/>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50">
            <tr className="text-slate-400 border-b border-slate-100">
              <th className="px-3 py-2 text-left w-6">#</th>
              <th className={`px-3 py-2 text-left ${thSort('Date')}`} onClick={() => toggleSort('Date')}>
                Date {sortKey==='Date'?(sortDir==='desc'?'↓':'↑'):''}
              </th>
              <th className={`px-3 py-2 text-left ${thSort('JO')}`} onClick={() => toggleSort('JO')}>
                JO {sortKey==='JO'?(sortDir==='desc'?'↓':'↑'):''}
              </th>
              <th className="px-3 py-2 text-left">Comp</th>
              {isReplan && <th className="px-3 py-2 text-left">JO Ref</th>}
              <th className="px-3 py-2 text-left">Machine</th>
              <th className="px-3 py-2 text-left">Problem</th>
              <th className={`px-3 py-2 text-left ${thSort('Dept')}`} onClick={() => toggleSort('Dept')}>
                Dept {sortKey==='Dept'?(sortDir==='desc'?'↓':'↑'):''}
              </th>
              <th className={`px-3 py-2 text-right ${thSort('Value')}`} onClick={() => toggleSort('Value')}>
                Value {sortKey==='Value'?(sortDir==='desc'?'↓':'↑'):''}
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr><td colSpan={isReplan?9:8} className="text-center py-10 text-slate-400">No records</td></tr>
            ) : pageRows.map((r,i) => {
              const isNew  = isThisWeek(r.Date)
              const isBig  = (r.Value ?? 0) >= 5000 && !!r.Dept && IN_HOUSE_DEPTS.has(r.Dept)
              const isActioned = actionedJos?.has(rowKey(r))
              const rowBg  = isNew ? 'bg-yellow-50 hover:bg-yellow-100/60' : isBig ? 'bg-red-50/40 hover:bg-red-50/70' : 'hover:bg-blue-50/40'
              return (
              <tr key={i}
                className={`border-b border-slate-50 transition-colors ${rowBg}`}
                onMouseEnter={ev => {
                  const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect()
                  setTooltip({ row: r, x: rect.right, y: rect.top })
                }}
              >
                <td className="px-3 py-1.5 text-slate-300">{(curPage-1)*PAGE_SIZE+i+1}</td>
                <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap">{fmtDate(r.Date)}</td>
                <td className="px-3 py-1.5 font-mono text-slate-600">{r.JO}</td>
                <td className="px-3 py-1.5 text-slate-700 max-w-[100px] truncate" title={r.Component||r.Code}>{r.Component||r.Code}</td>
                {isReplan && <td className="px-3 py-1.5 text-slate-400">{r.JORef||'—'}</td>}
                <td className="px-3 py-1.5 text-slate-600">{r.Machine}</td>
                <td className="px-3 py-1.5 text-slate-700 max-w-[140px] truncate" title={r.Problem||r.Cause}>{r.Problem||r.Cause}</td>
                <td className="px-3 py-1.5 text-slate-600">{r.Dept}</td>
                <td className="px-3 py-1.5 text-right font-mono">
                  <span title={fmtFull(r.Value)} className={isBig ? 'text-red-600 font-semibold' : 'text-slate-800'}>
                    {fmtK(r.Value)}
                  </span>
                  {isBig && isActioned && (
                    <span className="ml-1 text-emerald-600 font-bold" title="พรีเซนแล้ว">✓</span>
                  )}
                  {isNew && <span className="ml-1 text-[9px] bg-yellow-200 text-yellow-800 px-1 rounded font-medium">NEW</span>}
                </td>
              </tr>
            )})}

          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-700">
              <td colSpan={isReplan?8:7} className="px-3 py-2 text-xs text-slate-500">
                Total ({filtered.length.toLocaleString()} rows)
              </td>
              <td className="px-3 py-2 text-right font-mono text-xs">
                <span title={fmtFull(totalValue)}>{fmtK(totalValue)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 text-xs text-slate-500">
          <span>Page {curPage} / {totalPages}</span>
          <div className="flex gap-1">
            {[['«',1],['‹ Prev',curPage-1],['Next ›',curPage+1],['»',totalPages]].map(([label,target],i) => (
              <button key={i}
                onClick={() => setPage(Math.max(1, Math.min(totalPages, Number(target))))}
                disabled={(i<2&&curPage===1)||(i>=2&&curPage===totalPages)}
                className="px-2.5 py-1 border border-slate-200 rounded-lg disabled:opacity-30 hover:bg-slate-50 transition-colors">
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Hover tooltip */}
      {tooltip && (
        <div className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs pointer-events-none max-w-[260px]"
          style={{ top: Math.min(tooltip.y, window.innerHeight-220), left: Math.min(tooltip.x+8, window.innerWidth-276) }}>
          <div className="font-semibold text-slate-800 mb-2">{tooltip.row.JO}</div>
          <div className="space-y-1 text-slate-600">
            <div><span className="text-slate-400">Date:</span> {tooltip.row.Date??'—'}</div>
            <div><span className="text-slate-400">Dept:</span> {tooltip.row.Dept}</div>
            <div><span className="text-slate-400">Comp:</span> {tooltip.row.Component||tooltip.row.Code}</div>
            {isReplan && <div><span className="text-slate-400">JO Ref:</span> {tooltip.row.JORef||'—'}</div>}
            <div><span className="text-slate-400">Machine:</span> {tooltip.row.Machine}</div>
            <div><span className="text-slate-400">Problem:</span> {tooltip.row.Problem||tooltip.row.Cause}</div>
            <div><span className="text-slate-400">Value:</span> <strong className="text-slate-800">{fmtFull(tooltip.row.Value)}</strong></div>
            <div><span className="text-slate-400">QtySheet:</span> {fmtFull(tooltip.row.QtySheet)}</div>
          </div>
        </div>
      )}
    </div>
  )
}
