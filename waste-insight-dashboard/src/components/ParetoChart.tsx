import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
  type TooltipProps,
} from 'recharts'
import type { WasteRow } from '../types'

function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(1)}M`
  if (v >= 1_000)     return `${(v/1_000).toFixed(0)}k`
  return String(v)
}
function fmtFull(v: number) { return v.toLocaleString(undefined, {maximumFractionDigits:0}) }

function buildPareto(rows: WasteRow[], key: 'Value' | 'Count') {
  const m = new Map<string, { value: number; count: number }>()
  rows.forEach(r => {
    const k = r.Problem || r.Cause || '(blank)'
    const e = m.get(k) ?? { value: 0, count: 0 }
    m.set(k, { value: e.value + (r.Value??0), count: e.count + 1 })
  })
  const sorted = Array.from(m.entries())
    .sort((a,b) => key==='Value' ? b[1].value - a[1].value : b[1].count - a[1].count)
    .slice(0, 10)
  const grand = sorted.reduce((s,[,v]) => s + (key==='Value' ? v.value : v.count), 0)
  let cum = 0
  return sorted.map(([name, v]) => {
    const metric = key === 'Value' ? v.value : v.count
    cum += metric
    return { name: name.length > 14 ? name.slice(0,13)+'…' : name, fullName: name, metric, cumPct: grand > 0 ? (cum/grand)*100 : 0 }
  })
}

function ParetoTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const fullName = (payload[0]?.payload as { fullName?: string })?.fullName ?? ''
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', fontSize:11, boxShadow:'0 4px 12px var(--shadow)' }}>
      {fullName && <p style={{ fontWeight:600, marginBottom:4, maxWidth:220 }}>{fullName}</p>}
      {payload.map((p,i) => (
        <p key={i} style={{ color: p.color, margin:'2px 0' }}>
          {p.name==='cumPct'
            ? `Cumulative: ${Number(p.value).toFixed(1)}%`
            : `${p.name}: ${fmtFull(Number(p.value))}`}
        </p>
      ))}
    </div>
  )
}

interface SingleProps {
  rows:        WasteRow[]
  metricKey:   'Value' | 'Count'
  title:       string
  fillColor:   string
  selected:    string[]
  onClickBar:  (name: string, shift: boolean) => void
}

function SinglePareto({ rows, metricKey, title, fillColor, selected, onClickBar }: SingleProps) {
  const data = buildPareto(rows, metricKey)
  if (!data.length) return <div className="flex-1 flex items-center justify-center text-slate-400 text-sm min-h-[200px]">No data</div>

  const hasSel = selected.length > 0

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">{title}</p>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={data} margin={{ top: 8, right: 44, bottom: 56, left: 12 }} style={{ cursor: 'pointer' }}
          onClick={(d, e) => {
            const entry = data.find(x => x.name === d?.activeLabel)
            const name  = entry?.fullName ?? d?.activeLabel ?? ''
            if (name) onClickBar(name, (e as unknown as React.MouseEvent).shiftKey ?? false)
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
          <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#94a3b8' }} angle={-40} textAnchor="end" interval={0} axisLine={false} tickLine={false}/>
          <YAxis yAxisId="l" tickFormatter={metricKey==='Value' ? fmtK : v=>String(v)} tick={{ fontSize: 9, fill: '#94a3b8' }} width={38} axisLine={false} tickLine={false}/>
          <YAxis yAxisId="r" orientation="right" domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{ fontSize: 9, fill: '#7c3aed' }} width={34} axisLine={false} tickLine={false}/>
          <Tooltip content={<ParetoTooltip/>}/>
          <ReferenceLine yAxisId="r" y={80} stroke="#f59e0b" strokeDasharray="4 3"
            label={{ value:'80%', position:'right', fontSize:9, fill:'#f59e0b' }}/>
          <Bar yAxisId="l" dataKey="metric" name={metricKey} maxBarSize={40} radius={[3,3,0,0]}>
            {data.map((entry,i) => {
              const gray = hasSel && !selected.includes(entry.fullName)
              return <Cell key={i} fill={gray ? '#e2e8f0' : fillColor} opacity={gray ? 1 : 0.85} style={{ transition: 'fill 0.2s ease' }}/>
            })}
          </Bar>
          <Line yAxisId="r" type="monotone" dataKey="cumPct" name="cumPct" stroke="#7c3aed" strokeWidth={2} dot={{ r:2.5, fill:'#7c3aed', stroke:'#fff', strokeWidth:1 }}/>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

interface Props {
  rows:               WasteRow[]
  selectedProblems:   string[]
  onClickProblem:     (name: string, shift: boolean) => void
}

export function ParetoChart({ rows, selectedProblems, onClickProblem }: Props) {
  return (
    <div className="card p-4 min-h-[280px]">
      <h3 className="card-title mb-1">Pareto — Problem <span className="text-xs font-normal text-slate-400">(Top 10)</span></h3>
      <div className="flex gap-8">
        <SinglePareto rows={rows} metricKey="Value" title="by Value (THB)" fillColor="#2563eb"
          selected={selectedProblems} onClickBar={onClickProblem}/>
        <div className="w-px bg-slate-100 dark:bg-slate-800 self-stretch"/>
        <SinglePareto rows={rows} metricKey="Count" title="by Count (jobs)" fillColor="#059669"
          selected={selectedProblems} onClickBar={onClickProblem}/>
      </div>
    </div>
  )
}
