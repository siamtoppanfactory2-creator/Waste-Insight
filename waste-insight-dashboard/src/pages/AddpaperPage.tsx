import { useMemo, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useWasteData }   from '../hooks/useWasteData'
import { useFilters }     from '../hooks/useFilters'
import { KpiCard }        from '../components/KpiCard'
import { FilterBar }      from '../components/FilterBar'
import { MonthlyChart }   from '../components/MonthlyChart'
import { DeptChart }      from '../components/DeptChart'
import { Top10JobsChart } from '../components/Top10JobsChart'
import { ParetoChart }    from '../components/ParetoChart'
import { DetailTable }     from '../components/DetailTable'
import { ActionList }      from '../components/ActionList'
import type { UseActionedJobsResult } from '../hooks/useActionedJobs'
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
const AP_MONTH_NUM: Record<string,string> = {Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12'}
function apToSortable(s: string): string { const [d,m,y]=s.split('-'); return `${y}-${AP_MONTH_NUM[m]??'00'}-${d?.padStart(2,'0')??'00'}` }


export function AddpaperPage({ actioned, salesMap }: { actioned: UseActionedJobsResult; salesMap: SalesMap }) {
  const monthly = useWasteData('Addpaper', 'MONTHLY')
  const dept    = useWasteData('Addpaper', 'DEPT')
  const detail  = useWasteData('Addpaper', 'DETAIL')

  const allRows = useMemo(() => [...monthly.rows, ...dept.rows, ...detail.rows],
    [monthly.rows, dept.rows, detail.rows])

  const f = useFilters(allRows)

  const chartMonthlyRows = useMemo(() =>
    f.dd.depts.length > 0 || f.chartSel.depts.length > 0
      ? f.filterForMonthly(dept.rows)
      : f.filterForMonthly(monthly.rows)
  , [f.filterForMonthly, f.dd.depts, f.chartSel.depts, dept.rows, monthly.rows])

  const chartDetailForMonth = useMemo(() => f.filterForMonthly(detail.rows), [f.filterForMonthly, detail.rows])
  const chartDeptRows  = useMemo(() => f.filterForDept(dept.rows),   [f.filterForDept, dept.rows])
  const chartJobRows     = useMemo(() => f.filterForJobs(detail.rows),     [f.filterForJobs, detail.rows])
  const chartProblemRows = useMemo(() => f.filterForProblems(detail.rows), [f.filterForProblems, detail.rows])
  const filteredDetail   = useMemo(() => f.filterRows(detail.rows),        [f.filterRows, detail.rows])

  const kpi = useMemo(() => {
    const hasDeptFilter = f.dd.depts.length > 0 || f.chartSel.depts.length > 0
    const kpiRows = hasDeptFilter ? f.filterRows(dept.rows) : f.filterRows(monthly.rows)
    const totalValue  = f.dateRangeActive
      ? filteredDetail.reduce((s,r) => s + ((r.Dept && CORE_DEPTS.has(r.Dept)) ? (r.Value ?? 0) : 0), 0)
      : kpiRows.reduce((s,r) => s + (r.Actual ?? 0), 0)
    const totalTarget = kpiRows.reduce((s,r) => s + (r.Target ?? 0), 0)
    const achPct      = totalTarget > 0 ? (totalValue / totalTarget - 1) * 100 : null
    const totalJobs   = filteredDetail.length
    const coreJobs    = filteredDetail.filter(r => r.Dept && CORE_DEPTS.has(r.Dept)).length
    const bigRows = filteredDetail.filter(r => (r.Value??0) >= 5000)
    const bigJobs = bigRows.length
    const bigVal  = bigRows.reduce((s,r) => s+(r.Value??0), 0)
    const yearFiltered = monthly.rows.filter(r => f.dd.years.length === 0 || f.dd.years.includes(r.CalendarYear))
    const sortedM = [...yearFiltered].sort((a,b) => (a.CalendarYear*100+a.MonthNo) - (b.CalendarYear*100+b.MonthNo))
    let vsPrevPct: number | null = null
    if (f.dd.month !== null) {
      const cur  = sortedM.filter(r => r.MonthNo === f.dd.month)
      const prev = sortedM.filter(r => r.CalendarYear*100+r.MonthNo < (cur[0] ? cur[0].CalendarYear*100+cur[0].MonthNo : 0))
      const curA = cur.reduce((s,r) => s+(r.Actual??0), 0); const prevA = prev.length ? prev[prev.length-1].Actual??0 : 0
      if (prevA > 0) vsPrevPct = (curA - prevA) / prevA * 100
    } else if (sortedM.length >= 2) {
      const last = sortedM[sortedM.length-1]; const prev = sortedM[sortedM.length-2]
      if (prev.Actual && last.Actual) vsPrevPct = (last.Actual - prev.Actual) / prev.Actual * 100
    }
    let totalSales = 0
    kpiRows.forEach(r => {
      const key = `${r.CalendarYear}-${String(r.MonthNo).padStart(2,'0')}`
      const s = salesMap.get(key)
      if (s) totalSales += s.addpaper
    })
    const wasteRate = totalSales > 0 ? (totalValue / totalSales * 100) : null
    return { totalValue, totalTarget, achPct, totalJobs, coreJobs, bigJobs, bigVal, vsPrevPct, totalSales, wasteRate }
  }, [f.filterRows, f.dd, f.chartSel.depts, monthly.rows, dept.rows, filteredDetail, salesMap])

  const anyLoading = monthly.loading || dept.loading
  const anyError   = monthly.error ?? dept.error ?? detail.error
  const handleRefresh = () => { monthly.refetch(); dept.refetch(); detail.refetch() }

  const isLoadingAny = monthly.loading || dept.loading || detail.loading

  const latestDataDate = useMemo(() => {
    const dates = detail.rows.map(r => r.Date).filter(Boolean) as string[]
    if (!dates.length) return null
    return dates.slice().sort((a,b) => apToSortable(a).localeCompare(apToSortable(b))).pop() ?? null
  }, [detail.rows])

  const [loadedAt, setLoadedAt] = useState<string | null>(null)
  useEffect(() => {
    if (!isLoadingAny) {
      const now = new Date()
      setLoadedAt(`${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')} น.`)
    }
  }, [isLoadingAny])

  return (
    <div className="space-y-4">
      {isLoadingAny && (
        <div className="fixed top-14 left-0 right-0 z-50 h-0.5 bg-blue-100 overflow-hidden">
          <div className="h-full bg-blue-500" style={{ width: '60%', animation: 'loadbar 1.2s ease-in-out infinite' }}/>
        </div>
      )}
      <FilterBar
        availableYears={f.availableYears} availableMonths={f.availableMonths} availableDepts={f.availableDepts}
        dd={f.dd} chartSel={f.chartSel}
        setYears={f.setYears} setMonth={f.setMonth} setDepts={f.setDepts}
        clearChartSel={f.clearChartSel} onRefresh={handleRefresh}
        dateFrom={f.dateFrom} dateTo={f.dateTo} dateRangeActive={f.dateRangeActive}
        setDateFrom={f.setDateFrom} setDateTo={f.setDateTo}
        latestDataDate={latestDataDate} loadedAt={loadedAt}
      />
      {anyError && <Err msg={anyError}/>}

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
            sub2={kpi.vsPrevPct !== null ? `${kpi.vsPrevPct >= 0 ? '▲' : '▼'} ${Math.abs(kpi.vsPrevPct).toFixed(1)}% vs prev month` : undefined}
            trend1={kpi.achPct !== null ? (kpi.achPct >= 0 ? 'up-bad' : 'down-good') : null}
            accent="blue"
            progress={kpi.totalTarget > 0 ? kpi.totalValue / kpi.totalTarget : null}
            progressBad={true}/>
          {kpi.totalSales === 0 && kpi.wasteRate !== null && (
            <KpiCard label="Waste Rate" value={`${kpi.wasteRate.toFixed(2)}%`} sub1="waste / sales revenue" accent="amber"/>
          )}
          <KpiCard label="Total Jobs" value={kpi.coreJobs.toLocaleString()}
            valueSub="Prod. only"
            sub1={`รวม ${kpi.totalJobs.toLocaleString()} รายการ (incl. OUTWORK ฯลฯ)`}
            accent="green"/>
          <KpiCard label="Jobs > 5,000 THB" value={kpi.bigJobs.toLocaleString()}
            sub1={`มูลค่ารวม: ${fmtK(kpi.bigVal)}`} accent="red"/>
        </>)}
      </div>

      <SectionLabel>Monthly Trend & Department</SectionLabel>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" style={{ minHeight: 300 }}>
        {anyLoading ? <><Sk h="h-[300px]"/><Sk h="h-[300px]"/></> : (<>
          <MonthlyChart monthlyRows={chartMonthlyRows} detailRows={chartDetailForMonth}
            ddMonth={f.dd.month} chartMonths={f.chartSel.months} onClickMonth={f.toggleChartMonth}
            salesMap={salesMap} dataset="Addpaper"/>
          <DeptChart deptRows={chartDeptRows} chartDepts={f.chartSel.depts} onClickDept={f.toggleChartDept}/>
        </>)}
      </div>

      <SectionLabel>Analysis</SectionLabel>
      <div style={{ minHeight: 200 }}>
        {detail.loading ? <Sk h="h-[280px]"/> : (
          <Top10JobsChart rows={chartJobRows} chartJobs={f.chartSel.jobs} onClickJob={f.toggleChartJob}/>
        )}
      </div>
      <div style={{ minHeight: 280 }}>
        {detail.loading ? <Sk h="h-[280px]"/> : (
          <ParetoChart rows={chartProblemRows} selectedProblems={f.chartSel.problems} onClickProblem={f.toggleChartProblem}/>
        )}
      </div>

      <SectionLabel>Detail</SectionLabel>
      <div style={{ minHeight: 200 }}>
        {detail.loading ? <Sk h="h-[300px]"/> : <DetailTable rows={filteredDetail} dataset="Addpaper" actionedJos={actioned.actionedJos}/>}
      </div>

      <div style={{ minHeight: 100 }}>
        {!detail.loading && (
          <ActionList
            rows={filteredDetail}
            actionedJos={actioned.actionedJos}
            onToggle={actioned.toggle}
            onToggleMany={actioned.toggleMany}
            loading={actioned.loading}
            onRefetch={actioned.refetch}
          />
        )}
      </div>
    </div>
  )
}
