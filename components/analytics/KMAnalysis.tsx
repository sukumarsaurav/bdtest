'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { BASE_LINES } from '@/lib/baseline'
import {
  SEASON_CALENDAR,
  SEASON_MULTIPLIER,
  getSeasonMultiplier,
  getSeasonType,
  fmtPerKm,
} from '@/lib/formatters'

type SortKey = 'lineId' | 'lineName' | 'partner' | 'region' | 'contractedWeeklyKm' | 'actualKm' | 'utilisation' | 'deltaKm' | 'forecastMonthlyKm' | 'forecastCpk'
type SortDir = 'asc' | 'desc'

interface LineKM {
  [key: string]: string | number | boolean | undefined
  lineId: string
  lineName: string
  route: string
  partner: string
  region: string
  contractedWeeklyKm: number
  actualKm: number
  utilisation: number
  deltaKm: number
  minG: number
  impactLakh: number
  forecastMonthlyKm: number
  forecastMonthlyCost: number
  forecastCpk: number
  startDate?: string
  isNewLine: boolean
}

interface PartnerRollup {
  partner: string
  lines: number
  totalContractedKm: number
  totalActualKm: number
  utilisation: number
  impactLakh: number
  forecastMonthlyLakh: number
  forecastCpk: number
}

const baseByCode = Object.fromEntries(BASE_LINES.map((l) => [l.code, l]))

/** Convert "2026_W9" to a Date (Monday of that ISO week) */
function parseWeekDate(yw: string): Date {
  const match = yw.match(/^(\d{4})_W(\d{1,2})$/)
  if (!match) return new Date()
  const year = parseInt(match[1])
  const week = parseInt(match[2])
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(year, 0, 4)
  const dayOfWeek = jan4.getDay() || 7 // Mon=1 .. Sun=7
  const monday = new Date(jan4)
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7)
  return monday
}

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

function fmtLakh(n: number): string {
  const abs = Math.abs(n)
  return `${n < 0 ? '-' : ''}${abs.toFixed(1)}L`
}

function statusBadge(utilisation: number): { label: string; color: string } {
  if (utilisation > 100) return { label: 'Exceeded', color: 'bg-[#444444]/10 text-[#444444] dark:bg-[#444444]/20 dark:text-[#444444]' }
  if (utilisation >= 90) return { label: 'On track', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' }
  if (utilisation >= 80) return { label: 'Below 10% \u2014 monitor', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' }
  return { label: 'Below 20% \u2014 alert', color: 'bg-[#FFAD00]/10 text-[#FFAD00] dark:bg-[#FFAD00]/20 dark:text-[#FFAD00]' }
}

function utilColor(pct: number): string {
  if (pct < 60) return 'text-[#FFAD00]'
  if (pct < 80) return 'text-[#FFAD00]'
  return 'text-[#73D700]'
}

export default function KMAnalysis() {
  const sheetData = useStore((s) => s.sheetData)
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)
  const [activeTab, setActiveTab] = useState<'latest' | 'mtd' | 'trend'>('latest')
  const [sortKey, setSortKey] = useState<SortKey>('utilisation')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [regionFilter, setRegionFilter] = useState<'all' | 'N' | 'S' | 'W'>('all')

  // Determine current data month from the latest yearWeek in sheet data
  const currentMonthKey = useMemo(() => {
    if (!sheetData?.rows?.length) return null
    const latestYW = sheetData.rows.reduce((max, r) => (r.yearWeek > max ? r.yearWeek : max), '')
    const parsed = parseWeekDate(latestYW)
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}`
  }, [sheetData])

  const currentSeasonMult = currentMonthKey ? getSeasonMultiplier(currentMonthKey) : 1.0
  const currentSeasonType = currentMonthKey ? getSeasonType(currentMonthKey) : null

  const lineData: LineKM[] = useMemo(() => {
    if (!sheetData) return []
    const byLine: Record<string, typeof sheetData.rows> = {}
    sheetData.rows.forEach((r) => {
      if (!byLine[r.lineId]) byLine[r.lineId] = []
      byLine[r.lineId].push(r)
    })

    // Determine the latest yearWeek in the data for age calculation
    const latestYW = sheetData.rows.reduce((max, r) => r.yearWeek > max ? r.yearWeek : max, '')
    const latestWeekDate = parseWeekDate(latestYW)

    return Object.entries(byLine).map(([lineId, rows]) => {
      const base = baseByCode[lineId]
      // Season-adjusted contracted monthly KM (rt is weighted by the current month's season multiplier)
      const contractedMonthlyKm = base ? base.owKm * 2 * base.rt * base.buses * currentSeasonMult : 0
      let contractedWeeklyKm = contractedMonthlyKm / 4.33

      // Pro-rate contracted KM for new lines (< 4 weeks old)
      const startDateStr = base?.startDate
      let isNewLine = false
      if (startDateStr) {
        const startDate = new Date(startDateStr)
        const msPerWeek = 7 * 24 * 60 * 60 * 1000
        const weeksOld = (latestWeekDate.getTime() - startDate.getTime()) / msPerWeek
        if (weeksOld < 4 && weeksOld > 0) {
          isNewLine = true
          contractedWeeklyKm = contractedWeeklyKm * (weeksOld / 4)
        }
      }

      const actualKm = rows.reduce((s, r) => s + r.busKm, 0)
      const utilisation = contractedWeeklyKm > 0 ? (actualKm / contractedWeeklyKm) * 100 : 0
      const deltaKm = actualKm - contractedWeeklyKm
      const minG = base?.minG ?? rows[0].minG
      const impactLakh = (deltaKm * minG) / 100000

      // MTD forecast: extrapolate this week's actual km to a full month (1 week -> 4.33 weeks)
      const forecastMonthlyKm = actualKm * 4.33
      const forecastMonthlyCost = (forecastMonthlyKm * minG) / 100000  // in ₹L
      const forecastCpk = forecastMonthlyKm > 0 ? (forecastMonthlyCost * 100000) / forecastMonthlyKm : minG

      return {
        lineId,
        lineName: base?.route ?? rows[0].lineName,
        route: base?.route ?? rows[0].lineName,
        partner: rows[0].partner,
        region: rows[0].region,
        contractedWeeklyKm: +contractedWeeklyKm.toFixed(0),
        actualKm,
        utilisation: +utilisation.toFixed(1),
        deltaKm: +deltaKm.toFixed(0),
        minG,
        impactLakh: +impactLakh.toFixed(1),
        forecastMonthlyKm: +forecastMonthlyKm.toFixed(0),
        forecastMonthlyCost: +forecastMonthlyCost.toFixed(2),
        forecastCpk: +forecastCpk.toFixed(2),
        startDate: base?.startDate,
        isNewLine,
      }
    })
  }, [sheetData, currentSeasonMult])

  const filteredData = useMemo(() => {
    let d = lineData
    if (regionFilter !== 'all') d = d.filter((l) => l.region === regionFilter)
    return d.sort((a, b) => {
      const aVal = a[sortKey] ?? 0
      const bVal = b[sortKey] ?? 0
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDir === 'asc' ? +aVal - +bVal : +bVal - +aVal
    })
  }, [lineData, regionFilter, sortKey, sortDir])

  const partnerRollup: PartnerRollup[] = useMemo(() => {
    const map: Record<string, {
      lines: number
      contracted: number
      actual: number
      impact: number
      forecastKm: number
      forecastCost: number
    }> = {}
    lineData.forEach((l) => {
      if (!map[l.partner]) map[l.partner] = { lines: 0, contracted: 0, actual: 0, impact: 0, forecastKm: 0, forecastCost: 0 }
      map[l.partner].lines++
      map[l.partner].contracted += l.contractedWeeklyKm
      map[l.partner].actual += l.actualKm
      map[l.partner].impact += l.impactLakh
      map[l.partner].forecastKm += l.forecastMonthlyKm
      map[l.partner].forecastCost += l.forecastMonthlyCost
    })
    return Object.entries(map)
      .map(([partner, d]) => ({
        partner,
        lines: d.lines,
        totalContractedKm: d.contracted,
        totalActualKm: d.actual,
        utilisation: d.contracted > 0 ? +((d.actual / d.contracted) * 100).toFixed(1) : 0,
        impactLakh: +d.impact.toFixed(1),
        forecastMonthlyLakh: +d.forecastCost.toFixed(1),
        forecastCpk: d.forecastKm > 0 ? +((d.forecastCost * 100000) / d.forecastKm).toFixed(2) : 0,
      }))
      .sort((a, b) => Math.abs(b.impactLakh) - Math.abs(a.impactLakh))
  }, [lineData])

  // Summary stats
  const below80 = filteredData.filter((l) => l.utilisation < 80).length
  const exceeded = filteredData.filter((l) => l.utilisation > 100).length

  // Net impact
  const netImpact = lineData.reduce((s, l) => s + l.impactLakh, 0)

  // Week count for trend tab
  const weekCount = useMemo(() => {
    if (!sheetData) return 0
    const weeks = new Set(sheetData.rows.map((r) => r.yearWeek))
    return weeks.size
  }, [sheetData])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <span className="text-gray-300 ml-1">&uarr;&darr;</span>
    return <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>
  }

  if (!sheetData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-10 text-center max-w-lg">
          <h2 className="text-xl font-semibold text-[#444444] dark:text-white mb-2">No live data for KM Analysis</h2>
          <p className="text-gray-500 text-sm">
            Sync weekly hub data to see contracted vs actual KM analysis. Go to{' '}
            <a href="/sync" className="text-[#73D700] underline">Sync page</a> to upload data.
          </p>
        </div>
      </div>
    )
  }

  const tabs = [
    { key: 'latest' as const, label: 'Latest Week' },
    { key: 'mtd' as const, label: 'Month-to-date' },
    { key: 'trend' as const, label: 'Week-on-week Trend' },
  ]

  return (
    <div className="space-y-6">
      {/* Seasonality calendar */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
            Seasonality Calendar
          </h3>
          {currentMonthKey && currentSeasonType && (
            <span className="text-xs text-gray-500">
              Current month: <span className="font-mono">{currentMonthKey}</span> &middot;{' '}
              <span className="font-semibold">{currentSeasonType}</span> ({(currentSeasonMult * 100).toFixed(0)}% run-rate)
            </span>
          )}
        </div>
        <div className="grid grid-cols-6 md:grid-cols-11 gap-1">
          {Object.entries(SEASON_CALENDAR).map(([ym, season]) => {
            const mult = SEASON_MULTIPLIER[season]
            const isCurrent = ym === currentMonthKey
            const color =
              season === 'XL'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                : season === 'L' || season === 'HS'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
            const [y, m] = ym.split('-')
            const monthName = new Date(+y, +m - 1, 1).toLocaleString('en', { month: 'short' })
            return (
              <div
                key={ym}
                className={`text-center py-1.5 rounded ${color} ${
                  isCurrent ? 'ring-2 ring-[#73D700]' : ''
                }`}
              >
                <div className="text-[10px] font-medium opacity-75">
                  {monthName} {y.slice(2)}
                </div>
                <div className="text-xs font-bold">{season}</div>
                <div className="text-[9px] opacity-75">{(mult * 100).toFixed(0)}%</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.key
                ? 'bg-white dark:bg-gray-700 text-[#444444] dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'latest' && (
        <>
          {/* Summary strip */}
          <div className="flex gap-4 text-sm">
            <span className="px-3 py-1 rounded-full bg-[#FFAD00]/10 dark:bg-[#FFAD00]/20 text-[#FFAD00] font-medium">
              {below80} lines below 80% utilisation
            </span>
            <span className="px-3 py-1 rounded-full bg-[#444444]/5 dark:bg-[#444444]/20 text-[#444444] dark:text-[#444444]/60 font-medium">
              {exceeded} lines exceeded contracted
            </span>
          </div>

          {/* Region filter pills */}
          <div className="flex gap-2">
            {(['all', 'N', 'S', 'W'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRegionFilter(r)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  regionFilter === r
                    ? 'bg-[#444444] text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {r === 'all' ? 'All Regions' : r === 'N' ? 'North' : r === 'S' ? 'South' : 'West'}
              </button>
            ))}
          </div>

          {/* Main table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  {[
                    { key: 'lineId' as SortKey, label: 'Line ID' },
                    { key: 'lineName' as SortKey, label: 'Route' },
                    { key: 'partner' as SortKey, label: 'Partner' },
                    { key: 'region' as SortKey, label: 'Region' },
                    { key: 'contractedWeeklyKm' as SortKey, label: 'Contracted Wkly KM' },
                    { key: 'actualKm' as SortKey, label: 'Actual KM' },
                    { key: 'utilisation' as SortKey, label: 'Utilisation %' },
                    { key: 'deltaKm' as SortKey, label: '\u0394 KM' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none whitespace-nowrap"
                    >
                      {col.label}
                      <SortIcon col={col.key} />
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Season</th>
                  {[
                    { key: 'forecastMonthlyKm' as SortKey, label: 'Forecast Mo KM' },
                    { key: 'forecastCpk' as SortKey, label: 'Forecast \u20B9/km' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => toggleSort(col.key)}
                      className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 select-none whitespace-nowrap"
                    >
                      {col.label}
                      <SortIcon col={col.key} />
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Start Date</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredData.map((l) => {
                  const badge = statusBadge(l.utilisation)
                  return (
                    <tr key={l.lineId} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-3 py-2 font-mono text-xs">{l.lineId}</td>
                      <td className="px-3 py-2">
                        {l.route}
                        {l.isNewLine && (
                          <span className="ml-1 inline-block px-1.5 py-0.5 text-[10px] font-bold bg-[#444444]/10 text-[#444444] dark:bg-[#444444]/20 dark:text-[#444444] rounded">NEW</span>
                        )}
                      </td>
                      <td className="px-3 py-2">{l.partner}</td>
                      <td className="px-3 py-2">{l.region}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(l.contractedWeeklyKm)}</td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(l.actualKm)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${utilColor(l.utilisation)}`}>
                        {l.utilisation.toFixed(1)}%
                      </td>
                      <td className={`px-3 py-2 text-right font-mono ${l.deltaKm < 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                        {l.deltaKm > 0 ? '+' : ''}{fmt(l.deltaKm)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {currentSeasonType ? (
                          <span className="inline-flex items-center gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                currentSeasonType === 'XL'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
                                  : currentSeasonType === 'L' || currentSeasonType === 'HS'
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                              }`}
                            >
                              {currentSeasonType}
                            </span>
                            <span className="text-[10px] text-gray-500">{(currentSeasonMult * 100).toFixed(0)}%</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">{'\u2014'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(l.forecastMonthlyKm)}</td>
                      <td
                        className={`px-3 py-2 text-right font-mono ${
                          l.forecastCpk > l.minG ? 'text-[#FFAD00]' : 'text-[#73D700]'
                        }`}
                      >
                        {fmtPerKm(l.forecastCpk, showEur, eurRate)}
                        <div className="text-[9px] text-gray-400">contract {fmtPerKm(l.minG, showEur, eurRate)}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{l.startDate ?? '\u2014'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.color}`}>{badge.label}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === 'mtd' && (
        <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <h3 className="text-lg font-semibold text-[#444444] dark:text-white mb-2">Month-to-date Analysis</h3>
          <p className="text-gray-500 text-sm">
            MTD analysis requires multiple weekly snapshots within a month. Sync more weeks to enable.
          </p>
        </div>
      )}

      {activeTab === 'trend' && (
        <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <h3 className="text-lg font-semibold text-[#444444] dark:text-white mb-2">Week-on-week Trend</h3>
          <p className="text-gray-500 text-sm">
            Trend analysis requires 4+ weeks of data. Currently {weekCount} week(s) synced.
          </p>
        </div>
      )}

      {/* Impact section */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-[#444444] dark:text-white flex items-center gap-2">
          <span className="text-base">\u20B9</span> Impact Analysis
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
          {lineData
            .filter((l) => l.deltaKm !== 0)
            .sort((a, b) => Math.abs(b.impactLakh) - Math.abs(a.impactLakh))
            .map((l) => (
              <div
                key={l.lineId}
                className={`text-xs p-2 rounded-md ${
                  l.deltaKm < 0
                    ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                    : 'bg-[#FFAD00]/10 dark:bg-[#FFAD00]/10 text-[#FFAD00] dark:text-[#FFAD00]'
                }`}
              >
                <span className="font-mono font-medium">{l.lineId}</span>{' '}
                {l.deltaKm < 0
                  ? `Partner under-delivering. Flix saves \u20B9${fmtLakh(Math.abs(l.impactLakh))} this week (\u0394km \u00D7 minG)`
                  : `Extra cost: \u20B9${fmtLakh(l.impactLakh)} (review if approved)`}
              </div>
            ))}
        </div>

        <div
          className={`mt-3 p-3 rounded-lg text-sm font-semibold ${
            netImpact > 0
              ? 'bg-[#FFAD00]/10 dark:bg-[#FFAD00]/20 text-[#FFAD00]'
              : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
          }`}
        >
          Net fleet impact: \u20B9{fmtLakh(Math.abs(netImpact))} this week{' '}
          {netImpact > 0 ? '(Flix cost)' : '(Flix saves)'}
        </div>
      </div>

      {/* Partner rollup */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
          <h3 className="text-sm font-semibold text-[#444444] dark:text-white">Partner Rollup</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Partner</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Lines</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Contracted KM/wk</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Actual KM/wk</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Utilisation %</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">{'\u0394\u20B9L'} Impact</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">{'Forecast Mo \u20B9L'}</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">{'Forecast \u20B9/km'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {partnerRollup.map((p) => (
                <tr key={p.partner} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 font-medium">{p.partner}</td>
                  <td className="px-3 py-2 text-right">{p.lines}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(p.totalContractedKm)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmt(p.totalActualKm)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${utilColor(p.utilisation)}`}>
                    {p.utilisation.toFixed(1)}%
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      p.impactLakh > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'
                    }`}
                  >
                    {p.impactLakh > 0 ? '+' : ''}{fmtLakh(p.impactLakh)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{fmtLakh(p.forecastMonthlyLakh)}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {p.forecastCpk > 0 ? fmtPerKm(p.forecastCpk, showEur, eurRate) : '\u2014'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
