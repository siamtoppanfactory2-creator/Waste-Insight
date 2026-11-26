import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LabelList, ReferenceArea,
} from 'recharts'
import type { SalesMap } from '../hooks/useSalesData'
import type { ProductionJobs } from '../hooks/useProductionJobs'
import { useWasteData } from '../hooks/useWasteData'
import { latestDate, achRatio } from '../utils/targetPace'
import {
  achColor, toDate, customerOf, problemOf, forecastMonthEnd, computeMovers, rankByRecent, isInHouse,
  buildRateSeries, compareSpans, machineProblemMatrix, OTHER_PROBLEMS, forecastTrend,
  repeatJobs, detectAnomalies,
} from '../utils/insights'
import type {
  MonthForecast, Mover, RatePoint, SpanCompare, MachineMatrix, TrendForecast, TrendPoint, RepeatItem, Anomaly,
} from '../utils/insights'
import type { WasteRow } from '../types'

function fmtK(v: number) {
  const a = Math.abs(v)
  if (a >= 1_000_000) return `${(v/1_000_000).toFixed(2)}M`
  if (a >= 1_000)     return `${(v/1_000).toFixed(1)}k`
  return Math.round(v).toLocaleString()
}
function fmtFull(v: number) { return Math.round(v).toLocaleString() }

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="section-label whitespace-nowrap">{children}</span>
      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700"/>
    </div>
  )
}

type Scope = 'Combined' | 'Replan' | 'Addpaper'
const SCOPE_LABEL: Record<Scope, string> = { Combined: 'รวม 2 ชุด', Replan: 'Replan', Addpaper: 'Addpaper' }
const WINDOWS = [30, 60, 90] as const
const TOP_N = 10

// ─────────────────────────────────────────────────────────────
// การ์ดคาดการณ์ยอดสิ้นเดือน
// ─────────────────────────────────────────────────────────────
function ForecastCard({ title, fc }: { title: string; fc: MonthForecast | null }) {
  if (!fc) return <div className="card p-4 text-sm text-slate-400">{title} — ยังไม่มีข้อมูล</div>
  const color     = achColor(fc.projPct)
  const actualPct = fc.target > 0 ? fc.actual / fc.target : 0
  const daysLeft  = fc.daysInMonth - fc.day
  const barMax    = Math.max(fc.projected, fc.target) || 1
  return (
    <div className="card px-4 pt-3 pb-4 relative overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ background: color }}/>
      <div className="pl-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="section-label">{title} · {fc.label}</span>
          <span className="text-[10px] text-slate-400">ข้อมูลถึง {fc.latestDate}</span>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">คาดการณ์สิ้นเดือน</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums" style={{ color }}>{fmtK(fc.projected)}</span>
          <span className="text-sm font-semibold tabular-nums" style={{ color }}>{isFinite(fc.projPct) ? `${(fc.projPct * 100).toFixed(0)}%` : 'ไม่มี target'}</span>
          <span className="text-xs text-slate-400">ของ target {fmtK(fc.target)}</span>
        </div>

        {/* แถบ: ส่วนทึบ = ใช้ไปแล้ว, ส่วนจาง = ที่คาดว่าจะเพิ่ม, เส้นดำ = target */}
        <div className="relative mt-3 h-2.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div className="absolute left-0 top-0 h-full opacity-30" style={{ width: `${fc.projected / barMax * 100}%`, background: color }}/>
          <div className="absolute left-0 top-0 h-full" style={{ width: `${fc.actual / barMax * 100}%`, background: color }}/>
        </div>
        <div className="relative h-0">
          <div className="absolute -top-3 w-0.5 h-3.5 bg-slate-700 dark:bg-slate-300" style={{ left: `calc(${fc.target / barMax * 100}% - 1px)` }} title="target"/>
        </div>

        <div className="mt-3 space-y-0.5 text-xs">
          <p className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">ใช้ไปแล้ว ({fc.day}/{fc.daysInMonth} วัน)</span>
            <span className="tabular-nums text-slate-700 dark:text-slate-200">{fmtFull(fc.actual)} · {(actualPct * 100).toFixed(0)}%</span></p>
          <p className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">เฉลี่ยต่อวัน</span>
            <span className="tabular-nums text-slate-700 dark:text-slate-200">{fmtFull(fc.perDay)}</span></p>
          <p className="flex justify-between"><span className="text-slate-500 dark:text-slate-400">target ต่อวัน</span>
            <span className="tabular-nums text-slate-700 dark:text-slate-200">{fmtFull(fc.target / fc.daysInMonth)}</span></p>
        </div>

        <div className="mt-2 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: fc.allowance === null ? 'var(--bad-bg)' : 'var(--good-bg)' }}>
          {fc.allowance === null
            ? <span className="text-red-600 dark:text-red-400 font-medium">เกิน target ทั้งเดือนแล้ว ({fmtFull(fc.actual - fc.target)} THB)</span>
            : <span className="text-emerald-700 dark:text-emerald-400">เหลือ {daysLeft} วัน — ใช้ได้อีก<strong> วันละไม่เกิน {fmtFull(fc.allowance)}</strong> เพื่อให้อยู่ใน target</span>}
        </div>
      </div>
    </div>
  )
}

/** รวมคาดการณ์สองชุด (เดือนเดียวกัน) — ใช้วันของชุดที่ข้อมูลช้ากว่าเป็นตัวนับวันที่เหลือ */
function combineForecasts(a: MonthForecast | null, b: MonthForecast | null): MonthForecast | null {
  if (!a || !b || a.label !== b.label) return a ?? b
  const actual = a.actual + b.actual, target = a.target + b.target
  const projected = a.projected + b.projected
  const earlier = a.day <= b.day ? a : b
  const daysLeft = earlier.daysInMonth - earlier.day
  return {
    ...earlier, actual, target, projected,
    perDay: a.perDay + b.perDay,
    projPct: achRatio(projected, target),
    allowance: target > actual && daysLeft > 0 ? (target - actual) / daysLeft : null,
  }
}

// ─────────────────────────────────────────────────────────────
// ตารางรายการที่เปลี่ยนแปลงมากที่สุด
// ─────────────────────────────────────────────────────────────
function Spark({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1)
  const w = 60, h = 18, step = w / (values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - 1 - v / max * (h - 2)).toFixed(1)}`).join(' ')
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round"/>
      <circle cx={(values.length - 1) * step} cy={h - 1 - values[values.length - 1] / max * (h - 2)} r={2} fill={color}/>
    </svg>
  )
}

interface Ranges { recent: string; prior: string }

function MoverTable({ items, rising, ranges, onPick }: { items: Mover[]; rising: boolean; ranges: Ranges | null; onPick?: (k: string) => void }) {
  const color = rising ? '#ef4444' : '#059669'
  if (!items.length) return <p className="text-xs text-slate-400 py-6 text-center">ไม่มีรายการ</p>
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-800">
          <th className="text-left py-1.5 font-medium">ชื่อ</th>
          <th className="text-left py-1.5 font-medium">6 เดือน</th>
          <th className="text-right py-1.5 font-medium align-bottom">
            ก่อนหน้า
            {ranges && <span className="block text-[10px] font-normal text-slate-400 whitespace-nowrap">{ranges.prior}</span>}
          </th>
          <th className="text-right py-1.5 font-medium align-bottom">
            ล่าสุด
            {ranges && <span className="block text-[10px] font-normal text-slate-400 whitespace-nowrap">{ranges.recent}</span>}
          </th>
          <th className="text-right py-1.5 font-medium">เปลี่ยน</th>
        </tr>
      </thead>
      <tbody>
        {items.map(m => (
          <tr key={m.key} className="border-b border-slate-50 dark:border-slate-800">
            <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200 max-w-[140px] truncate" title={m.key}>
              {onPick
                ? <button onClick={() => onPick(m.key)} className="text-blue-600 dark:text-blue-400 hover:underline" title="ดูปัญหาของลูกค้ารายนี้">{m.key}</button>
                : m.key}
            </td>
            <td className="py-1.5"><Spark values={m.spark} color={color}/></td>
            <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400" title={`${fmtFull(m.priorValue)} THB · ${m.priorCount} ครั้ง`}>
              {fmtK(m.priorValue)} <span className="text-slate-300 dark:text-slate-600">({m.priorCount})</span>
            </td>
            <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200" title={`${fmtFull(m.recentValue)} THB · ${m.recentCount} ครั้ง`}>
              {fmtK(m.recentValue)} <span className="text-slate-300 dark:text-slate-600">({m.recentCount})</span>
            </td>
            <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color }}>
              {m.delta > 0 ? '+' : ''}{fmtK(m.delta)}
              <span className="block text-[10px] font-normal">
                {m.pct === null ? 'ใหม่' : `${m.pct > 0 ? '+' : ''}${(m.pct * 100).toFixed(0)}%`}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function MoversSection({ title, rows, keyFn, latest, windowDays, ranges, onPick }: {
  title: string; rows: WasteRow[]; keyFn: (r: WasteRow) => string; latest: string | null; windowDays: number; ranges: Ranges | null
  onPick?: (k: string) => void
}) {
  const { rising, falling } = useMemo(() => computeMovers(rows, keyFn, latest, windowDays), [rows, keyFn, latest, windowDays])
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="card p-4">
        <h3 className="card-title mb-1">🔺 {title} ที่แย่ลง</h3>
        <p className="text-[11px] text-slate-400 mb-2">มูลค่า waste เพิ่มขึ้นมากที่สุด · (ตัวเลขในวงเล็บ = จำนวนครั้ง)</p>
        <MoverTable items={rising.slice(0, TOP_N)} rising={true} ranges={ranges} onPick={onPick}/>
      </div>
      <div className="card p-4">
        <h3 className="card-title mb-1">🔻 {title} ที่ดีขึ้น</h3>
        <p className="text-[11px] text-slate-400 mb-2">มูลค่า waste ลดลงมากที่สุด · (ตัวเลขในวงเล็บ = จำนวนครั้ง)</p>
        <MoverTable items={falling.slice(0, TOP_N)} rising={false} ranges={ranges} onPick={onPick}/>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// เจาะลึกรายลูกค้า — ปัญหาทั้งหมดของลูกค้ารายเดียว เรียงตามมูลค่าช่วงล่าสุด
// ─────────────────────────────────────────────────────────────
function CustomerDrill({ customers, selected, onSelect, rows, latest, windowDays, ranges }: {
  customers: Mover[]; selected: string; onSelect: (c: string) => void
  rows: WasteRow[]; latest: string | null; windowDays: number; ranges: Ranges | null
}) {
  const custRows = useMemo(() => rows.filter(r => customerOf(r) === selected), [rows, selected])
  const problems = useMemo(() => rankByRecent(custRows, problemOf, latest, windowDays), [custRows, latest, windowDays])
  const cust = customers.find(c => c.key === selected)
  const recentTotal = problems.reduce((s, p) => s + p.recentValue, 0)
  const maxRecent   = Math.max(...problems.map(p => p.recentValue), 1)

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h3 className="card-title">ปัญหาของลูกค้า</h3>
        <select value={selected} onChange={e => onSelect(e.target.value)}
          className="border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 dark:bg-slate-800/50 focus:outline-none focus:border-blue-400">
          {customers.map(c => (
            <option key={c.key} value={c.key}>{c.key} — {fmtK(c.recentValue)} ({c.recentCount} ครั้ง)</option>
          ))}
        </select>
        {cust && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ช่วงล่าสุด <strong className="text-slate-700 dark:text-slate-200">{fmtFull(cust.recentValue)}</strong> THB · {cust.recentCount} ครั้ง
            {' · '}
            <span style={{ color: cust.delta > 0 ? '#ef4444' : cust.delta < 0 ? '#059669' : '#64748b' }}>
              {cust.delta > 0 ? '+' : ''}{fmtK(cust.delta)} {cust.pct === null ? '(ใหม่)' : `(${cust.pct > 0 ? '+' : ''}${(cust.pct * 100).toFixed(0)}%)`} เทียบช่วงก่อนหน้า
            </span>
          </span>
        )}
      </div>

      {!problems.length ? <p className="text-xs text-slate-400 py-6 text-center">ไม่มีข้อมูลในสองช่วงนี้</p> : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="text-left py-1.5 font-medium w-6">#</th>
              <th className="text-left py-1.5 font-medium">ปัญหา</th>
              <th className="text-left py-1.5 font-medium w-[34%]">สัดส่วนช่วงล่าสุด</th>
              <th className="text-right py-1.5 font-medium align-bottom">
                ล่าสุด{ranges && <span className="block text-[10px] font-normal text-slate-400 whitespace-nowrap">{ranges.recent}</span>}
              </th>
              <th className="text-right py-1.5 font-medium align-bottom">
                ก่อนหน้า{ranges && <span className="block text-[10px] font-normal text-slate-400 whitespace-nowrap">{ranges.prior}</span>}
              </th>
              <th className="text-right py-1.5 font-medium">เปลี่ยน</th>
            </tr>
          </thead>
          <tbody>
            {problems.map((p, i) => {
              const share = recentTotal > 0 ? p.recentValue / recentTotal : 0
              const dColor = p.delta > 0 ? '#ef4444' : p.delta < 0 ? '#059669' : '#94a3b8'
              return (
                <tr key={p.key} className="border-b border-slate-50 dark:border-slate-800">
                  <td className="py-1.5 text-slate-300 dark:text-slate-600">{i + 1}</td>
                  <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">{p.key}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.recentValue / maxRecent * 100}%` }}/>
                      </div>
                      <span className="w-9 text-right tabular-nums text-slate-500 dark:text-slate-400">{(share * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{fmtK(p.recentValue)} <span className="text-slate-300 dark:text-slate-600">({p.recentCount})</span></td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{fmtK(p.priorValue)} <span className="text-slate-300 dark:text-slate-600">({p.priorCount})</span></td>
                  <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: dColor }}>
                    {p.delta > 0 ? '+' : ''}{fmtK(p.delta)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// แจ้งเตือนความผิดปกติ 7 วันล่าสุด
// ─────────────────────────────────────────────────────────────
const KIND_STYLE: Record<Anomaly['kind'], string> = {
  'ปัญหา':  'bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-900',
  'ลูกค้า': 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  'เครื่อง': 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700',
}

function AnomalySection({ items, latest, onPickCustomer }: { items: Anomaly[]; latest: string | null; onPickCustomer: (c: string) => void }) {
  const end = toDate(latest)
  const f = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
  const range = end ? `${f(new Date(end.getTime() - 6 * 86_400_000))}–${f(end)}` : ''
  const shown = items.slice(0, 10)
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 mb-1">
        <h3 className="card-title">⚠ สิ่งที่ผิดปกติใน 7 วันล่าสุด</h3>
        <span className="text-[11px] text-slate-400">{range} เทียบค่าเฉลี่ยต่อสัปดาห์ของ 8 สัปดาห์ก่อนหน้า</span>
      </div>
      <p className="text-[11px] text-slate-400 mb-3">ขึ้นเตือนเมื่อมูลค่าสัปดาห์นี้ ≥ 2 เท่าของปกติและสูงเกินช่วงแกว่งปกติ (อย่างน้อย 3 ครั้ง และ 5,000 บาท) หรือเป็นรายการใหม่ที่ไม่เคยเกินใน 8 สัปดาห์</p>
      {!shown.length ? (
        <p className="text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg px-3 py-2">✓ ไม่พบรายการที่พุ่งผิดปกติในสัปดาห์นี้</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-800">
              <th className="text-left py-1.5 font-medium w-16">ประเภท</th>
              <th className="text-left py-1.5 font-medium">รายการ</th>
              <th className="text-right py-1.5 font-medium">7 วันล่าสุด</th>
              <th className="text-right py-1.5 font-medium">ปกติ / สัปดาห์</th>
              <th className="text-right py-1.5 font-medium">เทียบปกติ</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(a => (
              <tr key={a.kind + a.key} className="border-b border-slate-50 dark:border-slate-800">
                <td className="py-1.5"><span className={`text-[10px] border rounded px-1.5 py-0.5 ${KIND_STYLE[a.kind]}`}>{a.kind}</span></td>
                <td className="py-1.5 pr-2 text-slate-700 dark:text-slate-200">
                  {a.kind === 'ลูกค้า'
                    ? <button onClick={() => onPickCustomer(a.key)} className="text-blue-600 dark:text-blue-400 hover:underline" title="ดูปัญหาของลูกค้ารายนี้">{a.key}</button>
                    : a.key}
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-100 font-medium">{fmtK(a.value)} <span className="text-slate-300 dark:text-slate-600">({a.count})</span></td>
                <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{a.baseline > 0 ? fmtK(a.baseline) : '—'}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold text-red-600 dark:text-red-400">{a.ratio === null ? 'ใหม่' : `${a.ratio.toFixed(1)} เท่า`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {items.length > shown.length && <p className="text-[11px] text-slate-400 mt-2">และอีก {items.length - shown.length} รายการ</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// งานที่เกิดซ้ำ
// ─────────────────────────────────────────────────────────────
const REPEAT_TOP = 15

function RepeatSection({ items, ranges, onPickCustomer }: { items: RepeatItem[]; ranges: Ranges | null; onPickCustomer: (c: string) => void }) {
  const [showAll, setShowAll] = useState(false)
  const shown = showAll ? items : items.slice(0, REPEAT_TOP)
  const sameCount = items.filter(i => i.sameProblem).length
  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 mb-1">
        <h3 className="card-title">ชิ้นงานที่มีปัญหาซ้ำ</h3>
        {ranges && <span className="text-[11px] text-slate-400">ช่วงล่าสุด {ranges.recent}</span>}
      </div>
      <p className="text-[11px] text-slate-400 mb-3">
        รหัสชิ้นงานเดิมที่เกิดปัญหา 3 ครั้งขึ้นไป หรือเกิดปัญหาเดิม 2 ครั้งขึ้นไป · พบ {items.length} รหัส
        {sameCount > 0 && <> · <span className="text-red-600 dark:text-red-400 font-medium">{sameCount} รหัสเกิดปัญหาเดิมซ้ำ</span> — แปลว่ายังไม่ได้แก้ที่ต้นเหตุ ควรดูก่อน</>}
      </p>
      {!items.length ? <p className="text-xs text-slate-400 py-6 text-center">ไม่มีชิ้นงานที่มีปัญหาซ้ำในช่วงนี้</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-800">
                <th className="text-left py-1.5 font-medium">รหัสชิ้นงาน</th>
                <th className="text-left py-1.5 font-medium">ลูกค้า</th>
                <th className="text-right py-1.5 font-medium">ครั้ง</th>
                <th className="text-right py-1.5 font-medium">มูลค่า</th>
                <th className="text-left py-1.5 font-medium pl-3">ปัญหาที่พบ</th>
                <th className="text-right py-1.5 font-medium">ล่าสุด</th>
                <th className="text-right py-1.5 font-medium" title="จำนวนครั้งทั้งหมดตั้งแต่มีข้อมูล">ทั้งหมด</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(i => (
                <tr key={i.code} className={`border-b border-slate-50 dark:border-slate-800 ${i.sameProblem ? 'bg-red-50/40 dark:bg-red-950/30' : ''}`}>
                  <td className="py-1.5 pr-2 font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">{i.code}</td>
                  <td className="py-1.5 pr-2">
                    <button onClick={() => onPickCustomer(i.customer)} className="text-blue-600 dark:text-blue-400 hover:underline">{i.customer}</button>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-100 font-semibold">
                    {i.count}{i.jobs !== i.count && <span className="text-slate-300 dark:text-slate-600 font-normal" title="จำนวน JO ที่ต่างกัน"> ({i.jobs} JO)</span>}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700 dark:text-slate-200">{fmtK(i.value)}</td>
                  <td className="py-1.5 pl-3">
                    <div className="flex flex-wrap gap-1">
                      {i.problems.slice(0, 3).map(p => (
                        <span key={p.key} className={`text-[10px] rounded px-1.5 py-0.5 border ${p.key === i.sameProblem ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900 font-semibold' : 'bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                          {p.key}{p.count > 1 && ` ×${p.count}`}
                        </span>
                      ))}
                      {i.problems.length > 3 && <span className="text-[10px] text-slate-400">+{i.problems.length - 3}</span>}
                    </div>
                  </td>
                  <td className="py-1.5 text-right text-slate-500 dark:text-slate-400 whitespace-nowrap">{i.lastDate.slice(0, 6)}</td>
                  <td className="py-1.5 text-right tabular-nums text-slate-400">{i.allTime}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {items.length > REPEAT_TOP && (
        <button onClick={() => setShowAll(v => !v)} className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:underline">
          {showAll ? 'แสดงน้อยลง' : `แสดงทั้งหมด ${items.length} รหัส`}
        </button>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// คาดการณ์ 6 เดือนข้างหน้า
// ─────────────────────────────────────────────────────────────
function TrendTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendPoint }> }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div style={{ background:'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', fontSize: 11, boxShadow: '0 4px 12px var(--shadow)' }}>
      <p style={{ fontWeight: 600, color:'var(--text-strong)', marginBottom: 4 }}>
        {p.label}{p.kind === 'current' ? ' (เดือนปัจจุบัน)' : p.kind === 'future' ? ' (คาดการณ์)' : ''}
      </p>
      {p.actual !== null && <p style={{ color: 'var(--text-2)' }}>{p.kind === 'current' ? 'ยอดถึงวันล่าสุด' : 'ยอดจริง'}: {fmtFull(p.actual)}</p>}
      {p.kind !== 'history' && p.forecast !== null && <p style={{ color: '#7c3aed', fontWeight: 600 }}>คาดการณ์: {fmtFull(p.forecast)}</p>}
      {p.band && <p style={{ color: '#a78bfa' }}>ช่วง 80%: {fmtK(p.band[0])} – {fmtK(p.band[1])}</p>}
      {p.target !== null && <p style={{ color: '#2563eb' }}>Target: {fmtFull(p.target)}</p>}
    </div>
  )
}

const BAR = 30   // ความกว้างแท่งสูงสุด (จอแคบจะหดลงเอง)

// ตัวเลขยอดคาดการณ์เหนือแท่ง — ซ่อนเมื่อแท่งแคบเกินจะอ่านออก
function ForecastLabel(p: { x?: number | string; y?: number | string; width?: number | string; value?: number | string | null }) {
  const x = Number(p.x ?? 0), y = Number(p.y ?? 0), w = Number(p.width ?? 0), v = Number(p.value ?? 0)
  if (!v || w < 18) return <g/>
  return <text x={x + w / 2} y={y - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#475569">{fmtK(v)}</text>
}

function TrendSection({ tf }: { tf: TrendForecast | null }) {
  if (!tf) return <div className="card p-4 text-xs text-slate-400 text-center">ข้อมูลย้อนหลังยังไม่พอคาดการณ์ (ต้องมีอย่างน้อย 6 เดือน)</div>
  const ahead   = tf.points.filter(p => p.kind === 'future')
  const sumF    = ahead.reduce((s, p) => s + (p.forecast ?? 0), 0)
  const sumT    = ahead.reduce((s, p) => s + (p.target ?? 0), 0)
  const over    = ahead.filter(p => p.target && (p.forecast ?? 0) > p.target)
  const risky   = ahead.filter(p => p.target && (p.forecast ?? 0) <= p.target && p.band && p.band[1] > p.target)
  const span    = ahead.length ? `${ahead[0].label} – ${ahead[ahead.length - 1].label}` : ''
  const table   = tf.points.filter(p => p.kind !== 'history')
  const trendTxt = Math.abs(tf.slope) < 1000 ? 'ทรงตัว' : tf.slope > 0 ? `เพิ่มขึ้นเฉลี่ยเดือนละ ${fmtK(tf.slope)}` : `ลดลงเฉลี่ยเดือนละ ${fmtK(-tf.slope)}`

  // ข้อมูลกราฟแบบซ้อน (stack): solid = ยอดจริง, remain = ส่วนที่คาดว่าจะเพิ่มจนถึงยอดคาดการณ์
  // เดือนปัจจุบันจึงเป็นส่วนทึบ (ถึงวันล่าสุด) + กรอบประด้านบน (ที่เหลือจนสิ้นเดือน)
  const chartData = tf.points.map(p => ({
    ...p,
    solid:  p.actual,
    remain: p.kind === 'history' || p.forecast === null ? null : Math.max(0, p.forecast - (p.actual ?? 0)),
    fLabel: p.kind === 'history' ? null : p.forecast,
  }))
  const firstAhead = table[0]?.label, lastAhead = table[table.length - 1]?.label

  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="card-title">คาดการณ์ 6 เดือนข้างหน้า</h3>
        <span className="text-[11px] text-slate-400">แนวโน้ม {tf.fitMonths} เดือนที่ผ่านมา: {trendTxt}</span>
      </div>

      {sumT > 0 && (
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: sumF > sumT ? 'var(--bad-bg)' : 'var(--good-bg)' }}>
          <p className="font-semibold" style={{ color: sumF > sumT ? 'var(--bad-fg)' : 'var(--good-fg)' }}>
            {span}: คาดการณ์รวม {fmtK(sumF)} เทียบ target {fmtK(sumT)} ({pct(sumF / sumT, 0)})
          </p>
          <p className="text-slate-600 dark:text-slate-300 mt-0.5">
            {over.length
              ? <>เดือนที่คาดว่าจะ<span className="text-red-600 dark:text-red-400 font-semibold">เกิน target</span>: {over.map(p => p.label).join(', ')}</>
              : 'ไม่มีเดือนที่คาดว่าจะเกิน target'}
            {risky.length > 0 && <> · เสี่ยงเกินถ้าออกทางสูง: {risky.map(p => p.label).join(', ')}</>}
          </p>
        </div>
      )}

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={chartData} margin={{ top: 22, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
          {firstAhead && lastAhead && (
            <ReferenceArea x1={firstAhead} x2={lastAhead} fill="#7c3aed" fillOpacity={0.04} stroke="none"
              label={{ value: 'คาดการณ์ →', position: 'insideTopLeft', fontSize: 11, fill: '#7c3aed', offset: 4 }}/>
          )}
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} width={44} axisLine={false} tickLine={false}/>
          <Tooltip content={<TrendTooltip/>} cursor={{ fill: 'rgba(148,163,184,0.08)' }}/>
          {/* ส่วนทึบ = ยอดจริง */}
          <Bar dataKey="solid" stackId="m" maxBarSize={BAR} isAnimationActive={false}>
            {chartData.map(p => (
              <Cell key={p.key} fill={p.target || (p.actual ?? 0) > 0 ? achColor(achRatio(p.actual ?? 0, p.target ?? 0)) : '#94a3b8'} fillOpacity={0.85}/>
            ))}
          </Bar>
          {/* ส่วนกรอบประ = คาดการณ์ (สีตาม % target ของยอดคาดการณ์) + ตัวเลขยอดคาดการณ์บนแท่ง */}
          <Bar dataKey="remain" stackId="m" maxBarSize={BAR} isAnimationActive={false}>
            {chartData.map(p => {
              const c = p.target && p.forecast !== null ? achColor(p.forecast / p.target) : '#7c3aed'
              return <Cell key={p.key} fill={c} fillOpacity={0.15} stroke={c} strokeWidth={1.5} strokeDasharray="4 3"/>
            })}
            <LabelList dataKey="fLabel" content={ForecastLabel}/>
          </Bar>
          <Line dataKey="target" stroke="#2563eb" strokeWidth={1.5} strokeDasharray="5 3" dot={false} isAnimationActive={false}/>
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block bg-emerald-600"/>ยอดจริง (สีตาม % target)</span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'rgba(239,68,68,0.15)', border: '1.5px dashed #ef4444' }}/>คาดการณ์ (สีตาม % target)
        </span>
        <span className="flex items-center gap-1.5"><svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke="#2563eb" strokeWidth="1.5" strokeDasharray="5 3"/></svg>Target</span>
        <span className="text-slate-400">· เดือนปัจจุบัน: ส่วนทึบ = ยอดถึงวันล่าสุด, ส่วนกรอบประ = ที่คาดว่าจะเพิ่มจนสิ้นเดือน · ช่วงความเป็นไปได้ 80% ดูในตารางด้านล่าง</span>
      </div>

      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400 border-b border-slate-100 dark:border-slate-800">
            <th className="text-left py-1.5 font-medium">เดือน</th>
            <th className="text-right py-1.5 font-medium">คาดการณ์</th>
            <th className="text-right py-1.5 font-medium">ช่วง 80%</th>
            <th className="text-right py-1.5 font-medium">Target</th>
            <th className="text-right py-1.5 font-medium">% ของ target</th>
          </tr>
        </thead>
        <tbody>
          {table.map(p => {
            const r = p.target && p.forecast !== null ? p.forecast / p.target : null
            return (
              <tr key={p.key} className="border-b border-slate-50 dark:border-slate-800">
                <td className="py-1.5 text-slate-700 dark:text-slate-200">
                  {p.label}{p.kind === 'current' && <span className="text-[10px] text-slate-400"> · เดือนปัจจุบัน (จากอัตราต่อวัน)</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-100 font-medium">{p.forecast !== null ? fmtK(p.forecast) : '—'}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-400">{p.band ? `${fmtK(p.band[0])} – ${fmtK(p.band[1])}` : '—'}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{p.target ? fmtK(p.target) : '—'}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold" style={{ color: r !== null ? achColor(r) : '#94a3b8' }}>
                  {r !== null ? pct(r, 0) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <p className="text-[11px] text-slate-400">
        วิธีคิด: ลากเส้นแนวโน้มจาก {tf.fitMonths} เดือนล่าสุดที่จบแล้ว แล้วให้แนวโน้มค่อย ๆ อ่อนลงในเดือนถัดไป (ไม่ลากเส้นตรงยาว) ·
        ข้อมูลย้อนหลังยังไม่ถึง 24 เดือน จึงยังไม่คิดผลของฤดูกาล — ดูเป็นทิศทาง ไม่ใช่ตัวเลขตั้งเป้า · ยิ่งไกลช่วงความเป็นไปได้ยิ่งกว้าง
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// อัตราเทียบปริมาณงาน
// ─────────────────────────────────────────────────────────────
const pct = (v: number, d = 1) => `${(v * 100).toFixed(d)}%`
const chg = (a: number, b: number) => (b > 0 ? a / b - 1 : 0)
const signed = (v: number) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`

/** สรุปว่าตัวเศษเปลี่ยนเพราะปริมาณงาน หรือเพราะอัตราเปลี่ยนจริง */
function Verdict({ cmp, numName, denName, digits }: { cmp: SpanCompare | null; numName: string; denName: string; digits: number }) {
  if (!cmp) return <p className="text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">ข้อมูลยังไม่พอเปรียบเทียบ</p>
  const numChg = chg(cmp.numRecent, cmp.numPrior), denChg = chg(cmp.denRecent, cmp.denPrior)
  const rateChg = chg(cmp.rateRecent, cmp.ratePrior)
  const flat = Math.abs(rateChg) < 0.05
  let msg: string, tone: 'bad' | 'good' | 'flat'
  if (flat)                        { tone = 'flat'; msg = `อัตราทรงตัว — ${numName} เปลี่ยนไปตาม ${denName}` }
  else if (rateChg > 0 && numChg > 0) { tone = 'bad';  msg = `${numName} เพิ่มเร็วกว่า ${denName} — แย่ลงจริง ไม่ใช่แค่ผลิตมากขึ้น` }
  else if (rateChg > 0)            { tone = 'bad';  msg = `${numName} ลดลง แต่ ${denName} ลดมากกว่า — อัตราจริงแย่ลง` }
  else if (numChg > 0)             { tone = 'good'; msg = `${numName} เพิ่มเพราะ ${denName} เพิ่ม — อัตราจริงดีขึ้น` }
  else                             { tone = 'good'; msg = `${numName} ลดลงเร็วกว่า ${denName} — ดีขึ้นจริง` }
  const bg = tone === 'bad' ? 'var(--bad-bg)' : tone === 'good' ? 'var(--good-bg)' : 'var(--subtle-bg)'
  const fg = tone === 'bad' ? 'var(--bad-fg)' : tone === 'good' ? 'var(--good-fg)' : 'var(--text-2)'
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: bg }}>
      <p className="font-semibold" style={{ color: fg }}>{msg}</p>
      <p className="text-slate-500 dark:text-slate-400 mt-0.5">
        {cmp.recentLabel} เทียบ {cmp.priorLabel}: {numName} {signed(numChg)} · {denName} {signed(denChg)}
        {' → '}อัตรา {pct(cmp.ratePrior, digits)} → <strong style={{ color: fg }}>{pct(cmp.rateRecent, digits)}</strong>
      </p>
    </div>
  )
}

function RateChart({ series, barKey, barName, lineKey, lineName, lineDigits, barFmt }: {
  series: RatePoint[]; barKey: 'waste' | 'probJobs'; barName: string
  lineKey: 'rate' | 'share'; lineName: string; lineDigits: number; barFmt: (v: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={series} margin={{ top: 16, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
        <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false} interval={0}/>
        <YAxis yAxisId="b" tickFormatter={barFmt} tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} axisLine={false} tickLine={false}/>
        <YAxis yAxisId="r" orientation="right" tickFormatter={(v: number) => pct(v, lineDigits)}
          tick={{ fontSize: 9, fill: '#7c3aed' }} width={44} axisLine={false} tickLine={false}/>
        <Tooltip formatter={(v: number, name: string) => name === lineName ? pct(v, lineDigits) : barFmt(v)}
          labelFormatter={(l: string, p) => {
            const pt = p?.[0]?.payload as RatePoint | undefined
            return pt?.partial ? `${l} (ยังไม่จบเดือน)` : l
          }}
          contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid var(--border)' }}/>
        <Bar yAxisId="b" dataKey={barKey} name={barName} maxBarSize={28}>
          {series.map(p => <Cell key={p.key} fill="#94a3b8" fillOpacity={p.partial ? 0.35 : 0.7}/>)}
        </Bar>
        <Line yAxisId="r" dataKey={lineKey} name={lineName} stroke="#7c3aed" strokeWidth={2} connectNulls={false}
          dot={{ r: 3, fill: '#7c3aed' }} isAnimationActive={false}/>
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function RateSection({ series }: { series: RatePoint[] }) {
  const wasteCmp = useMemo(() => compareSpans(series, p => p.waste, p => p.sales, 3), [series])
  const jobsCmp  = useMemo(() => compareSpans(series, p => p.probJobs, p => p.prodJobs, 1), [series])
  const firstProd = series.find(p => p.prodJobs !== null)
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="card p-4 space-y-2">
        <h3 className="card-title">Waste เทียบยอดขาย</h3>
        <p className="text-[11px] text-slate-400">แท่ง = มูลค่า waste · เส้น = waste rate (waste ÷ ยอดขาย) · เทียบ 3 เดือนที่จบแล้วล่าสุดกับ 3 เดือนก่อนหน้า</p>
        <Verdict cmp={wasteCmp} numName="waste" denName="ยอดขาย" digits={2}/>
        <RateChart series={series} barKey="waste" barName="waste" lineKey="rate" lineName="waste rate" lineDigits={2} barFmt={fmtK}/>
      </div>
      <div className="card p-4 space-y-2">
        <h3 className="card-title">งานที่มีปัญหา เทียบงานผลิตทั้งหมด</h3>
        <p className="text-[11px] text-slate-400">
          แท่ง = จำนวนงานที่มีปัญหา · เส้น = สัดส่วนต่องานผลิตทั้งหมด · เทียบเดือนที่จบแล้วล่าสุดกับเดือนก่อนหน้า
          {firstProd && <> · มีข้อมูลงานผลิตตั้งแต่ {firstProd.label}</>}
        </p>
        <Verdict cmp={jobsCmp} numName="งานที่มีปัญหา" denName="งานผลิต" digits={1}/>
        <RateChart series={series} barKey="probJobs" barName="งานที่มีปัญหา" lineKey="share" lineName="สัดส่วน" lineDigits={1} barFmt={v => String(Math.round(v))}/>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// เครื่องจักร × ปัญหา
// ─────────────────────────────────────────────────────────────
const LIFT_ALERT = 2   // เกิดบ่อยกว่าสัดส่วนปกติของเครื่องนั้น 2 เท่าขึ้นไป

function MachineHeatmap({ matrix, ranges }: { matrix: MachineMatrix | null; ranges: Ranges | null }) {
  if (!matrix || !matrix.machines.length) return <div className="card p-4 text-xs text-slate-400 text-center">ไม่มีข้อมูลเครื่องจักรในช่วงนี้</div>
  const { machines, problems, cells, withMachine, totalRows } = matrix
  const maxCell = Math.max(...[...cells.values()].map(c => c.value), 1)
  const coverage = totalRows > 0 ? withMachine / totalRows : 0
  // จุดผิดปกติ: เกิดบ่อยกว่าปกติ ≥ 2 เท่า, อย่างน้อย 3 ครั้ง, และเป็นส่วนที่มีนัยของเครื่องนั้น (≥ 5%)
  const isAlert = (m: string, p: string) => {
    const c = cells.get(`${m}||${p}`)
    const mt = machines.find(x => x.key === m)?.total ?? 0
    return !!c && p !== OTHER_PROBLEMS && c.lift >= LIFT_ALERT && c.count >= 3 && c.value >= mt * 0.05
  }
  const alerts = machines.flatMap(m => problems.filter(p => isAlert(m.key, p.key)).map(p => ({ m: m.key, p: p.key, ...cells.get(`${m.key}||${p.key}`)! })))
    .sort((a, b) => b.lift - a.lift).slice(0, 6)

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
        <h3 className="card-title">เครื่องจักร × ปัญหา</h3>
        {ranges && <span className="text-[11px] text-slate-400">ช่วงล่าสุด {ranges.recent}</span>}
      </div>
      <p className="text-[11px] text-slate-400 mb-3">
        ช่อง = มูลค่า waste (สีเข้ม = มาก) · <span className="text-red-600 dark:text-red-400 font-medium">กรอบแดง ▲</span> = เครื่องนี้เกิดปัญหานี้บ่อยกว่าสัดส่วนปกติของตัวเองตั้งแต่ {LIFT_ALERT} เท่าขึ้นไป — น่าจะเป็นปัญหาที่ตัวเครื่อง
      </p>
      {coverage < 0.8 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 rounded-lg px-3 py-1.5 mb-3">
          ⚠ มีชื่อเครื่องแค่ {withMachine.toLocaleString()} จาก {totalRows.toLocaleString()} แถว ({pct(coverage, 0)}) — แถวที่ไม่มีชื่อเครื่องไม่ได้นับในตารางนี้ (ส่วนใหญ่มาจาก Addpaper)
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate" style={{ borderSpacing: 2 }}>
          <thead>
            <tr>
              <th className="text-left text-slate-400 font-medium px-1">เครื่อง</th>
              {problems.map(p => <th key={p.key} className="text-slate-500 dark:text-slate-400 font-medium px-1 pb-1 align-bottom max-w-[90px]" title={p.key}>
                <span className="block truncate">{p.key}</span></th>)}
              <th className="text-right text-slate-400 font-medium px-1">รวม</th>
            </tr>
          </thead>
          <tbody>
            {machines.map(m => (
              <tr key={m.key}>
                <td className="text-slate-700 dark:text-slate-200 font-mono px-1 whitespace-nowrap">{m.key}</td>
                {problems.map(p => {
                  const c = cells.get(`${m.key}||${p.key}`)
                  const a = isAlert(m.key, p.key)
                  const t = c ? Math.sqrt(c.value / maxCell) : 0
                  return (
                    <td key={p.key} className="text-center tabular-nums rounded"
                      style={{
                        background: c ? `rgba(37,99,235,${0.08 + t * 0.72})` : 'var(--subtle-bg)',
                        color: t > 0.55 ? '#fff' : 'var(--text-strong)',
                        boxShadow: a ? 'inset 0 0 0 2px #ef4444' : undefined,
                        height: 28, minWidth: 52,
                      }}
                      title={c ? `${m.key} · ${p.key}\n${fmtFull(c.value)} THB · ${c.count} ครั้ง\nบ่อยกว่าสัดส่วนปกติ ${c.lift.toFixed(1)} เท่า` : `${m.key} · ${p.key}: ไม่มี`}>
                      {c ? <>{fmtK(c.value)}{a && <span className="text-red-600 dark:text-red-400 font-bold" style={{ color: t > 0.55 ? '#fecaca' : 'var(--bad-fg)' }}> ▲</span>}</> : ''}
                    </td>
                  )
                })}
                <td className="text-right tabular-nums text-slate-500 dark:text-slate-400 px-1">{fmtK(m.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {alerts.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">จุดที่น่าตรวจสอบ</p>
          <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
            {alerts.map(a => (
              <li key={`${a.m}${a.p}`}>
                <span className="font-mono text-slate-800 dark:text-slate-100">{a.m}</span> · <strong>{a.p}</strong>
                {' — '}บ่อยกว่าสัดส่วนปกติของเครื่องนี้ <span className="text-red-600 dark:text-red-400 font-semibold">{a.lift.toFixed(1)} เท่า</span>
                <span className="text-slate-400"> ({fmtK(a.value)}, {a.count} ครั้ง)</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// หน้า Insights
// ─────────────────────────────────────────────────────────────
export function InsightsPage({ salesMap, prodJobs }: { salesMap: SalesMap; prodJobs: ProductionJobs }) {
  const rpM  = useWasteData('Replan',   'MONTHLY')
  const apM  = useWasteData('Addpaper', 'MONTHLY')
  const rpDt = useWasteData('Replan',   'DETAIL')
  const apDt = useWasteData('Addpaper', 'DETAIL')

  const [scope, setScope]           = useState<Scope>('Combined')
  const [windowDays, setWindowDays] = useState<number>(90)

  const latestR = useMemo(() => latestDate(rpDt.rows), [rpDt.rows])
  const latestA = useMemo(() => latestDate(apDt.rows), [apDt.rows])

  const fcR = useMemo(() => forecastMonthEnd(rpM.rows, latestR), [rpM.rows, latestR])
  const fcA = useMemo(() => forecastMonthEnd(apM.rows, latestA), [apM.rows, latestA])
  const fcC = useMemo(() => combineForecasts(fcR, fcA), [fcR, fcA])

  // แถวและวันสิ้นสุดของช่วงเปรียบเทียบ — รวม 2 ชุดใช้วันที่ของชุดที่ข้อมูลช้ากว่า
  // เพื่อไม่ให้วันที่อีกชุดยังไม่มีข้อมูลดึงยอดช่วงล่าสุดให้ต่ำเกินจริง
  // นับเฉพาะแผนกผลิตในโรงงาน
  const scopeRows = useMemo(() =>
    (scope === 'Replan' ? rpDt.rows : scope === 'Addpaper' ? apDt.rows : [...rpDt.rows, ...apDt.rows]).filter(isInHouse),
  [scope, rpDt.rows, apDt.rows])
  const scopeLatest = useMemo(() => {
    if (scope === 'Replan')   return latestR
    if (scope === 'Addpaper') return latestA
    const r = toDate(latestR), a = toDate(latestA)
    if (!r || !a) return latestR ?? latestA
    return r <= a ? latestR : latestA
  }, [scope, latestR, latestA])

  // รายชื่อลูกค้าให้เลือก เรียงตามมูลค่าช่วงล่าสุด — ค่าเริ่มต้นคือรายที่มากที่สุด
  const customerList = useMemo(() => rankByRecent(scopeRows, customerOf, scopeLatest, windowDays), [scopeRows, scopeLatest, windowDays])
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null)
  const activeCustomer = selectedCustomer && customerList.some(c => c.key === selectedCustomer)
    ? selectedCustomer : customerList[0]?.key ?? null
  const drillRef = useRef<HTMLDivElement>(null)
  const pickCustomer = (c: string) => {
    setSelectedCustomer(c)
    drillRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // อัตราเทียบปริมาณงาน 12 เดือน — ยอดขายเป็นตัวเลขระดับโรงงาน (sales_replan = sales_addpaper)
  const rateSeries = useMemo(() => buildRateSeries({
    monthly: scope === 'Replan' ? rpM.rows : scope === 'Addpaper' ? apM.rows : [...rpM.rows, ...apM.rows],
    detail: scopeRows, latestDate: scopeLatest, months: 12,
    salesFor: k => { const s = salesMap.get(k); const v = s ? (scope === 'Addpaper' ? s.addpaper : s.replan) : 0; return v > 0 ? v : null },
    prodFor:  k => prodJobs.byMonth.get(k)?.total ?? null,
  }), [scope, rpM.rows, apM.rows, scopeRows, scopeLatest, salesMap, prodJobs.byMonth])

  const matrix    = useMemo(() => machineProblemMatrix(scopeRows, scopeLatest, windowDays), [scopeRows, scopeLatest, windowDays])
  const repeats   = useMemo(() => repeatJobs(scopeRows, scopeLatest, windowDays), [scopeRows, scopeLatest, windowDays])
  const anomalies = useMemo(() => detectAnomalies(scopeRows, scopeLatest), [scopeRows, scopeLatest])

  // คาดการณ์ 6 เดือน — เดือนปัจจุบันใช้ยอดคาดการณ์สิ้นเดือนจากอัตราต่อวัน ให้ตรงกับการ์ดด้านบน
  const trend = useMemo(() => {
    const monthly = scope === 'Replan' ? rpM.rows : scope === 'Addpaper' ? apM.rows : [...rpM.rows, ...apM.rows]
    const fc = scope === 'Replan' ? fcR : scope === 'Addpaper' ? fcA : fcC
    return forecastTrend(monthly, scopeLatest, 12, 6, 0.8, fc?.projected ?? null)
  }, [scope, rpM.rows, apM.rows, scopeLatest, fcR, fcA, fcC])

  const loading = rpM.loading || apM.loading || rpDt.loading || apDt.loading
  const error   = rpM.error ?? apM.error ?? rpDt.error ?? apDt.error

  // ช่วงวันที่ของสองคอลัมน์ — ต้องตรงกับที่ computeMovers ใช้ (ล่าสุด = อายุ 0…w−1 วัน, ก่อนหน้า = w…2w−1)
  const ranges = useMemo<Ranges | null>(() => {
    const end = toDate(scopeLatest)
    if (!end) return null
    const f = (d: Date) => d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
    const day = 24 * 60 * 60 * 1000
    const recentStart = new Date(end.getTime() - (windowDays - 1) * day)
    const priorEnd    = new Date(recentStart.getTime() - day)
    const priorStart  = new Date(priorEnd.getTime() - (windowDays - 1) * day)
    return { recent: `${f(recentStart)}–${f(end)}`, prior: `${f(priorStart)}–${f(priorEnd)}` }
  }, [scopeLatest, windowDays])

  if (error) return <div className="card p-4 text-sm text-red-600 dark:text-red-400 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40">⚠ {error}</div>

  return (
    <div className="space-y-4">
      {/* ── คาดการณ์สิ้นเดือน ── */}
      <SectionLabel>คาดการณ์สิ้นเดือน</SectionLabel>
      <p className="text-xs text-slate-400 -mt-2">ถ้าอัตราเฉลี่ยต่อวันยังเท่าเดิมจนสิ้นเดือน ยอดจะอยู่ที่เท่าไหร่ เทียบกับ target ทั้งเดือน</p>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="card h-56 animate-pulse bg-slate-100 dark:bg-slate-800"/>)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ForecastCard title="Replan"   fc={fcR}/>
          <ForecastCard title="Addpaper" fc={fcA}/>
          <ForecastCard title="รวม"      fc={fcC}/>
        </div>
      )}

      {/* ── เลือกชุดข้อมูล — มีผลกับทุกส่วนด้านล่าง ── */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500 dark:text-slate-400">ข้อมูล</span>
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 gap-0.5">
          {(['Combined','Replan','Addpaper'] as Scope[]).map(s => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${scope===s ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-slate-400">มีผลกับทุกส่วนด้านล่าง</span>
      </div>

      {/* ── แจ้งเตือนความผิดปกติ ── */}
      {loading ? <div className="card h-40 animate-pulse bg-slate-100 dark:bg-slate-800"/> :
        <AnomalySection items={anomalies} latest={scopeLatest} onPickCustomer={pickCustomer}/>}

      {/* ── คาดการณ์ 6 เดือน ── */}
      <SectionLabel>คาดการณ์ 6 เดือนข้างหน้า</SectionLabel>
      <p className="text-xs text-slate-400 -mt-2">รายเดือน — ใช้ข้อมูล 12 เดือนที่ผ่านมาเสมอ</p>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100 dark:bg-slate-800"/> : <TrendSection tf={trend}/>}

      {/* ── อัตราเทียบปริมาณงาน ── */}
      <SectionLabel>เทียบกับปริมาณงาน</SectionLabel>
      <p className="text-xs text-slate-400 -mt-2">waste ที่เพิ่มขึ้นอาจเป็นเพราะผลิตมากขึ้นเฉย ๆ — ดูอัตราต่อยอดขายและต่องานผลิต เพื่อแยกว่าคุณภาพเปลี่ยนจริงไหม (รายเดือน 12 เดือน · แท่งจาง = เดือนที่ยังไม่จบ)</p>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100 dark:bg-slate-800"/> : <RateSection series={rateSeries}/>}

      {/* ── เลือกช่วงเทียบ — มีผลกับตารางแนวโน้ม เจาะลึกรายลูกค้า และเครื่องจักร ── */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3 border-l-4 border-l-blue-400">
        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">เทียบช่วง</span>
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 gap-0.5">
          {WINDOWS.map(w => (
            <button key={w} onClick={() => setWindowDays(w)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${windowDays===w ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
              {w} วัน
            </button>
          ))}
        </div>
        {ranges && <span className="text-xs text-slate-500 dark:text-slate-400">ล่าสุด <strong className="text-slate-700 dark:text-slate-200">{ranges.recent}</strong> เทียบ ก่อนหน้า <strong className="text-slate-700 dark:text-slate-200">{ranges.prior}</strong></span>}
        <span className="text-[11px] text-slate-400 ml-auto">มีผลกับตารางแนวโน้มลูกค้า/ปัญหา, เจาะลึกรายลูกค้า และเครื่องจักร</span>
      </div>

      {/* ── ลูกค้า ── */}
      <SectionLabel>แนวโน้มลูกค้า</SectionLabel>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100 dark:bg-slate-800"/> :
        <MoversSection title="ลูกค้า" rows={scopeRows} keyFn={customerOf} latest={scopeLatest} windowDays={windowDays} ranges={ranges} onPick={pickCustomer}/>}

      {/* ── เจาะลึกรายลูกค้า ── */}
      <div ref={drillRef} className="scroll-mt-20">
        <SectionLabel>เจาะลึกรายลูกค้า</SectionLabel>
      </div>
      <p className="text-xs text-slate-400 -mt-2">เลือกลูกค้า หรือคลิกชื่อลูกค้าในตารางด้านบน เพื่อดูว่ามีปัญหาอะไรบ้าง เรียงจากมูลค่าช่วงล่าสุดมากไปน้อย</p>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100 dark:bg-slate-800"/> : activeCustomer &&
        <CustomerDrill customers={customerList} selected={activeCustomer} onSelect={setSelectedCustomer}
          rows={scopeRows} latest={scopeLatest} windowDays={windowDays} ranges={ranges}/>}

      {/* ── งานที่เกิดซ้ำ ── */}
      <SectionLabel>ชิ้นงานที่มีปัญหาซ้ำ</SectionLabel>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100 dark:bg-slate-800"/> :
        <RepeatSection items={repeats} ranges={ranges} onPickCustomer={pickCustomer}/>}

      {/* ── ปัญหา ── */}
      <SectionLabel>แนวโน้มปัญหา</SectionLabel>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100 dark:bg-slate-800"/> :
        <MoversSection title="ปัญหา" rows={scopeRows} keyFn={problemOf} latest={scopeLatest} windowDays={windowDays} ranges={ranges}/>}

      {/* ── เครื่องจักร × ปัญหา ── */}
      <SectionLabel>เครื่องจักรที่เป็นจุดเสี่ยง</SectionLabel>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100 dark:bg-slate-800"/> : <MachineHeatmap matrix={matrix} ranges={ranges}/>}

      <p className="text-[11px] text-slate-400 text-center pb-2">
        นับเฉพาะแผนกผลิตในโรงงาน (PR1, PR2, CON1, CON2, GL1, PDTN) ไม่รวมงานจ้าง · แสดงเฉพาะรายการที่เกิดอย่างน้อย 3 ครั้งในช่วงใดช่วงหนึ่ง · ชื่อลูกค้าตัดจากรหัสงานก่อนวงเล็บ เช่น TGT(663) → TGT
      </p>
    </div>
  )
}
