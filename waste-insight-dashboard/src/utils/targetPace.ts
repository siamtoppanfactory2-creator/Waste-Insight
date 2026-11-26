// Target ตามสัดส่วนวันที่ผ่านไป — ใช้คิดสีแท่งของเดือนที่ยังไม่จบ
// target ต่อวัน = target เดือน ÷ จำนวนวันในเดือน, นับวันถึงวันที่ของข้อมูลล่าสุด
// เมื่อวันนี้เลยสิ้นเดือนของข้อมูลล่าสุดแล้ว ใช้ target เต็มเดือน

const MONTH_IDX: Record<string, number> = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 }

/** "dd-mmm-yyyy" → { year, monthNo (1–12), day } */
export function parseDataDate(s: string | null | undefined): { year: number; monthNo: number; day: number } | null {
  if (!s) return null
  const p = s.split('-')
  if (p.length < 3) return null
  const m = MONTH_IDX[p[1]]
  if (m === undefined) return null
  return { year: Number(p[2]), monthNo: m + 1, day: Number(p[0]) }
}

/** วันที่ล่าสุดจากแถว DETAIL (คืนค่ารูปแบบเดิม "dd-mmm-yyyy") */
export function latestDate(rows: { Date: string | null }[]): string | null {
  let best: string | null = null, bestKey = -1
  rows.forEach(r => {
    const d = parseDataDate(r.Date)
    if (!d) return
    const key = d.year * 10000 + d.monthNo * 100 + d.day
    if (key > bestKey) { bestKey = key; best = r.Date }
  })
  return best
}

/**
 * Target ที่ควรใช้เทียบของเดือนนั้น
 * - เดือนก่อนเดือนข้อมูลล่าสุด → target เต็มเดือน
 * - เดือนของข้อมูลล่าสุด:
 *     - วันนี้ยังอยู่ในเดือนนั้น  → target ต่อวัน × วันที่ของข้อมูลล่าสุด
 *     - วันนี้เลยสิ้นเดือนแล้ว   → target เต็มเดือน (เดือนจบแล้ว แม้ข้อมูลจะมาไม่ถึงวันสุดท้าย)
 * - เดือนหลังจากนั้น           → 0 (ยังไม่เริ่ม)
 * `today` รับเข้ามาได้เพื่อทดสอบ ปกติใช้วันที่ของเครื่องผู้ใช้
 */
export function pacedTarget(
  year: number, monthNo: number, monthTarget: number, latest: string | null | undefined,
  today: Date = new Date(),
): number {
  const d = parseDataDate(latest)
  if (!d || monthTarget <= 0) return monthTarget
  const ym = year * 100 + monthNo, latestYm = d.year * 100 + d.monthNo
  if (ym < latestYm) return monthTarget
  if (ym > latestYm) return 0
  const todayYm = today.getFullYear() * 100 + today.getMonth() + 1
  if (todayYm > ym) return monthTarget
  const daysInMonth = new Date(year, monthNo, 0).getDate()
  return monthTarget / daysInMonth * Math.min(d.day, daysInMonth)
}

/**
 * Actual ÷ Target สำหรับคิดสี
 * - target > 0            → actual / target
 * - target = 0, มีของเสีย → Infinity (ไม่มีเผื่อไว้เลย = เกิน target ทันที → แดง)
 * - target = 0, ไม่มีของเสีย → 0
 * ใช้ isFinite() เช็คก่อนแสดงเป็น % เพื่อเขียนว่า "ไม่มี target" แทน
 */
export function achRatio(actual: number, target: number): number {
  if (target > 0) return actual / target
  return actual > 0 ? Infinity : 0
}
