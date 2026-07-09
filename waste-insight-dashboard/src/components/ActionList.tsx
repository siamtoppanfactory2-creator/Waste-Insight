import { useMemo, useState } from 'react'
import type { WasteRow } from '../types'

function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `${(v/1_000).toFixed(1)}k`
  return v.toLocaleString()
}
function fmtFull(v: number) { return v.toLocaleString(undefined, { maximumFractionDigits: 0 }) }
function fmtDate(s: string | null) {
  if (!s) return '—'
  const p = s.split('-')
  return p.length >= 2 ? `${p[0]}-${p[1]}` : s
}

// แผนกที่ผลิตภายในโรงงาน — แสดงเฉพาะงานจากแผนกเหล่านี้
const IN_HOUSE_DEPTS = new Set(['PR1','PR2','CON1','CON2','GL1','PDTN'])

// unique key per row
function rowKey(r: WasteRow): string {
  return `${r.JO}||${r.Date ?? ''}||${r.Problem ?? r.Cause ?? ''}`
}

interface RowItem {
  key: string
  jo: string; comp: string; problem: string; machine: string
  dept: string; date: string | null; value: number
}

interface Props {
  rows:         WasteRow[]
  actionedJos:  Set<string>   // stores rowKey strings
  onToggle:     (key: string) => void
  onToggleMany: (keys: string[]) => void
  loading:      boolean
  onRefetch:    () => void
}

export function ActionList({ rows, actionedJos, onToggle, onToggleMany, loading, onRefetch }: Props) {
  const [showActioned, setShowActioned] = useState(false)

  const items: RowItem[] = useMemo(() =>
    rows
      .filter(r => (r.Value ?? 0) >= 5000)
      .filter(r => r.Dept != null && IN_HOUSE_DEPTS.has(r.Dept))
      .sort((a, b) => (b.Value ?? 0) - (a.Value ?? 0))
      .map(r => ({
        key:     rowKey(r),
        jo:      r.JO || '',
        comp:    r.Component || r.Code || '',
        problem: r.Problem || r.Cause || '',
        machine: r.Machine || '',
        dept:    r.Dept || '',
        date:    r.Date,
        value:   r.Value ?? 0,
      }))
  , [rows])

  const pending  = items.filter(i => !actionedJos.has(i.key))
  const actioned = items.filter(i => actionedJos.has(i.key))
  const totalVal = items.reduce((s, i) => s + i.value, 0)

  if (items.length === 0) return null

  const RowCard = ({ item, dimmed }: { item: RowItem; dimmed: boolean }) => (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
      dimmed
        ? 'bg-slate-50 border-slate-100 opacity-60 hover:opacity-80'
        : 'bg-red-50/60 border-red-100 hover:bg-red-50'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-mono text-xs font-semibold ${dimmed ? 'text-slate-500 line-through' : 'text-slate-700'}`}>{item.jo}</span>
          <span className="text-xs text-slate-600 truncate max-w-[150px]" title={item.comp}>{item.comp}</span>
          <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 rounded">{item.dept}</span>
          {item.problem && <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-100 px-1.5 rounded truncate max-w-[120px]" title={item.problem}>{item.problem}</span>}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-slate-400">{item.machine}</span>
          <span className="text-[10px] text-slate-400">·</span>
          <span className="text-[10px] text-slate-400">{fmtDate(item.date)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-sm font-bold ${dimmed ? 'text-slate-400' : 'text-red-600'}`} title={fmtFull(item.value)}>
          {fmtK(item.value)}
        </span>
        {dimmed
          ? <button onClick={() => onToggle(item.key)} className="px-2.5 py-1 text-xs text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">↩ Undo</button>
          : <button onClick={() => onToggle(item.key)} className="px-2.5 py-1 text-xs font-medium bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg transition-colors">✓ Done</button>
        }
      </div>
    </div>
  )

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <div>
          <h3 className="card-title">Weekly Action List</h3>
          <p className="text-xs text-slate-400 mt-0.5">Jobs ≥ 5,000 THB · กดเพื่อ mark ว่าเสนอแล้ว</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {loading && <span className="text-xs text-slate-400 animate-pulse">syncing…</span>}
          <button onClick={onRefetch} className="text-xs text-slate-400 hover:text-slate-600 border border-slate-200 rounded-lg px-2.5 py-1.5">⟳ Sync</button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-3 text-xs">
        <span className="flex items-center gap-1.5 bg-red-50 text-red-700 px-2.5 py-1 rounded-full border border-red-100">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block"/>
          ต้องเสนอ: <strong>{pending.length}</strong> รายการ
        </span>
        <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"/>
          เสนอแล้ว: <strong>{actioned.length}</strong>
        </span>
        <span className="ml-auto text-slate-400">{fmtK(totalVal)} THB</span>
      </div>

      {/* Mark all */}
      {pending.length > 1 && (
        <button
          onClick={() => onToggleMany(pending.map(i => i.key))}
          className="w-full mb-3 py-2 text-xs font-medium bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg transition-colors">
          ✓ Mark ทั้งหมดเป็น Done ({pending.length} รายการ · {fmtK(pending.reduce((s,i)=>s+i.value,0))} THB)
        </button>
      )}

      {/* Pending */}
      {pending.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2">
            🔴 ต้องเสนอ ({pending.length})
          </p>
          <div className="space-y-1.5">
            {pending.map(item => <RowCard key={item.key} item={item} dimmed={false}/>)}
          </div>
        </div>
      )}

      {/* Actioned */}
      {actioned.length > 0 && (
        <div>
          <button onClick={() => setShowActioned(s => !s)}
            className="flex items-center gap-2 text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-2 hover:text-emerald-800">
            <span>✅ เสนอแล้ว ({actioned.length})</span>
            <span className="text-slate-400">{showActioned ? '▲' : '▼'}</span>
          </button>
          {showActioned && (
            <div className="space-y-1.5">
              {actioned.map(item => <RowCard key={item.key} item={item} dimmed={true}/>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
