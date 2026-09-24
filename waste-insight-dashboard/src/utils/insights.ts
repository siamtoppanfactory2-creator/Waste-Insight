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
