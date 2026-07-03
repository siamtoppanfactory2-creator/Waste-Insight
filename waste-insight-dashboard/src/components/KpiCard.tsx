interface KpiCardProps {
  label:       string
  value:       string
  valueSub?:   string          // small text shown beside the main value
  sub1?:       string
  sub2?:       string
  trend1?:     'up-good' | 'up-bad' | 'down-good' | 'down-bad' | null
  trend2?:     'up-good' | 'up-bad' | 'down-good' | 'down-bad' | null
  accent?:     'blue' | 'green' | 'red' | 'purple' | 'amber'
  progress?:   number | null   // 0–1.5 (actual/target ratio)
  progressBad?: boolean        // true = over target is bad (waste context)
  breakdown?:  { label: string; value: string; color?: string }[]  // แยกบรรทัด เช่น Replan / Addpaper
}

const accentMap = {
  blue:   { bar: 'bg-blue-500',    val: 'text-blue-600'    },
  green:  { bar: 'bg-emerald-500', val: 'text-emerald-600' },
  red:    { bar: 'bg-red-500',     val: 'text-red-600'     },
  purple: { bar: 'bg-violet-500',  val: 'text-violet-600'  },
  amber:  { bar: 'bg-amber-500',   val: 'text-amber-600'   },
}

function TrendIcon({ t }: { t?: string | null }) {
  if (!t) return null
  const isUp   = t.startsWith('up')
  const isGood = t.endsWith('good')
  return <span className={`font-bold text-sm ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>{isUp ? '▲' : '▼'}</span>
}

export function KpiCard({ label, value, valueSub, sub1, sub2, trend1, trend2, accent = 'blue', progress, progressBad = true, breakdown }: KpiCardProps) {
  const a = accentMap[accent]

  // Progress bar color: in waste context, over target (>1) = bad = red
  const p = progress ?? 0
  const barPct = Math.min(p * 100, 100)
  const barColor = progressBad
    ? (p > 1 ? '#ef4444' : p > 0.9 ? '#f59e0b' : '#059669')
    : (p > 0.9 ? '#059669' : '#ef4444')

  return (
    <div className="card px-4 pt-3 pb-4 flex flex-col gap-1 relative overflow-hidden">
      {/* Left accent bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${a.bar} rounded-l-xl`}/>

      <span className="section-label pl-1">{label}</span>

      {/* Large value */}
      <div className="flex items-baseline gap-2 pl-1">
        <span className={`text-3xl font-bold tabular-nums ${a.val}`}>{value}</span>
        {valueSub && <span className="text-xs text-slate-400 font-medium">{valueSub}</span>}
      </div>

      {/* Subtitles */}
      {(sub1 || sub2) && (
        <div className="pl-1 space-y-0.5">
          {sub1 && (
            <p className="text-xs text-slate-500 flex items-center gap-1">
              <TrendIcon t={trend1}/>{sub1}
            </p>
          )}
          {sub2 && (
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <TrendIcon t={trend2}/>{sub2}
            </p>
          )}
        </div>
      )}

      {/* Breakdown แยกบรรทัด (เช่น Replan / Addpaper) */}
      {breakdown && breakdown.length > 0 && (
        <div className="pl-1 mt-1 space-y-0.5">
          {breakdown.map((b,i) => (
            <p key={i} className="text-xs flex items-center justify-between pr-2">
              <span className="text-slate-500">{b.label}</span>
              <span className="font-medium tabular-nums" style={{ color: b.color ?? '#475569' }}>{b.value}</span>
            </p>
          ))}
        </div>
      )}

      {/* Progress bar vs target */}
      {progress !== null && progress !== undefined && progress > 0 && (
        <div className="mt-2 pl-1">
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div className="h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${barPct}%`, background: barColor }}/>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">{(p * 100).toFixed(0)}% of target</p>
        </div>
      )}
    </div>
  )
}
