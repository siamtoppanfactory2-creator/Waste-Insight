// Target ตามสัดส่วนวันที่ผ่านไป — ใช้คิดสีแท่งของเดือนที่ยังไม่จบ
// target ต่อวัน = target เดือน ÷ จำนวนวันในเดือน, นับวันถึงวันที่ของข้อมูลล่าสุด

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
 * - เดือนของข้อมูลล่าสุด       → target ต่อวัน × วันที่ผ่านไป
 * - เดือนหลังจากนั้น           → 0 (ยังไม่เริ่ม)
 */
export function pacedTarget(year: number, monthNo: number, monthTarget: number, latest: string | null | undefined): number {
  const d = parseDataDate(latest)
  if (!d || monthTarget <= 0) return monthTarget
  const ym = year * 100 + monthNo, latestYm = d.year * 100 + d.monthNo
  if (ym < latestYm) return monthTarget
  if (ym > latestYm) return 0
  const daysInMonth = new Date(year, monthNo, 0).getDate()
  return monthTarget / daysInMonth * Math.min(d.day, daysInMonth)
}
