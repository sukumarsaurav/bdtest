'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { HubRow } from '@/types'
import { isoWeekStart } from '@/lib/cost-utils'

interface WeekMeta {
  year_week: string
  period: string
  pushed_at: string
  source: string
}

export interface MultiWeekResult {
  thisWeekRows: HubRow[]
  mtdRows: HubRow[]
  ytdRows: HubRow[]
  mtdWeekCount: number
  ytdWeekCount: number
  loading: boolean
}

/** Parse "YYYY_WNN" → { year, week } or null */
function parseYearWeek(yw: string): { year: number; week: number } | null {
  const m = /^(\d{4})_W(\d+)$/.exec(yw)
  if (!m) return null
  return { year: parseInt(m[1], 10), week: parseInt(m[2], 10) }
}

/** Get the month (1-12) of the Monday of a given ISO year-week */
function yearWeekMonth(yw: string): number | null {
  const p = parseYearWeek(yw)
  if (!p) return null
  const monday = isoWeekStart(p.year, p.week)
  return monday.getUTCMonth() + 1
}

/** Get the year of the Monday of a given ISO year-week */
function yearWeekYear(yw: string): number | null {
  const p = parseYearWeek(yw)
  if (!p) return null
  const monday = isoWeekStart(p.year, p.week)
  return monday.getUTCFullYear()
}

/**
 * Fetches and caches multiple weeks of sheet data for MTD/YTD aggregation.
 * Accepts the available weeks metadata and the currently selected week's rows.
 */
export function useMultiWeekData(
  availableWeeks: WeekMeta[],
  selectedWeek: string,
  currentRows: HubRow[],
): MultiWeekResult {
  const cache = useRef<Map<string, HubRow[]>>(new Map())
  const [extraRows, setExtraRows] = useState<Map<string, HubRow[]>>(new Map())
  const [loading, setLoading] = useState(false)

  // Seed cache with current week rows
  useEffect(() => {
    if (selectedWeek && currentRows.length > 0) {
      cache.current.set(selectedWeek, currentRows)
    }
  }, [selectedWeek, currentRows])

  // Determine which weeks we need for MTD and YTD
  const selectedMonth = yearWeekMonth(selectedWeek)
  const selectedYear = yearWeekYear(selectedWeek)

  const neededWeeks = useMemo(() => {
    if (!selectedMonth || !selectedYear) return []
    const allYws = availableWeeks.map((w) => w.year_week).filter(Boolean)
    return allYws.filter((yw) => {
      if (yw === selectedWeek) return false // already have this one
      const y = yearWeekYear(yw)
      return y === selectedYear // YTD includes all same-year weeks
    })
  }, [availableWeeks, selectedWeek, selectedMonth, selectedYear])

  // Fetch missing weeks
  useEffect(() => {
    const missing = neededWeeks.filter((yw) => !cache.current.has(yw))
    if (missing.length === 0) {
      // Update state from cache
      const map = new Map<string, HubRow[]>()
      for (const yw of neededWeeks) {
        const cached = cache.current.get(yw)
        if (cached) map.set(yw, cached)
      }
      setExtraRows(map)
      return
    }

    setLoading(true)
    // Fetch in batches of 6 to avoid overwhelming the server
    const batchSize = 6
    const batches: string[][] = []
    for (let i = 0; i < missing.length; i += batchSize) {
      batches.push(missing.slice(i, i + batchSize))
    }

    ;(async () => {
      for (const batch of batches) {
        const results = await Promise.all(
          batch.map((yw) =>
            fetch(`/api/sheet-data?week=${yw}`)
              .then((r) => r.json())
              .then((d) => ({
                yw,
                rows: Array.isArray(d?.rows) ? (d.rows as HubRow[]) : [],
              }))
              .catch(() => ({ yw, rows: [] as HubRow[] })),
          ),
        )
        for (const { yw, rows } of results) {
          cache.current.set(yw, rows)
        }
      }

      // Build state from cache
      const map = new Map<string, HubRow[]>()
      for (const yw of neededWeeks) {
        const cached = cache.current.get(yw)
        if (cached) map.set(yw, cached)
      }
      setExtraRows(map)
      setLoading(false)
    })()
  }, [neededWeeks])

  // Compute MTD and YTD row sets
  const result = useMemo<MultiWeekResult>(() => {
    if (!selectedMonth || !selectedYear) {
      return {
        thisWeekRows: currentRows,
        mtdRows: currentRows,
        ytdRows: currentRows,
        mtdWeekCount: currentRows.length > 0 ? 1 : 0,
        ytdWeekCount: currentRows.length > 0 ? 1 : 0,
        loading,
      }
    }

    // Collect all week-rows (selected + extras)
    const allWeekEntries: [string, HubRow[]][] = [
      [selectedWeek, currentRows],
      ...Array.from(extraRows.entries()),
    ]

    // MTD: weeks whose Monday falls in the selected month + year
    const mtdWeekKeys: string[] = []
    const mtdAllRows: HubRow[] = []
    for (const [yw, rows] of allWeekEntries) {
      const m = yearWeekMonth(yw)
      const y = yearWeekYear(yw)
      if (m === selectedMonth && y === selectedYear) {
        mtdWeekKeys.push(yw)
        mtdAllRows.push(...rows)
      }
    }

    // YTD: all weeks in the same year
    const ytdWeekKeys: string[] = []
    const ytdAllRows: HubRow[] = []
    for (const [yw, rows] of allWeekEntries) {
      const y = yearWeekYear(yw)
      if (y === selectedYear) {
        ytdWeekKeys.push(yw)
        ytdAllRows.push(...rows)
      }
    }

    return {
      thisWeekRows: currentRows,
      mtdRows: mtdAllRows,
      ytdRows: ytdAllRows,
      mtdWeekCount: new Set(mtdWeekKeys).size,
      ytdWeekCount: new Set(ytdWeekKeys).size,
      loading,
    }
  }, [currentRows, extraRows, selectedWeek, selectedMonth, selectedYear, loading])

  return result
}
