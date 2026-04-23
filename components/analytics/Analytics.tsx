'use client'

import { useEffect, useState } from 'react'
import { useStore } from '@/store/useStore'
import Executive from './Executive'
import LiveCharts from './LiveCharts'
import LinesTable from './LinesTable'
import PartnerScorecard from './PartnerScorecard'
import KMAnalysis from './KMAnalysis'
import Targets from './Targets'
import BDOptimisation from './BDOptimisation'
import Supply from './Supply'
import { exportAnalyticsPDF, exportAnalyticsExcel } from './exporters'

interface WeekInfo {
  year_week: string
  period: string
  pushed_at: string
  source: string
}

type SubTab = 'executive' | 'live' | 'lines' | 'partners' | 'km-analysis' | 'targets' | 'bd-optimisation' | 'supply'

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'executive', label: 'Executive' },
  { key: 'live', label: 'Live Data' },
  { key: 'lines', label: 'Lines' },
  { key: 'partners', label: 'Partners' },
  { key: 'km-analysis', label: 'KM Analysis' },
  { key: 'targets', label: 'Targets' },
  { key: 'bd-optimisation', label: 'BD Optimisation' },
  { key: 'supply', label: 'Supply' },
]

export default function Analytics() {
  const selectedWeek = useStore((s) => s.selectedWeek)
  const setSelectedWeek = useStore((s) => s.setSelectedWeek)
  const setSheetData = useStore((s) => s.setSheetData)
  const setAvailableWeeksStore = useStore((s) => s.setAvailableWeeks)
  const sheetData = useStore((s) => s.sheetData)
  const lines = useStore((s) => s.lines)
  const [availableWeeks, setAvailableWeeks] = useState<WeekInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [subTab, setSubTab] = useState<SubTab>('executive')
  const [exporting, setExporting] = useState<'pdf' | 'xlsx' | null>(null)

  useEffect(() => {
    const yearWeekKey = (yw: string): number => {
      const m = /^(\d{4})_W(\d+)$/.exec(yw)
      if (!m) return 0
      return parseInt(m[1], 10) * 100 + parseInt(m[2], 10)
    }
    setLoading(true)
    fetch(`/api/sheet-data?week=${selectedWeek}`)
      .then((res) => res.json())
      .then(async (data) => {
        if (data.weeks) {
          setAvailableWeeks(data.weeks)
          setAvailableWeeksStore(
            (data.weeks as WeekInfo[]).map((w) => w.year_week)
          )
        }
        // If selectedWeek is 'latest', find the temporally latest week
        const weeks = (data.weeks || []).map((w: WeekInfo) => w.year_week).filter(Boolean)
        const latestByYW = [...weeks].sort((a: string, b: string) => yearWeekKey(b) - yearWeekKey(a))[0]
        let finalData = data
        if (selectedWeek === 'latest' && latestByYW && latestByYW !== data.year_week) {
          finalData = await fetch(`/api/sheet-data?week=${latestByYW}`).then((r) => r.json())
          setSelectedWeek(latestByYW)
        }
        if (finalData && !finalData.noData && finalData.rows) {
          setSheetData({
            yearWeek: finalData.year_week,
            period: finalData.period,
            pushedAt: finalData.pushed_at,
            source: finalData.source,
            rows: finalData.rows,
          })
        }
        setLoading(false)
      })
      .catch((err) => {
        console.error('Sheet data fetch error:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [selectedWeek, setSheetData, setAvailableWeeksStore, setSelectedWeek])

  async function handleExportPdf() {
    setExporting('pdf')
    try {
      await exportAnalyticsPDF({ lines, sheetData })
    } finally {
      setExporting(null)
    }
  }

  async function handleExportExcel() {
    setExporting('xlsx')
    try {
      await exportAnalyticsExcel({ lines, sheetData })
    } finally {
      setExporting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-[#73D700] border-t-transparent rounded-full" />
      </div>
    )
  }

  if (availableWeeks.length === 0 && !sheetData) {
    return (
      <div className="space-y-6">
        {/* Still show executive based on baseline-only data */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4 text-sm text-amber-800 dark:text-amber-200">
          No live SharePoint data yet — Executive view shows baseline-only metrics. Visit{' '}
          <a href="/sync" className="underline font-medium">/sync</a> to push weekly data.
        </div>

        <div className="flex gap-1 overflow-x-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {SUB_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSubTab(t.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                subTab === t.key
                  ? 'bg-white dark:bg-gray-700 text-[#444444] dark:text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {subTab === 'executive' && <Executive />}
        {subTab === 'live' && <LiveCharts />}
        {subTab === 'lines' && <LinesTable />}
        {subTab === 'partners' && <PartnerScorecard />}
        {subTab === 'km-analysis' && <KMAnalysis />}
        {subTab === 'targets' && <Targets />}
        {subTab === 'bd-optimisation' && <BDOptimisation />}
        {subTab === 'supply' && <Supply />}
      </div>
    )
  }

  return (
    <div className="space-y-6" id="analytics-root">
      {/* Header strip: week selector + exports */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Week</label>
          <select
            value={selectedWeek}
            onChange={(e) => setSelectedWeek(e.target.value)}
            className="rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm focus:border-[#73D700] focus:ring-[#73D700]"
          >
            <option value="latest">Latest</option>
            {availableWeeks.map((w) => (
              <option key={w.year_week} value={w.year_week}>
                {w.year_week} — {w.period}
              </option>
            ))}
          </select>
          {sheetData && (
            <span className="text-xs text-gray-400">
              {sheetData.period} &middot; {sheetData.rows.length} rows &middot; Synced {new Date(sheetData.pushedAt).toLocaleString()}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportPdf}
            disabled={exporting !== null}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white disabled:opacity-50"
          >
            {exporting === 'pdf' ? 'Exporting…' : 'Export PDF'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={exporting !== null}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-[#73D700] text-[#444444] hover:bg-[#65bf00] disabled:opacity-50"
          >
            {exporting === 'xlsx' ? 'Exporting…' : 'Export Excel'}
          </button>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 overflow-x-auto bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {SUB_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              subTab === t.key
                ? 'bg-white dark:bg-gray-700 text-[#444444] dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      {subTab === 'executive' && <Executive />}
      {subTab === 'live' && <LiveCharts />}
      {subTab === 'lines' && <LinesTable />}
      {subTab === 'partners' && <PartnerScorecard />}
      {subTab === 'km-analysis' && <KMAnalysis />}
      {subTab === 'targets' && <Targets />}
      {subTab === 'bd-optimisation' && <BDOptimisation />}
    </div>
  )
}
