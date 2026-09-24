// จับคู่ชื่อปัญหาให้เป็นชื่อเดียวกัน — ข้อมูลดิบมี ~880 แบบ ปนไทย/อังกฤษ และหลายปัญหาในช่องเดียว
//
// ขั้นตอน:
//  1. ตัดรหัสเครื่องที่นำหน้า (PRT08-, HS04-) และคำว่า "ทำ " / "เสีย" ที่นำหน้า
//  2. แยกด้วยตัวคั่นที่ตั้งใจใส่ (- + , /)
//  3. แต่ละส่วน: เทียบกับ ALIASES → ได้ชื่อมาตรฐาน
//     ถ้ามีเว้นวรรค จะแยกคำก็ต่อเมื่อทุกคำเป็นชื่อที่รู้จัก ("สี ขี้หมึก สกัม" → 3 ปัญหา)
//     ไม่อย่างนั้นเก็บทั้งข้อความไว้ ("เบิกทดแทน ดึงไปวิ่ง lot ก่อน…" ไม่ถูกหั่น)
//  4. ตัดซ้ำ เรียงตามลำดับคงที่ แล้วต่อด้วย " + " — "COLOR-SCUM" กับ "สี สกัม" จึงได้ชื่อเดียวกัน
//
// เพิ่ม/แก้คู่ชื่อได้ที่ ALIASES — key เป็นตัวพิมพ์ใหญ่และไม่มีเว้นวรรค

/** ชื่อที่พบในข้อมูล (ตัวพิมพ์ใหญ่ ไม่มีเว้นวรรค) → ชื่อมาตรฐาน */
export const ALIASES: Record<string, string> = {
  // สี
  // สีเพี้ยน = ปัญหาเดียวกับ สี (ยืนยันโดยผู้ใช้)
  // แต่ เลอะสี, สีด่าง, สีถอน, สีดำอ่อน, สีออกแดง, สีต่อกล่อง เป็นคนละปัญหา — อย่ารวมเข้ากับ สี
  'COLOR': 'สี', 'COLOUR': 'สี', 'สีเพี้ยน': 'สี',
  // สกัม
  'SCUM': 'สกัม', 'SCRUM': 'สกัม',
  // ขี้หมึก (hickey)
  'HICKY': 'ขี้หมึก', 'HICKEY': 'ขี้หมึก',
  // ซับหลัง (set-off)
  'SETOFF': 'ซับหลัง', 'SET-OFF': 'ซับหลัง',
  // ภาพผีหลอก (ghost)
  'GHOST': 'ภาพผีหลอก', 'ผีหลอก': 'ภาพผีหลอก',
  // ขูดขีด (scratch)
  'SCRATCH': 'ขูดขีด', 'SCRATCHPR': 'ขูดขีด',
  // เสียจากแผนกถัดไป
  'WASTEATHS': 'เสียจาก HS', 'WASTSATHS': 'เสียจาก HS', 'เสียHS': 'เสียจาก HS',
  'WASTEATGL': 'เสียจาก GL', 'เสียGL': 'เสียจาก GL', 'เสียจากGL': 'เสียจาก GL',
  // เขียนหลายแบบ
  'DCแตก': 'DC แตก', 'DCเหลื่อม': 'DC เหลื่อม', 'HSเหลื่อม': 'HS เหลื่อม', 'EMเหลื่อม': 'EM เหลื่อม',
  'HSไม่เต็ม': 'HS ไม่เต็ม', 'MAX_MIN': 'MAX-MIN', 'PROOF': 'PROOF',
  'ขาดจากLOTก่อน': 'ขาดจาก LOT ก่อน', 'ขาดจากLOTก่อนหน้า': 'ขาดจาก LOT ก่อน', 'ขาดจากLOTที่แล้ว': 'ขาดจาก LOT ก่อน',
  'ยกลงขึ้นใหม่': 'งานยกลงขึ้นใหม่', 'ยอดขาด': 'ยอดงานขาด', 'งานไม่พอ': 'งานมาไม่พอ',
}

/** ชื่อปัญหาที่รู้จัก — ใช้ตัดสินว่าข้อความที่มีเว้นวรรคควรแยกเป็นหลายปัญหาหรือไม่ */
const KNOWN = new Set<string>([
  ...Object.values(ALIASES),
  'สี', 'สีเพี้ยน', 'สีด่าง', 'สีดำอ่อน', 'สีถอน', 'สีออกแดง', 'เลอะสี',
  'สกัม', 'สกัมเหลือง', 'สกัมแดง', 'สกัมลูกน้ำ', 'ขี้หมึก', 'หมึกกอง', 'หมึกปลิว',
  'ซับหลัง', 'ภาพผีหลอก', 'ขูดขีด', 'จุดขาว', 'ด่าง', 'เคลือบด่าง',
  'หยดน้ำมัน', 'หยดน้ำ', 'ขุยกระดาษ', 'ผ้ายางยุบ', 'ฉากไม่ลง', 'ฉากเด้ง', 'รอยบั้ง', 'รอยเพลท', 'รอยเส้น', 'รอยฟันหนู',
  'เผื่อเสียน้อย', 'ติดวานิช', 'สกปรก', 'แก้ไฟล์', 'ปรุแตก', 'ถลอก', 'เส้นใย',
  'ตัดขึ้นตัดลง', 'งานตัดขึ้นตัดลง', 'งานหาย', 'กระดาษหาย', 'แทรกพิมพ์', 'แทรกด่วน', 'ตั้งสีนาน',
])

// ลำดับตอนต่อชื่อหลายปัญหา — ปัญหาหลักขึ้นก่อน ที่เหลือเรียงตามตัวอักษร
const ORDER = ['สี', 'สกัม', 'ขี้หมึก', 'MAX-MIN', 'PROOF']
const rank = (s: string) => { const i = ORDER.indexOf(s); return i < 0 ? ORDER.length : i }

const MACHINE_PREFIX = /^[A-Z]{2,4}\d{2,3}$/   // PRT08, HS04, GL207
const compact = (s: string) => s.replace(/\s+/g, '').toUpperCase()

function mapPart(part: string): string[] {
  let p = part.trim().replace(/^ทำ\s*/, '')
  if (!p) return []
  if (MACHINE_PREFIX.test(compact(p))) return []

  const direct = ALIASES[compact(p)] ?? (KNOWN.has(compact(p)) ? compact(p) : null)
  if (direct) return [direct]
  // "เสียสีเพี้ยน" → "สีเพี้ยน" (เฉพาะเมื่อส่วนที่เหลือเป็นชื่อที่รู้จัก)
  if (p.startsWith('เสีย')) {
    const rest = p.slice(4).trim()
    const r = ALIASES[compact(rest)] ?? (KNOWN.has(rest) ? rest : null)
    if (r) return [r]
  }

  // เว้นวรรค: แยกเฉพาะเมื่อทุกคำรู้จัก
  const words = p.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    const mapped = words.map(w => ALIASES[compact(w)] ?? (KNOWN.has(w) ? w : null))
    if (mapped.every(Boolean)) return mapped as string[]
  }
  // ไม่รู้จัก — เก็บข้อความเดิม (ตัดเว้นวรรคซ้ำ) ตัวอังกฤษเป็นพิมพ์ใหญ่
  p = p.replace(/\s+/g, ' ')
  return [/^[\x00-\x7F]+$/.test(p) ? p.toUpperCase() : p]
}

const cache = new Map<string, string>()

/** ชื่อปัญหาดิบ → ชื่อมาตรฐาน (ถ้าหลายปัญหา ต่อด้วย " + ") */
export function normalizeProblem(raw: string | null | undefined): string {
  const src = (raw ?? '').trim()
  if (!src) return '(ไม่ระบุ)'
  const hit = cache.get(src)
  if (hit !== undefined) return hit

  const s = src
    .replace(/max\s*[-_]?\s*min/gi, 'MAX_MIN')   // "max min", "MAX-MIN" → กันไม่ให้ถูกแยกที่ "-"
    .replace(/\b([A-Z]{2,3})\s+(?=[฀-๿])/g, '$1')  // "DC แตก" → "DCแตก" (เฉพาะคำย่อพิมพ์ใหญ่)

  const parts = s.split(/\s*[-+,/]\s*/).flatMap(mapPart)
  const uniq = [...new Set(parts)].sort((a, b) => (rank(a) - rank(b)) || a.localeCompare(b, 'th'))
  const out = uniq.length ? uniq.join(' + ') : '(ไม่ระบุ)'
  cache.set(src, out)
  return out
}
