import { useState, useEffect } from 'react'

const API_URL = import.meta.env.VITE_API_URL as string

/**
 * จำนวน job ผลิตต่อเดือน — กรอกมือในชีต `Config_ProductionJobs`
 * (สร้างชีตจากเมนู 🎯 Target Config → 🏭 Setup Production Jobs Config)
 *
 * ที่มา: รายงาน PRD004PrdctnTmeDetails คอลัมน์ `job` แถว Total
 *   หน้า F1-PR → Jobs_F1 · หน้า F2-PR → Jobs_F2
 * ใช้เป็นตัวหารของ % ในการ์ด Total Jobs · อัปเดตสัปดาห์ละ 2 ครั้ง
 */
export interface ProdJobsMonth { f1: number; f2: number; total: number }

// key: "YYYY-MM" → จำนวน job ผลิตของเดือนนั้น
export type ProductionJobsMap = Map<string, ProdJobsMonth>

export interface ProductionJobs {
  byMonth: ProductionJobsMap
  loaded:  boolean
  /** รวม job ผลิตของเดือนที่ระบุ (คีย์ "YYYY-MM") — เดือนที่ยังไม่กรอกจะถูกข้าม */
  sumFor:  (monthKeys: Iterable<string>) => number
}

export function useProductionJobs(): ProductionJobs {
  const [byMonth, setByMonth] = useState<ProductionJobsMap>(new Map())
  const [loaded,  setLoaded]  = useState(false)

  useEffect(() => {
    if (!API_URL) return
    fetch(`${API_URL}?sheet=ProductionJobs&t=${Date.now()}`)
      .then(r => r.json())
      .then(d => {
        const m: ProductionJobsMap = new Map()
        ;(d.data ?? []).forEach((row: Record<string, unknown>) => {
          const yr = Number(row['calendaryear'] ?? 0)
          const mo = Number(row['monthno']      ?? 0)
          if (!yr || !mo) return
          const f1 = Number(row['jobs_f1'] ?? 0)
          const f2 = Number(row['jobs_f2'] ?? 0)
          if (!f1 && !f2) return
          m.set(`${yr}-${String(mo).padStart(2,'0')}`, { f1, f2, total: f1 + f2 })
        })
        if (m.size) { setByMonth(m); setLoaded(true) }
      })
      .catch(() => {})
  }, [])

  const sumFor = (monthKeys: Iterable<string>) => {
    let sum = 0
    for (const k of monthKeys) sum += byMonth.get(k)?.total ?? 0
    return sum
  }

  return { byMonth, loaded, sumFor }
}

