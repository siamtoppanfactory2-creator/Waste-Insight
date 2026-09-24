import { useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useWasteData } from '../hooks/useWasteData'
import { latestDate } from '../utils/targetPace'
import {
  achColor, toDate, customerOf, problemOf, forecastMonthEnd, computeMovers, rankByRecent, isInHouse,
} from '../utils/insights'
import type { MonthForecast, Mover } from '../utils/insights'
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
      <div className="flex-1 h-px bg-slate-200"/>
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

        <p className="text-xs text-slate-500 mt-2">คาดการณ์สิ้นเดือน</p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums" style={{ color }}>{fmtK(fc.projected)}</span>
          <span className="text-sm font-semibold tabular-nums" style={{ color }}>{(fc.projPct * 100).toFixed(0)}%</span>
          <span className="text-xs text-slate-400">ของ target {fmtK(fc.target)}</span>
        </div>

        {/* แถบ: ส่วนทึบ = ใช้ไปแล้ว, ส่วนจาง = ที่คาดว่าจะเพิ่ม, เส้นดำ = target */}
        <div className="relative mt-3 h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className="absolute left-0 top-0 h-full opacity-30" style={{ width: `${fc.projected / barMax * 100}%`, background: color }}/>
          <div className="absolute left-0 top-0 h-full" style={{ width: `${fc.actual / barMax * 100}%`, background: color }}/>
        </div>
        <div className="relative h-0">
          <div className="absolute -top-3 w-0.5 h-3.5 bg-slate-700" style={{ left: `calc(${fc.target / barMax * 100}% - 1px)` }} title="target"/>
        </div>

        <div className="mt-3 space-y-0.5 text-xs">
          <p className="flex justify-between"><span className="text-slate-500">ใช้ไปแล้ว ({fc.day}/{fc.daysInMonth} วัน)</span>
            <span className="tabular-nums text-slate-700">{fmtFull(fc.actual)} · {(actualPct * 100).toFixed(0)}%</span></p>
          <p className="flex justify-between"><span className="text-slate-500">เฉลี่ยต่อวัน</span>
            <span className="tabular-nums text-slate-700">{fmtFull(fc.perDay)}</span></p>
          <p className="flex justify-between"><span className="text-slate-500">target ต่อวัน</span>
            <span className="tabular-nums text-slate-700">{fmtFull(fc.target / fc.daysInMonth)}</span></p>
        </div>

        <div className="mt-2 rounded-lg px-2.5 py-1.5 text-xs" style={{ background: fc.allowance === null ? '#fef2f2' : '#f0fdf4' }}>
          {fc.allowance === null
            ? <span className="text-red-600 font-medium">เกิน target ทั้งเดือนแล้ว ({fmtFull(fc.actual - fc.target)} THB)</span>
            : <span className="text-emerald-700">เหลือ {daysLeft} วัน — ใช้ได้อีก<strong> วันละไม่เกิน {fmtFull(fc.allowance)}</strong> เพื่อให้อยู่ใน target</span>}
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
    projPct: target > 0 ? projected / target : 0,
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
        <tr className="text-slate-400 border-b border-slate-100">
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
          <tr key={m.key} className="border-b border-slate-50">
            <td className="py-1.5 pr-2 text-slate-700 max-w-[140px] truncate" title={m.key}>
              {onPick
                ? <button onClick={() => onPick(m.key)} className="text-blue-600 hover:underline" title="ดูปัญหาของลูกค้ารายนี้">{m.key}</button>
                : m.key}
            </td>
            <td className="py-1.5"><Spark values={m.spark} color={color}/></td>
            <td className="py-1.5 text-right tabular-nums text-slate-500" title={`${fmtFull(m.priorValue)} THB · ${m.priorCount} ครั้ง`}>
              {fmtK(m.priorValue)} <span className="text-slate-300">({m.priorCount})</span>
            </td>
            <td className="py-1.5 text-right tabular-nums text-slate-700" title={`${fmtFull(m.recentValue)} THB · ${m.recentCount} ครั้ง`}>
              {fmtK(m.recentValue)} <span className="text-slate-300">({m.recentCount})</span>
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
          className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-sm bg-slate-50 focus:outline-none focus:border-blue-400">
          {customers.map(c => (
            <option key={c.key} value={c.key}>{c.key} — {fmtK(c.recentValue)} ({c.recentCount} ครั้ง)</option>
          ))}
        </select>
        {cust && (
          <span className="text-xs text-slate-500">
            ช่วงล่าสุด <strong className="text-slate-700">{fmtFull(cust.recentValue)}</strong> THB · {cust.recentCount} ครั้ง
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
            <tr className="text-slate-400 border-b border-slate-100">
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
                <tr key={p.key} className="border-b border-slate-50">
                  <td className="py-1.5 text-slate-300">{i + 1}</td>
                  <td className="py-1.5 pr-2 text-slate-700">{p.key}</td>
                  <td className="py-1.5 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${p.recentValue / maxRecent * 100}%` }}/>
                      </div>
                      <span className="w-9 text-right tabular-nums text-slate-500">{(share * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-slate-700">{fmtK(p.recentValue)} <span className="text-slate-300">({p.recentCount})</span></td>
                  <td className="py-1.5 text-right tabular-nums text-slate-500">{fmtK(p.priorValue)} <span className="text-slate-300">({p.priorCount})</span></td>
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
// หน้า Insights
// ─────────────────────────────────────────────────────────────
export function InsightsPage() {
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

  if (error) return <div className="card p-4 text-sm text-red-600 border-red-200 bg-red-50">⚠ {error}</div>

  return (
    <div className="space-y-4">
      {/* ── คาดการณ์สิ้นเดือน ── */}
      <SectionLabel>คาดการณ์สิ้นเดือน</SectionLabel>
      <p className="text-xs text-slate-400 -mt-2">ถ้าอัตราเฉลี่ยต่อวันยังเท่าเดิมจนสิ้นเดือน ยอดจะอยู่ที่เท่าไหร่ เทียบกับ target ทั้งเดือน</p>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="card h-56 animate-pulse bg-slate-100"/>)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ForecastCard title="Replan"   fc={fcR}/>
          <ForecastCard title="Addpaper" fc={fcA}/>
          <ForecastCard title="รวม"      fc={fcC}/>
        </div>
      )}

      {/* ── ตัวเลือกช่วงเวลา ── */}
      <div className="card px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500">ข้อมูล</span>
        <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {(['Combined','Replan','Addpaper'] as Scope[]).map(s => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${scope===s ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500 ml-2">เทียบช่วง</span>
        <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {WINDOWS.map(w => (
            <button key={w} onClick={() => setWindowDays(w)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${windowDays===w ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {w} วัน
            </button>
          ))}
        </div>
        {ranges && <span className="text-[11px] text-slate-400 ml-auto">ล่าสุด {ranges.recent} เทียบ ก่อนหน้า {ranges.prior}</span>}
      </div>

      {/* ── ลูกค้า ── */}
      <SectionLabel>แนวโน้มลูกค้า</SectionLabel>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100"/> :
        <MoversSection title="ลูกค้า" rows={scopeRows} keyFn={customerOf} latest={scopeLatest} windowDays={windowDays} ranges={ranges} onPick={pickCustomer}/>}

      {/* ── เจาะลึกรายลูกค้า ── */}
      <div ref={drillRef} className="scroll-mt-20">
        <SectionLabel>เจาะลึกรายลูกค้า</SectionLabel>
      </div>
      <p className="text-xs text-slate-400 -mt-2">เลือกลูกค้า หรือคลิกชื่อลูกค้าในตารางด้านบน เพื่อดูว่ามีปัญหาอะไรบ้าง เรียงจากมูลค่าช่วงล่าสุดมากไปน้อย</p>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100"/> : activeCustomer &&
        <CustomerDrill customers={customerList} selected={activeCustomer} onSelect={setSelectedCustomer}
          rows={scopeRows} latest={scopeLatest} windowDays={windowDays} ranges={ranges}/>}

      {/* ── ปัญหา ── */}
      <SectionLabel>แนวโน้มปัญหา</SectionLabel>
      {loading ? <div className="card h-72 animate-pulse bg-slate-100"/> :
        <MoversSection title="ปัญหา" rows={scopeRows} keyFn={problemOf} latest={scopeLatest} windowDays={windowDays} ranges={ranges}/>}

      <p className="text-[11px] text-slate-400 text-center pb-2">
        นับเฉพาะแผนกผลิตในโรงงาน (PR1, PR2, CON1, CON2, GL1, PDTN) ไม่รวมงานจ้าง · แสดงเฉพาะรายการที่เกิดอย่างน้อย 3 ครั้งในช่วงใดช่วงหนึ่ง · ชื่อลูกค้าตัดจากรหัสงานก่อนวงเล็บ เช่น TGT(663) → TGT
      </p>
    </div>
  )
}
