import { useRef, useState, useEffect, useCallback } from 'react'
import { MONTH_NAMES } from '../hooks/useFilters'
import type { DropdownSel, ChartSel } from '../hooks/useFilters'

// ── Multi-select dropdown ─────────────────────────────────────
function MultiSelect<T extends string | number>({
  label, options, selected, onChange, fmt,
}: {
  label: string; options: T[]; selected: T[]
  onChange: (v: T[]) => void; fmt?: (v: T) => string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const toggle = (v: T) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  const active = selected.length > 0
  const lbl = active
    ? `${label}: ${selected.map(v => fmt ? fmt(v) : String(v)).join(', ')}`
    : `${label}: All`

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
          active
            ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
        }`}>
        {lbl}
        <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 min-w-[140px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 max-h-52 overflow-auto">
          <div className="flex gap-2 px-3 py-1.5 border-b border-slate-100 dark:border-slate-800">
            <button onClick={() => onChange(options.slice())} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">All</button>
            <span className="text-slate-200 dark:text-slate-700">|</span>
            <button onClick={() => onChange([])} className="text-xs text-slate-400 hover:underline">Clear</button>
          </div>
          {options.map(opt => (
            <label key={String(opt)} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs text-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} className="accent-blue-600 w-3.5 h-3.5"/>
              {fmt ? fmt(opt) : String(opt)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Single-select dropdown (month) ────────────────────────────
function SingleSelect({
  label, options, value, onChange, fmt,
}: {
  label: string; options: number[]; value: number | null
  onChange: (v: number | null) => void; fmt: (v: number) => string
}) {
  const active = value !== null
  return (
    <select
      value={value ?? ''}
      onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
        active
          ? 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
      }`}
    >
      <option value="">{label}: All</option>
      {options.map(opt => <option key={opt} value={opt}>{fmt(opt)}</option>)}
    </select>
  )
}

// ── Chip ──────────────────────────────────────────────────────
function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="chip">
      {label}
      <button onClick={onRemove} className="hover:text-blue-900 dark:hover:text-blue-200 font-medium">×</button>
    </span>
  )
}

// ── FilterBar ─────────────────────────────────────────────────
interface Props {
  availableYears:  number[]
  availableMonths: number[]
  availableDepts:  string[]
  dd:              DropdownSel
  chartSel:        ChartSel
  dateFrom:        string | null
  dateTo:          string | null
  dateRangeActive: boolean
  setDateFrom:     (v: string | null) => void
  setDateTo:       (v: string | null) => void
  setYears:        (v: number[]) => void
  setMonth:        (v: number | null) => void
  setDepts:        (v: string[]) => void
  clearChartSel:   () => void
  onRefresh?:      () => void
  latestDataDate?: string | null
  loadedAt?:       string | null
}

export function FilterBar({
  availableYears, availableMonths, availableDepts,
  dd, chartSel,
  dateFrom, dateTo, dateRangeActive, setDateFrom, setDateTo,
  setYears, setMonth, setDepts, clearChartSel,
  onRefresh, latestDataDate, loadedAt,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const clearDateRange = useCallback(() => { setDateFrom(null); setDateTo(null) }, [setDateFrom, setDateTo])
  const hasChartSel = chartSel.months.length > 0 || chartSel.depts.length > 0 ||
    chartSel.problems.length > 0 || chartSel.machines.length > 0 || chartSel.jobs.length > 0

  const chips = [
    ...chartSel.problems.map(p => ({ label: `Problem: ${p}`, remove: clearChartSel })),
    ...chartSel.machines.map(m => ({ label: `Machine: ${m}`, remove: clearChartSel })),
    ...chartSel.jobs.map(j => ({ label: `JO: ${j}`, remove: clearChartSel })),
    ...chartSel.depts.map(d => ({ label: `Dept: ${d}`, remove: clearChartSel })),
  ]

  return (
    <div className="card px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="section-label mr-1">Filter</span>

        <MultiSelect<number>
          label="Year" options={availableYears} selected={dd.years} onChange={setYears}/>

        <SingleSelect
          label="Month" options={availableMonths} value={dd.month}
          onChange={setMonth} fmt={v => MONTH_NAMES[v-1]}/>

        <MultiSelect<string>
          label="Dept" options={availableDepts} selected={dd.depts} onChange={setDepts}/>

        <div className="ml-auto flex items-center gap-2">
          {hasChartSel && (
            <button onClick={clearChartSel}
              className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5">
              Clear highlights
            </button>
          )}
          {/* Advanced filter toggle */}
          <button onClick={() => setShowAdvanced(s => !s)}
            className={`inline-flex items-center gap-1 text-xs rounded-lg px-2.5 py-1.5 border transition-colors ${
              dateRangeActive
                ? 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 font-medium'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
            }`}>
            ⚙ {dateRangeActive ? `${dateFrom} → ${dateTo}` : 'Date Range'}
          </button>

          {onRefresh && (
            <button onClick={onRefresh}
              className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 rounded-lg px-2.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Advanced: date range panel */}
      {showAdvanced && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Date range</span>
          <input type="date" value={dateFrom ?? ''} onChange={e => setDateFrom(e.target.value || null)}
            className={`text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400 ${dateRangeActive ? 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40' : 'border-slate-200 dark:border-slate-700'}`}/>
          <span className="text-xs text-slate-400">ถึง</span>
          <input type="date" value={dateTo ?? ''} onChange={e => setDateTo(e.target.value || null)}
            className={`text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-orange-400 ${dateRangeActive ? 'border-orange-300 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40' : 'border-slate-200 dark:border-slate-700'}`}/>
          {dateRangeActive && (
            <button onClick={clearDateRange}
              className="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300 border border-orange-200 dark:border-orange-900 rounded-lg px-2.5 py-1.5 hover:bg-orange-50 dark:hover:bg-orange-950/40">
              ✕ Clear date range
            </button>
          )}
          {dateRangeActive && (
            <span className="text-[10px] text-orange-500">⚠ Date range แทนที่ filter ทั้งหมด</span>
          )}
        </div>
      )}

      {/* Data info row */}
      {(latestDataDate || loadedAt) && (
        <div className="flex items-center gap-4 pt-1 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400">
          {latestDataDate && (
            <span>📅 ข้อมูลล่าสุดถึง <strong className="text-slate-600 dark:text-slate-300">{latestDataDate}</strong></span>
          )}
          {loadedAt && (
            <span>🕐 โหลดเมื่อ <strong className="text-slate-600 dark:text-slate-300">{loadedAt}</strong></span>
          )}
        </div>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {chips.map((c,i) => <Chip key={i} label={c.label} onRemove={c.remove}/>)}
        </div>
      )}
    </div>
  )
}
