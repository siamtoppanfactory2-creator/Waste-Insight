import {
  ComposedChart, Bar, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import type { WasteRow } from '../types'
import type { SalesMap } from '../hooks/useSalesData'
import type { ProductionJobsMap } from '../hooks/useProductionJobs'
import type { Dataset } from '../types'

function fmtK(v: number) {
  if (v >= 1_000_000_000) return `${(v/1_000_000_000).toFixed(1)}B`
  if (v >= 1_000_000)     return `${(v/1_000_000).toFixed(1)}M`
  if (v >= 1_000)         return `${(v/1_000).toFixed(0)}k`
  return String(v)
}
function fmtFull(v: number) { return v.toLocaleString(undefined, {maximumFractionDigits:0}) }

// ปัดเพดานแกนขึ้นเป็นเลขกลม เพื่อให้ tick เป็นจำนวนเต็มสวย ๆ
function niceMax(v: number): number {
  if (v <= 0) return 1
  const step = Math.pow(10, Math.floor(Math.log10(v))) / 2
  return Math.ceil(v / step) * step
}

function barFill(achPct: number, gray: boolean): string {
  if (gray) return '#e2e8f0'
  if (achPct <= 0.75) return '#059669'
  if (achPct <= 0.90) return '#10b981'
  if (achPct <= 1.00) return '#f59e0b'
  if (achPct <= 1.10) return '#f97316'
  return '#ef4444'
}

const BarLabel = ({ x=0, y=0, width=0, value=0, gray }: { x?: number; y?: number; width?: number; value?: number; gray?: boolean }) => {
  if (!value || width < 24) return null
  return <text x={x+width/2} y={y-4} textAnchor="middle" fill={gray ? '#cbd5e1' : '#64748b'} fontSize={9}>{fmtK(value)}</text>
}

// Custom legend
function ChartLegend({ hasSales, hasProd }: { hasSales: boolean; hasProd: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"/>Actual
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#2563eb" strokeWidth="2" strokeDasharray="5 3"/></svg>
        Target
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="2 3"/></svg>
        Prev Avg
      </span>
      <span className="flex items-center gap-1.5">
        <span className="w-3 h-3 rounded-full bg-violet-600 inline-block"/>
        <span className="text-violet-600 font-medium">Jobs</span>
        <span className="text-slate-400 text-[10px]">(→)</span>
      </span>
      {hasProd && (
        <span className="flex items-center gap-1.5">
          <svg width="22" height="8"><line x1="0" y1="4" x2="22" y2="4" stroke="#0891b2" strokeWidth="2"/></svg>
          <span className="text-cyan-700 font-medium">งานผลิตทั้งหมด</span>
          <span className="text-slate-400 text-[10px]">(→)</span>
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

// Custom tooltip
interface TooltipEntry { name: string; value: number; color?: string }
interface CustomTooltipProps {
  active?: boolean
  label?: string
  payload?: TooltipEntry[]
  salesInPayload?: boolean
}
function CustomTooltip({ active, label, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null
  const actualEntry  = payload.find(p => p.name === 'actual')
  const targetEntry  = payload.find(p => p.name === 'target')
  const prevEntry    = payload.find(p => p.name === 'prevAvg')
  const salesEntry   = payload.find(p => p.name === 'sales')
  const countEntry   = payload.find(p => p.name === 'count')
  const prodEntry    = payload.find(p => p.name === 'prodTotal')
  const actual  = actualEntry?.value ?? 0
  const sales   = salesEntry?.value  ?? 0
  const wasteRate = (sales > 0 && actual > 0) ? (actual / sales * 100) : null

  return (
    <div style={{ background:'#fff', border:'1px solid #e2e8f0', borderRadius:10, padding:'10px 14px', fontSize:11, boxShadow:'0 4px 16px rgba(0,0,0,0.1)', minWidth:180 }}>
      <p style={{ fontWeight:700, marginBottom:6, color:'#0f172a' }}>{label}</p>
      {actualEntry  && <p style={{ color:'#ef4444', margin:'2px 0' }}>Actual: <strong>{fmtFull(actual)}</strong></p>}
      {targetEntry  && <p style={{ color:'#2563eb', margin:'2px 0' }}>Target: {fmtFull(targetEntry.value)}</p>}
      {prevEntry    && <p style={{ color:'#a78bfa', margin:'2px 0' }}>Prev Avg: {fmtFull(prevEntry.value)}</p>}
      {countEntry   && <p style={{ color:'#7c3aed', margin:'2px 0' }}>Jobs: {fmtFull(countEntry.value)}</p>}
      {prodEntry && prodEntry.value > 0 && (
        <p style={{ color:'#0891b2', margin:'2px 0' }}>
          งานผลิตทั้งหมด: {fmtFull(prodEntry.value)}
          {countEntry && countEntry.value > 0 &&
            <span style={{ color:'#64748b' }}> · {(countEntry.value / prodEntry.value * 100).toFixed(1)}%</span>}
        </p>
      )}
      {salesEntry && sales > 0 && (
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
  monthlyRows:  WasteRow[]
  detailRows:   WasteRow[]
  ddMonth:      number | null
  chartMonths:  number[]
  onClickMonth: (v: number, shift: boolean) => void
  salesMap?:    SalesMap
  dataset?:     Dataset
  prodJobsMap?: ProductionJobsMap   // จำนวน job ผลิตต่อเดือน (Config_ProductionJobs)
}

export function MonthlyChart({ monthlyRows, detailRows, ddMonth, chartMonths, onClickMonth, salesMap, dataset, prodJobsMap }: Props) {
  const map = new Map<string, { label: string; monthNo: number; actual: number; target: number; prevAvg: number; achPct: number; count: number; sales: number }>()

  monthlyRows.forEach(r => {
    const key = `${r.CalendarYear}-${String(r.MonthNo).padStart(2,'0')}`
    if (!map.has(key)) map.set(key, { label:`${r.MonthName} ${r.CalendarYear}`, monthNo: r.MonthNo, actual:0, target:0, prevAvg:0, achPct:0, count:0, sales:0 })
    const e = map.get(key)!
    e.actual  += r.Actual  ?? 0
    e.target  += r.Target  ?? 0
    e.prevAvg += r.PrevAvg ?? 0
  })

  const cntMap = new Map<string, number>()
  detailRows.forEach(r => {
    const key = `${r.CalendarYear}-${String(r.MonthNo).padStart(2,'0')}`
    cntMap.set(key, (cntMap.get(key) ?? 0) + 1)
  })

  const data = Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([key, v]) => {
    v.achPct = v.target > 0 ? v.actual / v.target : 0
    v.count  = cntMap.get(key) ?? 0
    // Inject sales data
    if (salesMap && dataset) {
      const s = salesMap.get(key)
      v.sales = dataset === 'Replan' ? (s?.replan ?? 0) : (s?.addpaper ?? 0)
    }
    // เดือนที่ยังไม่กรอก job ผลิต = null → เส้นเว้นช่อง ไม่ลากลงศูนย์
    const prodTotal = prodJobsMap?.get(key)?.total ?? null
    return { ...v, key, prodTotal }
  })

  if (!data.length) return <div className="card p-4 min-h-[300px] flex items-center justify-center text-slate-400 text-sm">No data</div>

  const hasMonthSel = ddMonth !== null || chartMonths.length > 0
  const isGray = (monthNo: number) => {
    if (!hasMonthSel) return false
    if (ddMonth !== null && monthNo === ddMonth) return false
    if (chartMonths.includes(monthNo)) return false
    return true
  }

  const maxCount = Math.max(...data.map(d => d.count), 1)
  const hasSales = data.some(d => d.sales > 0)
  const maxProd  = Math.max(...data.map(d => d.prodTotal ?? 0), 0)
  const hasProd  = maxProd > 0
  // แกนขวาต้องครอบทั้งเส้น Jobs และเส้นงานผลิต (อยู่แกนเดียวกันเพื่อเทียบสัดส่วนได้)
  // ปัดขึ้นเป็นเลขกลม ๆ ไม่ให้ tick ออกมาเป็นทศนิยม
  const rightMax = niceMax(Math.max(maxCount * 4, maxProd * 1.15))

  return (
    <div className="card p-4 min-h-[300px]">
      <div className="flex items-start justify-between mb-2">
        <h3 className="card-title">Monthly Waste Trend</h3>
      </div>
      <ChartLegend hasSales={hasSales} hasProd={hasProd}/>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 18, right: 48, bottom: 44, left: 8 }} style={{ cursor: 'pointer' }}
          onClick={(d, e) => {
            const entry = data.find(x => x.label === d?.activeLabel)
            if (entry) onClickMonth(entry.monthNo, (e as unknown as React.MouseEvent).shiftKey ?? false)
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-40} textAnchor="end" interval={0} axisLine={false} tickLine={false}/>

          {/* Left: waste value */}
          <YAxis yAxisId="v" tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} width={40} axisLine={false} tickLine={false}/>

          {/* Right: job count */}
          <YAxis yAxisId="c" orientation="right" domain={[0, rightMax]} tickFormatter={v=>String(v)}
            tick={{ fontSize: 9, fill: '#7c3aed' }} width={32} axisLine={false} tickLine={false}/>

          {/* Hidden sales axis — domain=[0,1] ทำให้ sales ล้น chart height = flood effect */}
          {hasSales && <YAxis yAxisId="s" hide domain={[0, 1]}/>}

          <Tooltip content={<CustomTooltip/>}/>

          {/* Sales background area — ด้านหลังสุด */}
          {hasSales && (
            <Area yAxisId="s" dataKey="sales" name="sales" type="monotone"
              fill="#22c55e" fillOpacity={0.08} stroke="#22c55e" strokeOpacity={0.25}
              strokeWidth={1} dot={false} legendType="none" isAnimationActive={false}/>
          )}

          {/* Waste bars */}
          <Bar yAxisId="v" dataKey="actual" name="actual" maxBarSize={36} cursor="pointer"
            label={(props: { x?: number; y?: number; width?: number; value?: number; index?: number }) =>
              <BarLabel {...props} gray={isGray(data[props.index ?? 0]?.monthNo)}/>
            }
          >
            {data.map((entry,i) => (
              <Cell key={i} fill={barFill(entry.achPct, isGray(entry.monthNo))} style={{ transition: 'fill 0.2s ease' }}/>
            ))}
          </Bar>

          <Line yAxisId="v" dataKey="target"  name="target"  stroke="#2563eb" strokeWidth={2} strokeDasharray="5 3" dot={false} type="monotone" legendType="none"/>
          <Line yAxisId="v" dataKey="prevAvg" name="prevAvg" stroke="#a78bfa" strokeWidth={1.5} strokeDasharray="2 3" dot={false} type="monotone" legendType="none"/>

          {/* Job count area */}
          <Area yAxisId="c" dataKey="count" name="count" type="monotone"
            fill="#7c3aed" stroke="#7c3aed" fillOpacity={0.12} strokeWidth={1.5}
            legendType="none" isAnimationActive={false}
            dot={(props: { cx?: number; cy?: number; value?: number | number[] }) => {
              const { cx=0, cy=0, value } = props
              const count = Array.isArray(value) ? Number(value[1]) : Number(value ?? 0)
              if (!count || count <= 0) return <g key={`dot-${cx}`}/>
              return (
                <g key={`dot-${cx}`}>
                  <circle cx={cx} cy={cy} r={3} fill="#7c3aed" stroke="#fff" strokeWidth={1.5}/>
                  <text x={cx} y={cy-9} textAnchor="middle" fill="#ffffff" fontSize={8} fontWeight="600"
                    style={{ textShadow: '0 0 3px #7c3aed' }}>{count}</text>
                </g>
              )
            }}
            activeDot={{ r: 5, fill: '#7c3aed' }}
          />

          {/* เส้นจำนวนงานผลิตทั้งหมด — แกนเดียวกับ Jobs เพื่อเทียบสัดส่วน */}
          {hasProd && (
            <Line yAxisId="c" dataKey="prodTotal" name="prodTotal" type="monotone"
              stroke="#0891b2" strokeWidth={2} connectNulls={false}
              legendType="none" isAnimationActive={false}
              dot={(props: { cx?: number; cy?: number; value?: number | number[] }) => {
                const { cx=0, cy=0, value } = props
                const v = Array.isArray(value) ? Number(value[1]) : Number(value ?? 0)
                if (!v || v <= 0) return <g key={`pd-${cx}`}/>
                return (
                  <g key={`pd-${cx}`}>
                    <circle cx={cx} cy={cy} r={3.5} fill="#0891b2" stroke="#fff" strokeWidth={1.5}/>
                    <text x={cx} y={cy-9} textAnchor="middle" fill="#0891b2" fontSize={9} fontWeight="600">{fmtFull(v)}</text>
                  </g>
                )
              }}
              activeDot={{ r: 5, fill: '#0891b2' }}/>
          )}
        </ComposedChart>
      </ResponsiveContainer>
      {hasMonthSel && <p className="text-xs text-slate-400 mt-1 text-center">Shift+click เพื่อเลือกเพิ่ม · คลิกซ้ำเพื่อยกเลิก</p>}
    </div>
  )
}
