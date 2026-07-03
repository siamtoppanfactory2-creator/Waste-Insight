import { useMemo, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useWasteData } from '../hooks/useWasteData'
import { useFilters }   from '../hooks/useFilters'
import { KpiCard }      from '../components/KpiCard'
import { FilterBar }    from '../components/FilterBar'
import { CombinedMonthlyChart } from '../components/CombinedMonthlyChart'
import type { SalesMap } from '../hooks/useSalesData'

function Sk({ h='h-64' }: { h?: string }) { return <div className={`card ${h} animate-pulse bg-slate-100`}/> }
function Err({ msg }: { msg: string }) { return <div className="card p-4 text-sm text-red-600 border-red-200 bg-red-50">⚠ {msg}</div> }
function fmtK(v: number) {
  if (v >= 1_000_000) return `${(v/1_000_000).toFixed(2)}M`
  if (v >= 1_000)     return `${(v/1_000).toFixed(1)}k`
  return v.toLocaleString()
}
const CORE_DEPTS = new Set(['PR1','PR2','CON1','CON2','GL1','PDTN'])

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="section-label shrink-0">{children}</span>
      <div className="flex-1 h-px bg-slate-200"/>
    </div>
  )
}

export function CombinedPage({ salesMap }: { salesMap: SalesMap }) {
  // โหลดข้อมูลทุกชนิดของทั้งสอง dataset
  const rpM = useWasteData('Replan',   'MONTHLY')
  const apM = useWasteData('Addpaper', 'MONTHLY')
  const rpDp = useWasteData('Replan',   'DEPT')
  const apDp = useWasteData('Addpaper', 'DEPT')
  const rpDt = useWasteData('Replan',   'DETAIL')
  const apDt = useWasteData('Addpaper', 'DETAIL')

  // รวมแถวข้ามสอง dataset ตาม RecordType
  const monthlyAll = useMemo(() => [...rpM.rows, ...apM.rows], [rpM.rows, apM.rows])
  const deptAll    = useMemo(() => [...rpDp.rows, ...apDp.rows], [rpDp.rows, apDp.rows])
  const detailAll  = useMemo(() => [...rpDt.rows, ...apDt.rows], [rpDt.rows, apDt.rows])

  const allRows = useMemo(() => [...monthlyAll, ...deptAll, ...detailAll], [monthlyAll, deptAll, detailAll])
  const f = useFilters(allRows)

  // ── กราฟรายเดือน: กรองปี/dept แล้วส่งแยกแต่ละ dataset ──
  const chartReplan   = useMemo(() => f.filterForMonthly(rpM.rows), [f.filterForMonthly, rpM.rows])
  const chartAddpaper = useMemo(() => f.filterForMonthly(apM.rows), [f.filterForMonthly, apM.rows])

  const filteredDetail = useMemo(() => f.filterRows(detailAll), [f.filterRows, detailAll])

  // ยอดรวม Actual (Replan+Addpaper) ต่อ year-month ทุกปี — ใช้ lookup ค่าปีก่อนในกราฟ
  const prevYearMap = useMemo(() => {
    const m = new Map<string, number>()
    ;[...rpM.rows, ...apM.rows].forEach(r => {
      const key = `${r.CalendarYear}-${r.MonthNo}`
      m.set(key, (m.get(key) ?? 0) + (r.Actual ?? 0))
    })
    return m
  }, [rpM.rows, apM.rows])

  // ── KPI รวม (Replan + Addpaper) — คำนวณแยกรายชุดแล้วค่อยรวม ──
  const kpi = useMemo(() => {
    const hasDeptFilter = f.dd.depts.length > 0 || f.chartSel.depts.length > 0

    // ค่า waste/target ต่อ dataset (ใช้ DEPT rows เมื่อ filter dept, ไม่งั้นใช้ MONTHLY)
    const wasteOf = (mRows: typeof monthlyAll, dRows: typeof deptAll, detRows: typeof detailAll) => {
      if (f.dateRangeActive) {
        const det = f.filterRows(detRows)
        return det.reduce((s,r) => s + ((r.Dept && CORE_DEPTS.has(r.Dept)) ? (r.Value ?? 0) : 0), 0)
      }
      const rows = f.filterRows(hasDeptFilter ? dRows : mRows)
      return rows.reduce((s,r) => s + (r.Actual ?? 0), 0)
    }
    const targetOf = (mRows: typeof monthlyAll, dRows: typeof deptAll) =>
      f.filterRows(hasDeptFilter ? dRows : mRows).reduce((s,r) => s + (r.Target ?? 0), 0)

    const replanWaste   = wasteOf(rpM.rows, rpDp.rows, rpDt.rows)
    const addpaperWaste = wasteOf(apM.rows, apDp.rows, apDt.rows)
    const totalValue    = replanWaste + addpaperWaste
    const totalTarget   = targetOf(rpM.rows, rpDp.rows) + targetOf(apM.rows, apDp.rows)
    const achPct = totalTarget > 0 ? (totalValue / totalTarget - 1) * 100 : null

    // Jobs ต่อ dataset (core = แผนกผลิต)
    const rpDetailF = f.filterRows(rpDt.rows)
    const apDetailF = f.filterRows(apDt.rows)
    const coreCount = (rows: typeof detailAll) => rows.filter(r => r.Dept && CORE_DEPTS.has(r.Dept)).length
    const replanJobs   = coreCount(rpDetailF)
    const addpaperJobs = coreCount(apDetailF)
    const coreJobs  = replanJobs + addpaperJobs
    const totalJobs = rpDetailF.length + apDetailF.length

    const bigRows = filteredDetail.filter(r => (r.Value??0) >= 5000)
    const bigJobs = bigRows.length
    const bigVal  = bigRows.reduce((s,r) => s+(r.Value??0), 0)
    const replanBig   = rpDetailF.filter(r => (r.Value??0) >= 5000).length
    const addpaperBig = apDetailF.filter(r => (r.Value??0) >= 5000).length

    // Sales = ยอดขายรวมของโรงงาน (ค่าเดียว ไม่บวก replan+addpaper) — dedupe ตามเดือน
    let totalSales = 0
    const seen = new Set<string>()
    f.filterRows(rpM.rows).forEach(r => {
      const key = `${r.CalendarYear}-${String(r.MonthNo).padStart(2,'0')}`
      if (seen.has(key)) return
      seen.add(key)
      const s = salesMap.get(key)
      if (s) totalSales += s.replan
    })
    const wasteRate = totalSales > 0 ? (totalValue / totalSales * 100) : null

    return {
      totalValue, totalTarget, achPct, totalJobs, coreJobs, bigJobs, bigVal, totalSales, wasteRate,
      replanWaste, addpaperWaste, replanJobs, addpaperJobs, replanBig, addpaperBig,
    }
  }, [f.filterRows, f.dd.depts, f.chartSel.depts, f.dateRangeActive,
      rpM.rows, apM.rows, rpDp.rows, apDp.rows, rpDt.rows, apDt.rows, filteredDetail, salesMap])

  const anyLoading = rpM.loading || apM.loading || rpDp.loading || apDp.loading
  const anyError   = rpM.error ?? apM.error ?? rpDp.error ?? apDp.error ?? rpDt.error ?? apDt.error
  const handleRefresh = () => { rpM.refetch(); apM.refetch(); rpDp.refetch(); apDp.refetch(); rpDt.refetch(); apDt.refetch() }

  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  useEffect(() => {
    if (!anyLoading) {
      const now = new Date()
      setLoadedAt(`${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')} น.`)
    }
  }, [anyLoading])

  return (
    <div className="space-y-4">
      {anyLoading && (
        <div className="fixed top-14 left-0 right-0 z-50 h-0.5 bg-blue-100 overflow-hidden">
          <div className="h-full bg-blue-500 animate-pulse" style={{ width: '60%', animation: 'loadbar 1.2s ease-in-out infinite' }}/>
        </div>
      )}
      <FilterBar
        availableYears={f.availableYears} availableMonths={f.availableMonths} availableDepts={f.availableDepts}
        dd={f.dd} chartSel={f.chartSel}
        setYears={f.setYears} setMonth={f.setMonth} setDepts={f.setDepts}
        clearChartSel={f.clearChartSel} onRefresh={handleRefresh}
        dateFrom={f.dateFrom} dateTo={f.dateTo} dateRangeActive={f.dateRangeActive}
        setDateFrom={f.setDateFrom} setDateTo={f.setDateTo}
        latestDataDate={null} loadedAt={loadedAt}
      />
      {anyError && <Err msg={anyError}/>}

      {/* ── OVERVIEW ─────────────────────────────────────────── */}
      <SectionLabel>Overview</SectionLabel>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" style={{ minHeight: 100 }}>
        {anyLoading ? [0,1,2,3].map(i=><Sk key={i} h="h-28"/>) : (<>
          {kpi.totalSales > 0 && (
            <KpiCard label="Sales Volume (THB)" value={fmtK(kpi.totalSales)}
              sub1={kpi.wasteRate !== null ? `Waste Rate: ${kpi.wasteRate.toFixed(2)}%` : undefined}
              accent="purple"/>
          )}
          <KpiCard label="Total Waste (THB)" value={fmtK(kpi.totalValue)}
            sub1={kpi.totalTarget > 0 && kpi.achPct !== null
              ? `Target: ${fmtK(kpi.totalTarget)} · ${(-kpi.achPct) >= 0 ? '+' : ''}${(-kpi.achPct).toFixed(1)}% vs target`
              : undefined}
            trend1={kpi.achPct !== null ? (kpi.achPct >= 0 ? 'up-bad' : 'down-good') : null}
            accent="blue"
            breakdown={[
              { label: 'Replan',   value: fmtK(kpi.replanWaste),   color: '#059669' },
              { label: 'Addpaper', value: fmtK(kpi.addpaperWaste), color: '#10b981' },
            ]}
            progress={kpi.totalTarget > 0 ? kpi.totalValue / kpi.totalTarget : null}
            progressBad={true}/>
          {kpi.totalSales === 0 && kpi.wasteRate !== null && (
            <KpiCard label="Waste Rate" value={`${kpi.wasteRate.toFixed(2)}%`}
              sub1="waste / sales revenue" accent="amber"/>
          )}
          <KpiCard label="Total Jobs" value={kpi.coreJobs.toLocaleString()}
            valueSub="Prod. only"
            sub1={`รวม ${kpi.totalJobs.toLocaleString()} รายการ (incl. OUTWORK ฯลฯ)`}
            accent="green"
            breakdown={[
              { label: 'Replan',   value: kpi.replanJobs.toLocaleString(),   color: '#059669' },
              { label: 'Addpaper', value: kpi.addpaperJobs.toLocaleString(), color: '#10b981' },
            ]}/>
          <KpiCard label="Jobs > 5,000 THB" value={kpi.bigJobs.toLocaleString()}
            sub1={`มูลค่ารวม: ${fmtK(kpi.bigVal)}`} accent="red"
            breakdown={[
              { label: 'Replan',   value: kpi.replanBig.toLocaleString(),   color: '#059669' },
              { label: 'Addpaper', value: kpi.addpaperBig.toLocaleString(), color: '#10b981' },
            ]}/>
        </>)}
      </div>

      {/* ── MONTHLY TREND ────────────────────────────────────── */}
      <SectionLabel>Monthly Trend — Combined</SectionLabel>
      <div style={{ minHeight: 320 }}>
        {anyLoading ? <Sk h="h-[320px]"/> : (
          <CombinedMonthlyChart replanRows={chartReplan} addpaperRows={chartAddpaper}
            ddMonth={f.dd.month} chartMonths={f.chartSel.months} onClickMonth={f.toggleChartMonth}
            salesMap={salesMap} prevYearMap={prevYearMap}/>
        )}
      </div>
    </div>
  )
}
