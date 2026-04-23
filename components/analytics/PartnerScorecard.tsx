'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Line, LineActual, SheetSnapshot } from '@/types'
import { computeLineActuals } from '@/lib/metrics'
import { fmtINR, fmtPct, fmtLakhs, fmtNum, deltaColor, deltaColorBg } from '@/lib/formatters'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line as RLine,
} from 'recharts'

const FLIX_GREEN = '#73D700'
const RED = '#FFAD00'

interface PartnerSummary {
  partner: string
  lineCount: number
  totalBuses: number
  totalMonthly: number
  avgMinG: number
  avgDelta: number
  healthScore: number
  weeklyPayable: number
  priorWeekPayable: number
  wowDelta: number | null
  lines: Line[]
  actuals: LineActual[]
  regions: Set<'N' | 'S' | 'W'>
}

function computeHealthScore(lines: Line[]): number {
  if (lines.length === 0) return 0
  const totalMonthly = lines.reduce((s, l) => s + l.monthly, 0)
  if (totalMonthly === 0) return 0
  const weightedDelta = lines.reduce((s, l) => {
    const d = l.delta ?? 0
    return s + d * l.monthly
  }, 0) / totalMonthly
  return Math.max(0, Math.min(100, 50 + weightedDelta * 3))
}

export default function PartnerScorecard() {
  const allLines = useStore((s) => s.lines)
  const activeRegion = useStore((s) => s.activeRegion)
  const lines = useMemo(() => activeRegion === 'all' ? allLines : allLines.filter((l: any) => l.region === activeRegion), [allLines, activeRegion])
  const sheetData = useStore((s) => s.sheetData)
  const availableWeeks = useStore((s) => s.availableWeeks)
  const [expandedPartner, setExpandedPartner] = useState<string | null>(null)
  const [priorActuals, setPriorActuals] = useState<Map<string, LineActual>>(new Map())

  // Fetch prior-week actuals for WoW delta
  useEffect(() => {
    if (!sheetData || availableWeeks.length < 2) {
      setPriorActuals(new Map())
      return
    }
    const sorted = [...availableWeeks].sort()
    const idx = sorted.indexOf(sheetData.yearWeek)
    const priorWeek = idx > 0 ? sorted[idx - 1] : null
    if (!priorWeek) return
    fetch(`/api/sheet-data?week=${priorWeek}`)
      .then((r) => r.json() as Promise<SheetSnapshot>)
      .then((snap) => {
        if (snap?.rows) {
          const a = computeLineActuals(snap.rows)
          setPriorActuals(new Map(a.map((x) => [x.lineId, x])))
        }
      })
      .catch(() => {})
  }, [sheetData, availableWeeks])

  const actualsMap = useMemo(() => {
    if (!sheetData) return new Map<string, LineActual>()
    const actuals = computeLineActuals(sheetData.rows)
    return new Map(actuals.map((a) => [a.lineId, a]))
  }, [sheetData])

  const partners = useMemo<PartnerSummary[]>(() => {
    const grouped: Record<string, Line[]> = {}
    lines.forEach((l) => {
      if (!grouped[l.partner]) grouped[l.partner] = []
      grouped[l.partner].push(l)
    })

    return Object.entries(grouped).map(([partner, pLines]) => {
      const totalBuses = pLines.reduce((s, l) => s + l.buses, 0)
      const totalMonthly = pLines.reduce((s, l) => s + l.monthly, 0)
      const avgMinG = pLines.reduce((s, l) => s + l.minG, 0) / pLines.length
      const deltas = pLines.filter((l) => l.delta != null)
      const avgDelta = deltas.length > 0
        ? deltas.reduce((s, l) => s + (l.delta ?? 0), 0) / deltas.length
        : 0

      const actuals = pLines
        .map((l) => actualsMap.get(l.code))
        .filter((a): a is LineActual => a !== undefined)

      const weeklyPayable = actuals.reduce((s, a) => s + a.payableAmount, 0)
      const priorWeekPayable = pLines.reduce((sum, l) => {
        const p = priorActuals.get(l.code)
        return sum + (p?.payableAmount ?? 0)
      }, 0)
      const wowDelta = priorWeekPayable > 0
        ? ((weeklyPayable - priorWeekPayable) / priorWeekPayable) * 100
        : null

      const regions = new Set<'N' | 'S' | 'W'>(pLines.map((l) => l.region))

      return {
        partner,
        lineCount: pLines.length,
        totalBuses,
        totalMonthly,
        avgMinG: +avgMinG.toFixed(0),
        avgDelta: +avgDelta.toFixed(1),
        healthScore: +computeHealthScore(pLines).toFixed(0),
        weeklyPayable,
        priorWeekPayable,
        wowDelta,
        lines: pLines,
        actuals,
        regions,
      }
    }).sort((a, b) => b.totalMonthly - a.totalMonthly)
  }, [lines, actualsMap, priorActuals])

  // Heatmap: partner × region average delta
  const heatmap = useMemo(() => {
    const top = partners.slice(0, 12)
    return top.map((p) => {
      const cells: Record<'N' | 'S' | 'W', { delta: number | null; monthly: number }> = {
        N: { delta: null, monthly: 0 },
        S: { delta: null, monthly: 0 },
        W: { delta: null, monthly: 0 },
      }
      ;(['N', 'S', 'W'] as const).forEach((r) => {
        const rLines = p.lines.filter((l) => l.region === r)
        if (rLines.length === 0) return
        const monthly = rLines.reduce((s, l) => s + l.monthly, 0)
        const deltas = rLines.filter((l) => l.delta != null)
        const avgD = deltas.length > 0
          ? deltas.reduce((s, l) => s + (l.delta ?? 0), 0) / deltas.length
          : 0
        cells[r] = { delta: +avgD.toFixed(1), monthly }
      })
      return { partner: p.partner, cells }
    })
  }, [partners])

  function heatmapColor(delta: number | null): string {
    if (delta == null) return 'bg-gray-100 dark:bg-gray-800 text-gray-400'
    if (delta > 5) return 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
    if (delta >= 0) return 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
    return 'bg-[#FFAD00]/10 dark:bg-[#FFAD00]/20 text-[#FFAD00] dark:text-[#FFAD00]'
  }

  return (
    <div className="space-y-5">
      {/* Heatmap */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5 border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-[#444444] dark:text-white mb-3">
          Partner × region health heatmap (top 12 by monthly outlay)
        </h3>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 uppercase">Partner</th>
                <th className="px-3 py-2 text-center text-gray-500 dark:text-gray-400 uppercase">North</th>
                <th className="px-3 py-2 text-center text-gray-500 dark:text-gray-400 uppercase">South</th>
                <th className="px-3 py-2 text-center text-gray-500 dark:text-gray-400 uppercase">West</th>
              </tr>
            </thead>
            <tbody>
              {heatmap.map((row) => (
                <tr key={row.partner} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-1.5 font-medium text-[#444444] dark:text-white">{row.partner}</td>
                  {(['N', 'S', 'W'] as const).map((r) => {
                    const cell = row.cells[r]
                    return (
                      <td key={r} className="px-2 py-1.5 text-center">
                        <span className={`inline-block px-2 py-1 rounded ${heatmapColor(cell.delta)}`}>
                          {cell.delta == null ? '—' : fmtPct(cell.delta)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scorecard table */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden border border-gray-100 dark:border-gray-800">
        <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-[#444444] dark:text-white">Partner Scorecard</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 uppercase">Partner</th>
                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase"># Lines</th>
                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase"># Buses</th>
                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">Monthly L</th>
                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">Avg MinG</th>
                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">Avg Δ%</th>
                {priorActuals.size > 0 && (
                  <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">WoW Trend</th>
                )}
                <th className="px-3 py-2 text-center text-gray-500 dark:text-gray-400 uppercase">Health</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {partners.map((p) => (
                <Fragment key={p.partner}>
                  <tr
                    className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer ${deltaColorBg(p.avgDelta)}`}
                    onClick={() => setExpandedPartner(expandedPartner === p.partner ? null : p.partner)}
                  >
                    <td className="px-3 py-2 font-medium text-[#444444] dark:text-white">
                      <span className="mr-1 text-gray-400">{expandedPartner === p.partner ? '\u25BC' : '\u25B6'}</span>
                      {p.partner}
                    </td>
                    <td className="px-3 py-2 text-right dark:text-gray-200">{p.lineCount}</td>
                    <td className="px-3 py-2 text-right dark:text-gray-200">{p.totalBuses}</td>
                    <td className="px-3 py-2 text-right dark:text-gray-200">{fmtLakhs(p.totalMonthly)}</td>
                    <td className="px-3 py-2 text-right dark:text-gray-200">{fmtINR(p.avgMinG, 0)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${deltaColor(p.avgDelta)}`}>
                      {fmtPct(p.avgDelta)}
                    </td>
                    {priorActuals.size > 0 && (
                      <td className={`px-3 py-2 text-right font-medium ${
                        p.wowDelta == null ? 'text-gray-400'
                        : p.wowDelta >= 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'
                      }`}>
                        {p.wowDelta == null ? '—' : (p.wowDelta >= 0 ? '+' : '') + p.wowDelta.toFixed(1) + '%'}
                      </td>
                    )}
                    <td className="px-3 py-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        <div className="w-12 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${p.healthScore}%`,
                              backgroundColor: p.healthScore >= 60 ? '#73D700' : p.healthScore >= 40 ? '#FFAD00' : '#FFAD00',
                            }}
                          />
                        </div>
                        <span className="text-gray-500">{p.healthScore}</span>
                      </div>
                    </td>
                  </tr>
                  {expandedPartner === p.partner && (
                    <tr>
                      <td colSpan={priorActuals.size > 0 ? 8 : 7} className="px-6 py-4 bg-gray-50 dark:bg-gray-800/30">
                        {/* Deep-dive: line breakdown + delta bar mini-chart */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <div className="text-xs uppercase text-gray-500 mb-2">Line breakdown</div>
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-gray-400">
                                  <th className="text-left py-1">Code</th>
                                  <th className="text-left py-1">Route</th>
                                  <th className="text-right py-1">Buses</th>
                                  <th className="text-right py-1">MinG</th>
                                  <th className="text-right py-1">Δ%</th>
                                  <th className="text-right py-1">Monthly</th>
                                  {sheetData && <th className="text-right py-1">Util%</th>}
                                </tr>
                              </thead>
                              <tbody>
                                {p.lines.map((l) => {
                                  const actual = actualsMap.get(l.code)
                                  return (
                                    <tr key={l.code} className="border-t border-gray-100 dark:border-gray-800">
                                      <td className="py-1 font-mono dark:text-gray-200">{l.code}</td>
                                      <td className="py-1 max-w-[180px] truncate dark:text-gray-200">{l.route}</td>
                                      <td className="py-1 text-right dark:text-gray-200">{l.buses}</td>
                                      <td className="py-1 text-right dark:text-gray-200">{fmtINR(l.minG, 0)}</td>
                                      <td className={`py-1 text-right ${deltaColor(l.delta)}`}>
                                        {l.delta != null ? fmtPct(l.delta) : '--'}
                                      </td>
                                      <td className="py-1 text-right dark:text-gray-200">{fmtLakhs(l.monthly)}</td>
                                      {sheetData && (
                                        <td className="py-1 text-right dark:text-gray-200">
                                          {actual ? fmtPct(actual.kmUtilisation) : '--'}
                                        </td>
                                      )}
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                          <div>
                            <div className="text-xs uppercase text-gray-500 mb-2">Delta% by line</div>
                            <ResponsiveContainer width="100%" height={Math.max(160, p.lines.length * 22)}>
                              <BarChart data={p.lines.map((l) => ({ code: l.code, delta: l.delta ?? 0 }))} layout="vertical" margin={{ left: 50 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" tickFormatter={(v) => `${v}%`} />
                                <YAxis type="category" dataKey="code" width={50} tick={{ fontSize: 10 }} />
                                <Tooltip formatter={(v) => fmtPct(Number(v))} />
                                <Bar dataKey="delta" radius={[0, 4, 4, 0]}>
                                  {p.lines.map((l, i) => (
                                    <Cell key={i} fill={(l.delta ?? 0) >= 0 ? FLIX_GREEN : RED} />
                                  ))}
                                </Bar>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
