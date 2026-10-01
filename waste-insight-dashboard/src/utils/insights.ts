// การวิเคราะห์สำหรับแท็บ Insights — ฟังก์ชันล้วน ไม่แตะ React
import type { WasteRow } from '../types'
import { parseDataDate } from './targetPace'
import { normalizeProblem } from './problemMap'

const DAY_MS = 24 * 60 * 60 * 1000

// แผนกผลิตในโรงงาน — งานจ้าง (OUTWORK, HIREOUT…) และแผนกอื่นไม่นับในการวิเคราะห์
export const IN_HOUSE_DEPTS = new Set(['PR1','PR2','CON1','CON2','GL1','PDTN'])
export const isInHouse = (r: WasteRow) => !!r.Dept && IN_HOUSE_DEPTS.has(r.Dept)

// สเกลสีเดียวกับกราฟ (MonthlyChart / CombinedMonthlyChart / DeptChart)
export function achColor(p: number): string {
  if (p <= 0.75) return '#059669'
  if (p <= 0.90) return '#10b981'
  if (p <= 1.00) return '#f59e0b'
  return '#ef4444'
}

/** "dd-mmm-yyyy" → Date (เที่ยงคืน local) */
export function toDate(s: string | null | undefined): Date | null {
  const d = parseDataDate(s)
  return d ? new Date(d.year, d.monthNo - 1, d.day) : null
}

/** ชื่อลูกค้า = ส่วนหน้าวงเล็บของ Component (Replan) หรือ Code (Addpaper) — "TGT(663)" → "TGT" */
export function customerOf(r: WasteRow): string {
  return ((r.Component || r.Code || '').split('(')[0].trim().toUpperCase()) || '(ไม่ระบุ)'
}

/** ชื่อปัญหาหลังจับคู่แล้ว — COLOR/สี, SCUM/สกัม, "COLOR-SCUM"/"สี สกัม" ฯลฯ เป็นชื่อเดียวกัน (ดู problemMap.ts) */
export function problemOf(r: WasteRow): string {
  return normalizeProblem(r.Problem || r.Cause)
}

// ─────────────────────────────────────────────────────────────
// 1. คาดการณ์ยอดสิ้นเดือน
// ─────────────────────────────────────────────────────────────

export interface MonthForecast {
  label:       string   // "Sep 2026"
  latestDate:  string   // วันที่ข้อมูลล่าสุด
  day:         number   // วันที่ผ่านไป
  daysInMonth: number
  actual:      number   // ยอดถึงวันล่าสุด
  target:      number   // target ทั้งเดือน
  perDay:      number   // อัตราเฉลี่ยต่อวันที่ผ่านมา
  projected:   number   // คาดการณ์สิ้นเดือน ถ้าอัตรายังเท่าเดิม
  projPct:     number   // projected ÷ target
  allowance:   number | null // ใช้ได้อีกวันละเท่าไหร่ในวันที่เหลือ (null = เกิน target แล้ว)
}

const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function forecastMonthEnd(monthlyRows: WasteRow[], latestDate: string | null): MonthForecast | null {
  const d = parseDataDate(latestDate)
  if (!d || !latestDate) return null
  const rows   = monthlyRows.filter(r => r.CalendarYear === d.year && r.MonthNo === d.monthNo)
  const actual = rows.reduce((s, r) => s + (r.Actual ?? 0), 0)
  const target = rows.reduce((s, r) => s + (r.Target ?? 0), 0)
  const daysInMonth = new Date(d.year, d.monthNo, 0).getDate()
  const day       = Math.min(d.day, daysInMonth)
  const perDay    = day > 0 ? actual / day : 0
  const projected = perDay * daysInMonth
  const daysLeft  = daysInMonth - day
  const allowance = target > actual && daysLeft > 0 ? (target - actual) / daysLeft : null
  return {
    label: `${MONTH_ABBR[d.monthNo - 1]} ${d.year}`, latestDate, day, daysInMonth,
    actual, target, perDay, projected, projPct: target > 0 ? projected / target : 0, allowance,
  }
}

// ─────────────────────────────────────────────────────────────
// 2–3. ลูกค้า / ปัญหา ที่แนวโน้มเพิ่มขึ้นหรือลดลง
// ─────────────────────────────────────────────────────────────

export interface Mover {
  key:         string
  recentValue: number
  priorValue:  number
  recentCount: number
  priorCount:  number
  delta:       number        // recentValue − priorValue (THB)
  pct:         number | null // null = ช่วงก่อนหน้าไม่มีเลย (รายการใหม่)
  spark:       number[]      // มูลค่ารายเดือน 6 เดือนล่าสุด (เก่า → ใหม่)
}

/**
 * เทียบ `windowDays` วันล่าสุด กับ `windowDays` วันก่อนหน้านั้น (นับถึงวันที่ข้อมูลล่าสุด)
 * ตัดรายการที่มีไม่ถึง `minCount` ครั้งในทั้งสองช่วง — กันไม่ให้ 1→3 ครั้งติดอันดับเพราะ +200%
 */
export function computeMovers(
  rows: WasteRow[], keyFn: (r: WasteRow) => string,
  latestDate: string | null, windowDays: number, minCount = 3,
): { rising: Mover[]; falling: Mover[] } {
  const list = aggregateWindows(rows, keyFn, latestDate, windowDays)
    .filter(m => Math.max(m.recentCount, m.priorCount) >= minCount)
  return {
    rising:  list.filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta),
    falling: list.filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta),
  }
}

/**
 * ยอดของทุกรายการ (ไม่ตัดขั้นต่ำ) ในสองช่วง เรียงตามมูลค่าช่วงล่าสุดมากไปน้อย
 * — ใช้เจาะดูว่าลูกค้ารายหนึ่งมีปัญหาอะไรบ้าง และใช้ทำรายชื่อลูกค้าให้เลือก
 */
export function rankByRecent(
  rows: WasteRow[], keyFn: (r: WasteRow) => string, latestDate: string | null, windowDays: number,
): Mover[] {
  return aggregateWindows(rows, keyFn, latestDate, windowDays)
    .filter(m => m.recentCount + m.priorCount > 0)
    .sort((a, b) => (b.recentValue - a.recentValue) || (b.priorValue - a.priorValue))
}

// ─────────────────────────────────────────────────────────────
// 1.2 คาดการณ์หลายเดือนข้างหน้า
// ─────────────────────────────────────────────────────────────

export interface TrendPoint {
  key:      string
  label:    string
  kind:     'history' | 'current' | 'future'
  actual:   number | null   // ยอดจริง (เดือนปัจจุบัน = ถึงวันล่าสุด)
  forecast: number | null
  band:     [number, number] | null   // ช่วงความมั่นใจ 80%
  target:   number | null
}

export interface TrendForecast {
  points:   TrendPoint[]
  slope:    number    // บาทต่อเดือน จาก 12 เดือนที่จบแล้ว
  fitMonths: number
}

/**
 * คาดการณ์แบบแนวโน้มอ่อนตัว (damped linear trend)
 * - ลากเส้นแนวโน้มด้วย least squares จาก `history` เดือนล่าสุดที่จบแล้ว
 * - ก้าวที่ h ใช้ความชันคูณ φ + φ² + … + φʰ แนวโน้มจึงแบนลงเรื่อย ๆ แทนที่จะพุ่งหรือดิ่งเป็นเส้นตรง
 * - ช่วง 80% = 1.28 × σ ของส่วนเหลือ × ตัวขยายของช่วงพยากรณ์ OLS
 * ข้อมูลยังไม่ถึง 24 เดือน จึงไม่ได้ใส่ผลของฤดูกาล
 */
export function forecastTrend(
  monthly: WasteRow[], latestDate: string | null, history = 12, horizon = 6, phi = 0.8,
  currentProjection: number | null = null,   // ยอดคาดการณ์สิ้นเดือนปัจจุบันจากอัตราต่อวันจริง (ถ้ามี ใช้แทนเส้นแนวโน้ม)
): TrendForecast | null {
  const d = parseDataDate(latestDate)
  if (!d) return null
  const act = new Map<string, number>(), tgt = new Map<string, number>()
  monthly.forEach(r => {
    const k = ymKey(r.CalendarYear, r.MonthNo)
    act.set(k, (act.get(k) ?? 0) + (r.Actual ?? 0))
    tgt.set(k, (tgt.get(k) ?? 0) + (r.Target ?? 0))
  })
  const monthAt = (offset: number) => {   // offset จากเดือนล่าสุด (0 = เดือนของข้อมูลล่าสุด)
    const dt = new Date(d.year, d.monthNo - 1 + offset, 1)
    return { key: ymKey(dt.getFullYear(), dt.getMonth() + 1), label: `${MONTH_ABBR[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}` }
  }
  const partial = d.day < new Date(d.year, d.monthNo, 0).getDate()
  const lastDone = partial ? -1 : 0   // offset ของเดือนล่าสุดที่จบแล้ว

  // ข้อมูลสำหรับลากเส้น: history เดือนที่จบแล้ว และมียอด
  const fit: { x: number; y: number }[] = []
  for (let i = history - 1; i >= 0; i--) {
    const m = monthAt(lastDone - i)
    const y = act.get(m.key)
    if (y !== undefined && y > 0) fit.push({ x: history - 1 - i, y })
  }
  const n = fit.length
  if (n < 6) return null
  const xBar = fit.reduce((s, p) => s + p.x, 0) / n, yBar = fit.reduce((s, p) => s + p.y, 0) / n
  const sxx = fit.reduce((s, p) => s + (p.x - xBar) ** 2, 0)
  const slope = fit.reduce((s, p) => s + (p.x - xBar) * (p.y - yBar), 0) / sxx
  const intercept = yBar - slope * xBar
  const sse = fit.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0)
  const sigma = Math.sqrt(sse / (n - 2))
  const xLast = history - 1
  const level = intercept + slope * xLast

  const points: TrendPoint[] = []
  for (let i = history - 1; i >= 0; i--) {
    const m = monthAt(lastDone - i)
    const y = act.get(m.key) ?? null
    // เดือนสุดท้ายที่จบแล้วใส่ forecast = ยอดจริง เพื่อให้เส้นคาดการณ์ต่อจากแท่งจริง
    points.push({ ...m, kind: 'history', actual: y, forecast: i === 0 ? y : null, band: null, target: tgt.get(m.key) || null })
  }
  let damp = 0
  const steps = partial ? horizon + 1 : horizon   // รวมเดือนปัจจุบันที่ยังไม่จบ
  for (let h = 1; h <= steps; h++) {
    damp += phi ** h
    const m = monthAt(lastDone + h)
    const f = Math.max(0, level + slope * damp)
    const x0 = xLast + h
    const half = 1.28 * sigma * Math.sqrt(1 + 1 / n + (x0 - xBar) ** 2 / sxx)
    const isCurrent = partial && h === 1
    const useRunRate = isCurrent && currentProjection !== null
    points.push({
      ...m, kind: isCurrent ? 'current' : 'future',
      actual: isCurrent ? (act.get(m.key) ?? null) : null,
      forecast: useRunRate ? currentProjection : f,
      band: useRunRate ? null : [Math.max(0, f - half), f + half],
      target: tgt.get(m.key) || null,
    })
  }
  return { points, slope, fitMonths: n }
}

// ─────────────────────────────────────────────────────────────
// 6. อัตราเทียบปริมาณงาน — แยกว่าคุณภาพแย่ลงจริง หรือแค่ผลิตมากขึ้น
// ─────────────────────────────────────────────────────────────

export interface RatePoint {
  key:      string        // "2026-08"
  label:    string        // "Aug 26"
  partial:  boolean       // เดือนของข้อมูลล่าสุดที่ยังไม่จบ
  waste:    number        // มูลค่า waste (ในโรงงาน)
  sales:    number | null // ยอดขาย (null = ยังไม่กรอก)
  rate:     number | null // waste ÷ sales
  probJobs: number        // จำนวนงานที่มีปัญหา (แถว DETAIL ในโรงงาน)
  prodJobs: number | null // งานผลิตทั้งหมด (null = ยังไม่กรอก)
  share:    number | null // probJobs ÷ prodJobs
}

const ymKey = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`

/** ชุดข้อมูลรายเดือน `months` เดือนล่าสุด นับถึงเดือนของวันที่ข้อมูลล่าสุด */
export function buildRateSeries(opts: {
  monthly: WasteRow[]; detail: WasteRow[]; latestDate: string | null; months: number
  salesFor: (key: string) => number | null
  prodFor:  (key: string) => number | null
}): RatePoint[] {
  const d = parseDataDate(opts.latestDate)
  if (!d) return []
  const waste = new Map<string, number>()
  opts.monthly.forEach(r => { const k = ymKey(r.CalendarYear, r.MonthNo); waste.set(k, (waste.get(k) ?? 0) + (r.Actual ?? 0)) })
  const jobs = new Map<string, number>()
  opts.detail.forEach(r => { const k = ymKey(r.CalendarYear, r.MonthNo); jobs.set(k, (jobs.get(k) ?? 0) + 1) })
  const daysInLatest = new Date(d.year, d.monthNo, 0).getDate()

  const out: RatePoint[] = []
  for (let i = opts.months - 1; i >= 0; i--) {
    const dt = new Date(d.year, d.monthNo - 1 - i, 1)
    const key = ymKey(dt.getFullYear(), dt.getMonth() + 1)
    const w = waste.get(key) ?? 0
    const s = opts.salesFor(key)
    const pj = jobs.get(key) ?? 0
    const pr = opts.prodFor(key)
    out.push({
      key, label: `${MONTH_ABBR[dt.getMonth()]} ${String(dt.getFullYear()).slice(2)}`,
      partial: i === 0 && d.day < daysInLatest,
      waste: w, sales: s, rate: s && s > 0 ? w / s : null,
      probJobs: pj, prodJobs: pr, share: pr && pr > 0 ? pj / pr : null,
    })
  }
  return out
}

export interface SpanCompare {
  recentLabel: string; priorLabel: string
  numRecent: number; numPrior: number     // ตัวเศษ (waste / งานที่มีปัญหา)
  denRecent: number; denPrior: number     // ตัวหาร (ยอดขาย / งานผลิต)
  rateRecent: number; ratePrior: number
}

/**
 * เทียบ `span` เดือนล่าสุดที่จบแล้ว กับ `span` เดือนก่อนหน้า (ข้ามเดือนที่ยังไม่จบ)
 * ใช้เฉพาะเดือนที่มีตัวหารครบ — ถ้าเดือนไม่พอคืน null
 */
export function compareSpans(
  series: RatePoint[], num: (p: RatePoint) => number, den: (p: RatePoint) => number | null, span: number,
): SpanCompare | null {
  const done = series.filter(p => !p.partial && (den(p) ?? 0) > 0)
  if (done.length < span * 2) return null
  const recent = done.slice(-span), prior = done.slice(-span * 2, -span)
  const sum = (a: RatePoint[], f: (p: RatePoint) => number | null) => a.reduce((s, p) => s + (f(p) ?? 0), 0)
  const nr = sum(recent, num), np = sum(prior, num), dr = sum(recent, den), dp = sum(prior, den)
  const lab = (a: RatePoint[]) => a.length === 1 ? a[0].label : `${a[0].label}–${a[a.length - 1].label}`
  return { recentLabel: lab(recent), priorLabel: lab(prior), numRecent: nr, numPrior: np, denRecent: dr, denPrior: dp, rateRecent: nr / dr, ratePrior: np / dp }
}

// ─────────────────────────────────────────────────────────────
// 4. เครื่องจักร × ปัญหา
// ─────────────────────────────────────────────────────────────

export interface MachineMatrix {
  machines: { key: string; total: number }[]
  problems: { key: string; total: number }[]
  cells:    Map<string, { value: number; count: number; lift: number }>  // key = `${machine}||${problem}`
  grandTotal: number
  withMachine: number  // แถวที่มีชื่อเครื่อง
  totalRows:   number  // แถวทั้งหมดในช่วง
}

export const OTHER_PROBLEMS = 'อื่น ๆ'

/**
 * มูลค่า waste ของเครื่อง × ปัญหา ในช่วง `windowDays` วันล่าสุด
 * lift = (สัดส่วนของเครื่องนี้ในปัญหานี้) ÷ (สัดส่วนของเครื่องนี้ในทุกปัญหา)
 * lift สูง = เครื่องนี้เกิดปัญหานี้บ่อยผิดปกติเมื่อเทียบกับงานทั้งหมดของมัน
 */
export function machineProblemMatrix(
  rows: WasteRow[], latestDate: string | null, windowDays: number, topMachines = 10, topProblems = 8,
): MachineMatrix | null {
  const end = toDate(latestDate)
  if (!end) return null
  const endMs = end.getTime()
  const inWindow = rows.filter(r => {
    const dt = toDate(r.Date)
    if (!dt) return false
    const age = Math.round((endMs - dt.getTime()) / DAY_MS)
    return age >= 0 && age < windowDays
  })
  const valid = inWindow.filter(r => (r.Machine ?? '').trim() && r.Machine!.toUpperCase() !== 'OTHER')

  const byM = new Map<string, number>(), byP = new Map<string, number>()
  valid.forEach(r => {
    const v = r.Value ?? 0
    byM.set(r.Machine!, (byM.get(r.Machine!) ?? 0) + v)
    const p = problemOf(r)
    byP.set(p, (byP.get(p) ?? 0) + v)
  })
  const grandTotal = [...byM.values()].reduce((s, v) => s + v, 0)
  const machines = [...byM.entries()].sort((a, b) => b[1] - a[1]).slice(0, topMachines).map(([key, total]) => ({ key, total }))
  const topP = [...byP.entries()].sort((a, b) => b[1] - a[1]).slice(0, topProblems)
  const topSet = new Set(topP.map(e => e[0]))
  const otherTotal = [...byP.entries()].filter(e => !topSet.has(e[0])).reduce((s, e) => s + e[1], 0)
  const problems = [...topP.map(([key, total]) => ({ key, total })), ...(otherTotal > 0 ? [{ key: OTHER_PROBLEMS, total: otherTotal }] : [])]

  const cells = new Map<string, { value: number; count: number; lift: number }>()
  valid.forEach(r => {
    const p = topSet.has(problemOf(r)) ? problemOf(r) : OTHER_PROBLEMS
    const k = `${r.Machine}||${p}`
    const c = cells.get(k) ?? { value: 0, count: 0, lift: 0 }
    c.value += r.Value ?? 0; c.count++
    cells.set(k, c)
  })
  const pTotal = new Map(problems.map(p => [p.key, p.total]))
  cells.forEach((c, k) => {
    const [m, p] = k.split('||')
    const mShare = (byM.get(m) ?? 0) / (grandTotal || 1)
    const inP = c.value / (pTotal.get(p) || 1)
    c.lift = mShare > 0 ? inP / mShare : 0
  })
  return { machines, problems, cells, grandTotal, withMachine: valid.length, totalRows: inWindow.length }
}

// ─────────────────────────────────────────────────────────────
// 5. งานที่เกิดซ้ำ — รหัสชิ้นงานเดิมมีปัญหาหลายครั้ง
// ─────────────────────────────────────────────────────────────

export interface RepeatItem {
  code:        string                                 // รหัสชิ้นงานเต็ม เช่น "AJI(ZC073R02)"
  customer:    string
  count:       number                                 // จำนวนครั้งในช่วง
  jobs:        number                                 // จำนวน JO ที่ต่างกัน
  value:       number
  lastDate:    string
  problems:    { key: string; count: number }[]        // ปัญหาในช่วง เรียงมากไปน้อย
  sameProblem: string | null                          // ปัญหาที่ซ้ำเดิม ≥ 2 ครั้ง (มากสุด)
  allTime:     number                                 // เกิดทั้งหมดตั้งแต่มีข้อมูล
}

const codeOf = (r: WasteRow) => (r.Component || r.Code || '').trim().toUpperCase()

/**
 * รหัสชิ้นงานที่มีปัญหาซ้ำในช่วง `windowDays` วันล่าสุด
 * เกณฑ์: เกิด ≥ 3 ครั้ง หรือ ≥ 2 ครั้งด้วยปัญหาเดิม — ปัญหาเดิมซ้ำแปลว่ายังไม่ได้แก้ที่ต้นเหตุ
 */
export function repeatJobs(rows: WasteRow[], latestDate: string | null, windowDays: number): RepeatItem[] {
  const end = toDate(latestDate)
  if (!end) return []
  const endMs = end.getTime()
  const all = new Map<string, number>()
  const recent = new Map<string, WasteRow[]>()
  rows.forEach(r => {
    const c = codeOf(r)
    if (!c) return
    all.set(c, (all.get(c) ?? 0) + 1)
    const dt = toDate(r.Date)
    if (!dt) return
    const age = Math.round((endMs - dt.getTime()) / DAY_MS)
    if (age < 0 || age >= windowDays) return
    const a = recent.get(c) ?? []; a.push(r); recent.set(c, a)
  })

  const out: RepeatItem[] = []
  recent.forEach((rs, code) => {
    const probs = new Map<string, number>()
    rs.forEach(r => { const p = problemOf(r); probs.set(p, (probs.get(p) ?? 0) + 1) })
    const problems = [...probs.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count)
    const sameProblem = problems[0] && problems[0].count >= 2 && problems[0].key !== '(ไม่ระบุ)' ? problems[0].key : null
    if (rs.length < 3 && !sameProblem) return
    let last = rs[0].Date ?? '', lastMs = 0
    rs.forEach(r => { const t = toDate(r.Date)?.getTime() ?? 0; if (t > lastMs) { lastMs = t; last = r.Date ?? '' } })
    out.push({
      code, customer: customerOf(rs[0]), count: rs.length, jobs: new Set(rs.map(r => r.JO)).size,
      value: rs.reduce((s, r) => s + (r.Value ?? 0), 0), lastDate: last, problems, sameProblem,
      allTime: all.get(code) ?? rs.length,
    })
  })
  return out.sort((a, b) => (Number(!!b.sameProblem) - Number(!!a.sameProblem)) || (b.count - a.count) || (b.value - a.value))
}

// ─────────────────────────────────────────────────────────────
// 7. แจ้งเตือนความผิดปกติ — 7 วันล่าสุด เทียบกับ 8 สัปดาห์ก่อนหน้า
// ─────────────────────────────────────────────────────────────

export interface Anomaly {
  kind:      'ปัญหา' | 'ลูกค้า' | 'เครื่อง'
  key:       string
  value:     number       // มูลค่า 7 วันล่าสุด
  count:     number
  baseline:  number       // ค่าเฉลี่ยต่อสัปดาห์ ของ 8 สัปดาห์ก่อนหน้า
  ratio:     number | null  // value ÷ baseline (null = ไม่เคยเกิดมาก่อน)
}

const WEEKS_BASE = 8

/**
 * รายการที่ 7 วันล่าสุดพุ่งผิดปกติ:
 * มูลค่า ≥ 2 เท่าของค่าเฉลี่ยรายสัปดาห์ และ ≥ ค่าเฉลี่ย + 2σ, อย่างน้อย 3 ครั้ง และ ≥ 5,000 บาท
 * หรือไม่เคยเกิดใน 8 สัปดาห์ก่อนหน้าเลยแต่สัปดาห์นี้เกิด ≥ 3 ครั้ง
 */
export function detectAnomalies(rows: WasteRow[], latestDate: string | null): Anomaly[] {
  const end = toDate(latestDate)
  if (!end) return []
  const endMs = end.getTime()
  const dims: { kind: Anomaly['kind']; fn: (r: WasteRow) => string | null }[] = [
    { kind: 'ปัญหา',  fn: r => problemOf(r) },
    { kind: 'ลูกค้า', fn: r => customerOf(r) },
    { kind: 'เครื่อง', fn: r => (r.Machine && r.Machine.toUpperCase() !== 'OTHER') ? r.Machine : null },
  ]
  const out: Anomaly[] = []
  dims.forEach(({ kind, fn }) => {
    const acc = new Map<string, { weeks: number[]; counts: number[] }>()
    rows.forEach(r => {
      const dt = toDate(r.Date)
      if (!dt) return
      const age = Math.round((endMs - dt.getTime()) / DAY_MS)
      const w = Math.floor(age / 7)          // 0 = 7 วันล่าสุด
      if (age < 0 || w > WEEKS_BASE) return
      const k = fn(r)
      if (!k || k === '(ไม่ระบุ)') return
      const a = acc.get(k) ?? { weeks: new Array(WEEKS_BASE + 1).fill(0), counts: new Array(WEEKS_BASE + 1).fill(0) }
      a.weeks[w] += r.Value ?? 0; a.counts[w]++
      acc.set(k, a)
    })
    acc.forEach((a, key) => {
      const value = a.weeks[0], count = a.counts[0]
      if (count < 3 || value < 5000) return
      const base = a.weeks.slice(1)
      const mean = base.reduce((s, v) => s + v, 0) / WEEKS_BASE
      const sd = Math.sqrt(base.reduce((s, v) => s + (v - mean) ** 2, 0) / WEEKS_BASE)
      if (mean === 0) { out.push({ kind, key, value, count, baseline: 0, ratio: null }); return }
      if (value >= mean * 2 && value >= mean + 2 * sd) out.push({ kind, key, value, count, baseline: mean, ratio: value / mean })
    })
  })
  // เรียงตามส่วนเกินจากปกติ (บาท) มากไปน้อย
  return out.sort((a, b) => (b.value - b.baseline) - (a.value - a.baseline))
}

function aggregateWindows(
  rows: WasteRow[], keyFn: (r: WasteRow) => string, latestDate: string | null, windowDays: number,
): Mover[] {
  const end = toDate(latestDate)
  if (!end) return []
  const endMs = end.getTime()

  // เดือนสำหรับ sparkline: 6 เดือนย้อนหลังนับรวมเดือนล่าสุด
  const sparkKeys: string[] = []
  for (let i = 5; i >= 0; i--) {
    const m = new Date(end.getFullYear(), end.getMonth() - i, 1)
    sparkKeys.push(`${m.getFullYear()}-${m.getMonth()}`)
  }

  const acc = new Map<string, Mover>()
  rows.forEach(r => {
    const dt = toDate(r.Date)
    if (!dt) return
    const age = Math.round((endMs - dt.getTime()) / DAY_MS)  // 0 = วันล่าสุด
    if (age < 0) return
    const k = keyFn(r)
    let m = acc.get(k)
    if (!m) { m = { key: k, recentValue: 0, priorValue: 0, recentCount: 0, priorCount: 0, delta: 0, pct: null, spark: new Array(6).fill(0) }; acc.set(k, m) }
    const v = r.Value ?? 0
    if (age < windowDays)            { m.recentValue += v; m.recentCount++ }
    else if (age < windowDays * 2)   { m.priorValue  += v; m.priorCount++ }
    const si = sparkKeys.indexOf(`${dt.getFullYear()}-${dt.getMonth()}`)
    if (si >= 0) m.spark[si] += v
  })

  return [...acc.values()]
    .map(m => ({ ...m, delta: m.recentValue - m.priorValue, pct: m.priorValue > 0 ? (m.recentValue - m.priorValue) / m.priorValue : null }))
}
