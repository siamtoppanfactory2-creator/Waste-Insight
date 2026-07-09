import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LabelList, Legend,
} from 'recharts'
import type { WasteRow } from '../types'

function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v/1_000).toFixed(0)}k`
  return String(v)
}
function fmtFull(v: number) { return v.toLocaleString(undefined, {maximumFractionDigits:0}) }

function barColor(p: number): string {
  if (p <= 0.75) return '#059669'
  if (p <= 0.90) return '#10b981'
  if (p <= 1.00) return '#f59e0b'
  if (p <= 1.10) return '#f97316'
  return '#ef4444'
}

interface Props {
  deptRows:    WasteRow[]   // dropdown-filtered only (not chartSel) — full dept list for display
  detailRows:  WasteRow[]   // DETAIL rows (same filter as deptRows) — for counting jobs > 5,000
  chartDepts:  string[]     // chart-click selection → gray others
  onClickDept: (dept: string, shift: boolean) => void
}

const BIG_JOB_THRESHOLD = 5000

interface TipRow { dept: string; actual: number; target: number; achPct: number; bigJobs: number }

function DeptTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TipRow }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ fontSize: 11, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', background: '#fff', padding: '8px 10px' }}>
      <p style={{ fontWeight: 600, color: '#334155', marginBottom: 4 }}>{d.dept}</p>
      <p style={{ color: '#059669' }}>Actual : {fmtFull(d.actual)}</p>
      <p style={{ color: '#93c5fd' }}>Target : {fmtFull(d.target)}</p>
      <p style={{ color: '#ef4444', marginTop: 2 }}>งานเกิน 5,000 : {d.bigJobs} งาน</p>
    </div>
  )
}

export function DeptChart({ deptRows, detailRows, chartDepts, onClickDept }: Props) {
  const map = new Map<string, { actual: number; target: number }>()
  deptRows.forEach(r => {
    if (!r.Dept) return
    const e = map.get(r.Dept) ?? { actual:0, target:0 }
    map.set(r.Dept, { actual: e.actual + (r.Actual??0), target: e.target + (r.Target??0) })
  })

  // count jobs ≥ threshold per dept
  const bigMap = new Map<string, number>()
  detailRows.forEach(r => {
    if (!r.Dept || (r.Value ?? 0) < BIG_JOB_THRESHOLD) return
    bigMap.set(r.Dept, (bigMap.get(r.Dept) ?? 0) + 1)
  })

  const data = Array.from(map.entries())
    .map(([dept, { actual, target }]) => ({ dept, actual, target, achPct: target>0 ? actual/target : 0, bigJobs: bigMap.get(dept) ?? 0 }))
    .sort((a,b) => b.actual - a.actual)

  if (!data.length) return (
    <div className="card p-4 min-h-[300px] flex items-center justify-center text-slate-400 text-sm">No data</div>
  )

  const hasSel = chartDepts.length > 0

  return (
    <div className="card p-4 min-h-[300px]">
      <h3 className="card-title mb-4">Waste by Department</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }}
          onClick={(d, e) => {
            if (d?.activeLabel) onClickDept(String(d.activeLabel), (e as unknown as React.MouseEvent).shiftKey ?? false)
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9"/>
          <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 9, fill: '#94a3b8' }} axisLine={false} tickLine={false}/>
          <YAxis type="category" dataKey="dept" tick={{ fontSize: 10, fill: '#475569' }} width={60} axisLine={false} tickLine={false} cursor="pointer"/>
          <Tooltip content={<DeptTooltip/>} cursor={{ fill: 'rgba(148,163,184,0.08)' }}/>
          <Legend wrapperStyle={{ fontSize: 10 }} verticalAlign="bottom"/>

          <Bar dataKey="actual" name="Actual" maxBarSize={13} cursor="pointer" fill="#059669">
            {data.map((e,i) => {
              const gray = hasSel && !chartDepts.includes(e.dept)
              return <Cell key={i} fill={gray ? '#e2e8f0' : barColor(e.achPct)} style={{ transition: 'fill 0.2s ease' }}/>
            })}
            <LabelList dataKey="achPct" position="right"
              formatter={(v: number) => `${(v*100).toFixed(1)}%`}
              style={{ fontSize: 9, fill: '#94a3b8' }}/>
          </Bar>

          <Bar dataKey="target" name="Target" maxBarSize={13} cursor="pointer" fill="#93c5fd">
            {data.map((e,i) => {
              const gray = hasSel && !chartDepts.includes(e.dept)
              return <Cell key={i} fill={gray ? '#f1f5f9' : '#2563eb'} opacity={gray ? 1 : 0.3} style={{ transition: 'fill 0.2s ease' }}/>
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {hasSel && <p className="text-xs text-slate-400 mt-1 text-center">Shift+click เพื่อเลือกเพิ่ม · คลิกซ้ำเพื่อยกเลิก</p>}
    </div>
  )
}
