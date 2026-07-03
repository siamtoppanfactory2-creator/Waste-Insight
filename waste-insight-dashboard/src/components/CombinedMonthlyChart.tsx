import {
  ComposedChart, Bar, Line, Area, LabelList, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import type { WasteRow } from '../types'
import type { SalesMap } from '../hooks/useSalesData'

const COLOR_SALES = '#22c55e'  // พื้นหลัง sales (context)

// สีจาง เมื่อเดือนไม่ถูกเลือก
const GRAY_REPLAN   = '#cbd5e1'
const GRAY_ADDPAPER = '#e2e8f0'

// สี segment ต่อ dataset — Replan = เฉดเข้ม (บน), Addpaper = เฉดอ่อน (ล่าง)
// ไม่เกิน target → โทนเขียว, เกิน target → โทนแดง
const GREEN_REPLAN   = '#059669'  // เขียวเข้ม
const GREEN_ADDPAPER = '#10b981'  // เขียวอ่อน
const RED_REPLAN     = '#dc2626'  // แดงเข้ม
const RED_ADDPAPER   = '#f87171'  // แดงอ่อน
const COLOR_TARGET   = '#2563eb'  // น้ำเงิน — เส้น target รวม
const COLOR_PREVYR   = '#64748b'  // เทา — จุดยอดรวมเดือนเดียวกันปีก่อน

// legend swatch (ค่ากลาง ๆ ของโทนเขียว)
const COLOR_REPLAN   = GREEN_REPLAN
const COLOR_ADDPAPER = GREEN_ADDPAPER

// เลือกสีตามสถานะเกิน target + เฉดตาม dataset
function segFill(over: boolean, isReplan: boolean): string {
  if (over) return isReplan ? RED_REPLAN : RED_ADDPAPER
  return isReplan ? GREEN_REPLAN : GREEN_ADDPAPER
}

function fmtK(v: number) {
  if (v >= 1_000_000_000) return `${(v/1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000)     return `${(v/1_000_000).toFixed(1)}M`
  if (v >= 1_000)         return `${(v/1_000).toFixed(0)}k`
  return String(v)
}
function fmtFull(v: number) { return v.toLocaleString(undefined, {maximumFractionDigits:0}) }

type LabelProps = { x?: number | string; y?: number | string; width?: number | string; height?: number | string; value?: number | string }
const num = (v: number | string | undefined) => (typeof v === 'number' ? v : Number(v ?? 0))

// ป้ายตัวเลขกลาง segment (แสดงเมื่อ segment สูง/กว้างพอ)
const SegLabel = (p: LabelProps) => {
  const x = num(p.x), y = num(p.y), width = num(p.width), height = num(p.height), value = num(p.value)
  if (!value || width < 24 || height < 12) return <g/>
  return <text x={x+width/2} y={y+height/2} textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={9} fontWeight={600}>{fmtK(value)}</text>
}

// ป้ายยอดรวมบนสุดของแท่ง
const TotalLabel = (p: LabelProps) => {
  const x = num(p.x), y = num(p.y), width = num(p.width), value = num(p.value)
  if (!value || width < 20) return <g/>
  return <text x={x+width/2} y={y-4} textAnchor="middle" fill="#334155" fontSize={9} fontWeight={700}>{fmtK(value)}</text>
}

function ChartLegend({ hasSales, hasPrevYr }: { hasSales: boolean; hasPrevYr: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_REPLAN }}/>Replan
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm inline-block" style={{ background: COLOR_ADDPAPER }}/>Addpaper
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke={COLOR_TARGET} strokeWidth="2" strokeDasharray="5 3"/></svg>
        Target (total)
      </span>
      <span className="flex items-center gap-1.5 text-slate-400">·</span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm inline-block" style={{ background: GREEN_REPLAN }}/>ไม่เกิน target
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm inline-block" style={{ background: RED_REPLAN }}/>เกิน target
      </span>
      {hasPrevYr && (
        <span className="flex items-center gap-1.5">
          <svg width="14" height="10"><circle cx="7" cy="5" r="3.5" fill={COLOR_PREVYR} stroke="#fff" strokeWidth="1"/></svg>
          ปีก่อน (เดือนเดียวกัน)
        </span>
      )}
      {hasSales && (
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-emerald-200 border border-emerald-400 inline-block"/>
          Sales (context)
        </span>
      )}
    </div>
  )
}

interface TooltipEntry { name: string; value: number }
function CustomTooltip({ active, label, payload }: { active?: boolean; label?: string; payload?: TooltipEntry[] }) {
  if (!active || !payload?.length) return null
  const rp     = payload.find(p => p.name === 'replanActual')?.value   ?? 0
  const ap     = payload.find(p => p.name === 'addpaperActual')?.value ?? 0
  const target = payload.find(p => p.name === 'target')?.value         ?? 0
  const sales  = payload.find(p => p.name === 'sales')?.value          ?? 0
  const prevYr = payload.find(p => p.name === 'prevYear')?.value       ?? 0
  const total  = rp + ap
  const wasteRate = (sales > 0 && total > 0) ? (total / sales * 100) : null
  const yoy = (prevYr > 0 && total > 0) ? (total - prevYr) / prevYr * 100 : null
  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', fontSize:11, boxShadow:'0 4px 16px rgba(0,0,0,0.1)', minWidth:180 }}>
      <p style={{ fontWeight:700, marginBottom:6, color:'#0f172a' }}>{label}</p>
      <p style={{ color: COLOR_REPLAN,   margin:'2px 0' }}>Replan: {fmtFull(rp)}</p>
      <p style={{ color: COLOR_ADDPAPER, margin:'2px 0' }}>Addpaper: {fmtFull(ap)}</p>
      <hr style={{ border:'none', borderTop:'1px solid #f1f5f9', margin:'6px 0' }}/>
      <p style={{ color:'#0f172a', margin:'2px 0', fontWeight:700 }}>Total: {fmtFull(total)}</p>
      {target > 0 && <p style={{ color: COLOR_TARGET, margin:'2px 0' }}>Target: {fmtFull(target)}</p>}
      {prevYr > 0 && (
        <>
          <hr style={{ border:'none', borderTop:'1px solid #f1f5f9', margin:'6px 0' }}/>
          <p style={{ color: COLOR_PREVYR, margin:'2px 0' }}>ปีก่อน: {fmtFull(prevYr)}</p>
          {yoy !== null && (
            <p style={{ color: yoy > 0 ? '#ef4444' : '#059669', margin:'2px 0', fontWeight:700 }}>
              {yoy > 0 ? '▲' : '▼'} {Math.abs(yoy).toFixed(1)}% vs ปีก่อน
            </p>
          )}
        </>
      )}
      {sales > 0 && (
        <>
          <hr style={{ border:'none', borderTop:'1px solid #f1f5f9', margin:'6px 0' }}/>
          <p style={{ color:'#059669', margin:'2px 0' }}>Sales: {fmtFull(sales)}</p>
          {wasteRate !== null && (
            <p style={{ color: wasteRate > 5 ? '#ef4444' : wasteRate > 3 ? '#f59e0b' : '#059669', margin:'2px 0', fontWeight:700 }}>
              Waste Rate: {wasteRate.toFixed(2)}%
            </p>
          )}
        </>
      )}
    </div>
  )
}

interface Props {
  replanRows:   WasteRow[]
  addpaperRows: WasteRow[]
  ddMonth:      number | null
  chartMonths:  number[]
  onClickMonth: (v: number, shift: boolean) => void
  salesMap?:    SalesMap
  prevYearMap?: Map<string, number>  // key `${year}-${monthNo}` → ยอดรวม Actual (ทุกปี)
}

interface Row { key: string; label: string; year: number; monthNo: number; replanActual: number; addpaperActual: number; target: number; total: number; sales: number }

export function CombinedMonthlyChart({ replanRows, addpaperRows, ddMonth, chartMonths, onClickMonth, salesMap, prevYearMap }: Props) {
  const map = new Map<string, Row>()

  const add = (rows: WasteRow[], field: 'replanActual' | 'addpaperActual') => {
    rows.forEach(r => {
      const key = `${r.CalendarYear}-${String(r.MonthNo).padStart(2,'0')}`
      if (!map.has(key)) map.set(key, { key, label:`${r.MonthName} ${r.CalendarYear}`, year: r.CalendarYear, monthNo: r.MonthNo, replanActual:0, addpaperActual:0, target:0, total:0, sales:0 })
      const e = map.get(key)!
      e[field] += r.Actual ?? 0
      e.target += r.Target ?? 0  // target รวมของทั้งสอง dataset
    })
  }
  add(replanRows,   'replanActual')
  add(addpaperRows, 'addpaperActual')

  const data = Array.from(map.values())
    .sort((a,b) => a.key.localeCompare(b.key))
    .map(v => {
      const s = salesMap?.get(v.key)
      const sales = s ? s.replan + s.addpaper : 0  // sales รวมของทั้งสอง dataset
      const pv = prevYearMap?.get(`${v.year - 1}-${v.monthNo}`)  // เดือนเดียวกันปีก่อน
      const prevYear = pv && pv > 0 ? pv : null
      return { ...v, total: v.replanActual + v.addpaperActual, sales, prevYear }
    })

  if (!data.length) return <div className="card p-4 min-h-[300px] flex items-center justify-center text-slate-400 text-sm">No data</div>

  const hasSales   = data.some(d => d.sales > 0)
  const hasPrevYr  = data.some(d => d.prevYear !== null)

  const hasMonthSel = ddMonth !== null || chartMonths.length > 0
  const isGray = (monthNo: number) => {
    if (!hasMonthSel) return false
    if (ddMonth !== null && monthNo === ddMonth) return false
    if (chartMonths.includes(monthNo)) return false
    return true
  }

  return (
    <div className="card p-4 min-h-[300px]">
      <div className="flex items-start justify-between mb-2">
        <h3 className="card-title">Monthly Waste Trend — Combined (Replan + Addpaper)</h3>
      </div>
      <ChartLegend hasSales={hasSales} hasPrevYr={hasPrevYr}/>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 20, right: 24, bottom: 44, left: 8 }} style={{ cursor: 'pointer' }}
          onClick={(d, e) => {
            const entry = data.find(x => x.label === d?.activeLabel)
            if (entry) onClickMonth(entry.monthNo, (e as unknown as React.MouseEvent).shiftKey ?? false)
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-40} textAnchor="end" interval={0} axisLine={false} tickLine={false}/>
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} axisLine={false} tickLine={false}/>

          {/* Hidden sales axis — domain=[0,1] ให้ sales flood เป็นพื้นหลัง (เหมือนหน้า Replan/Addpaper) */}
          {hasSales && <YAxis yAxisId="s" hide domain={[0, 1]}/>}

          <Tooltip content={<CustomTooltip/>} cursor={{ fill: 'rgba(148,163,184,0.08)' }}/>

          {/* Sales background area — ด้านหลังสุด */}
          {hasSales && (
            <Area yAxisId="s" dataKey="sales" name="sales" type="monotone"
              fill={COLOR_SALES} fillOpacity={0.08} stroke={COLOR_SALES} strokeOpacity={0.25}
              strokeWidth={1} dot={false} legendType="none" isAnimationActive={false}/>
          )}

          {/* ล่าง: Addpaper */}
          <Bar dataKey="addpaperActual" name="addpaperActual" stackId="w" maxBarSize={40} cursor="pointer"
            animationDuration={500} animationEasing="ease-out">
            {data.map((e,i) => {
              const over = e.target > 0 && e.total > e.target
              return <Cell key={i} fill={isGray(e.monthNo) ? GRAY_ADDPAPER : segFill(over, false)} style={{ transition: 'fill 0.2s ease' }}/>
            })}
            <LabelList dataKey="addpaperActual" content={SegLabel}/>
          </Bar>
          {/* บน: Replan (+ ป้ายยอดรวมบนสุด) */}
          <Bar dataKey="replanActual" name="replanActual" stackId="w" maxBarSize={40} cursor="pointer"
            animationDuration={500} animationEasing="ease-out">
            {data.map((e,i) => {
              const over = e.target > 0 && e.total > e.target
              return <Cell key={i} fill={isGray(e.monthNo) ? GRAY_REPLAN : segFill(over, true)} style={{ transition: 'fill 0.2s ease' }}/>
            })}
            <LabelList dataKey="replanActual" content={SegLabel}/>
            <LabelList dataKey="total" position="top" content={TotalLabel}/>
          </Bar>

          {/* เส้น Target รวม */}
          <Line dataKey="target" name="target" stroke={COLOR_TARGET} strokeWidth={2} strokeDasharray="5 3"
            dot={false} type="monotone" legendType="none" animationDuration={500}/>

          {/* จุด: ยอดรวมเดือนเดียวกันปีก่อน (เส้นบาง ๆ เชื่อม + จุด) */}
          {hasPrevYr && (
            <Line dataKey="prevYear" name="prevYear" stroke={COLOR_PREVYR} strokeWidth={1} strokeDasharray="2 3"
              type="monotone" legendType="none" connectNulls={false} animationDuration={500}
              dot={{ r: 3.5, fill: COLOR_PREVYR, stroke: '#fff', strokeWidth: 1 }}
              activeDot={{ r: 5, fill: COLOR_PREVYR, stroke: '#fff', strokeWidth: 1 }}/>
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {hasMonthSel && <p className="text-xs text-slate-400 mt-1 text-center">Shift+click เพื่อเลือกเพิ่ม · คลิกซ้ำเพื่อยกเลิก</p>}
    </div>
  )
}
