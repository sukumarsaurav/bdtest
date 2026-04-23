'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { LineActual, Line, HubRow } from '@/types'

// Raw shape returned by /api/sheet-data (Supabase columns are snake_case)
interface RawSnapshot {
  year_week: string
  period: string
  pushed_at: string
  source: string
  rows: HubRow[]
}
import { computeLineActuals } from '@/lib/metrics'
import { fmtINR, fmtLakhs, fmtCr, fmtPct, fmtNum, deltaColor } from '@/lib/formatters'
import {
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line as RLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, Legend,
} from 'recharts'

const FLIX_GREEN = '#73D700'
const NAVY = '#444444'
const RED = '#FFAD00'
const AMBER = '#FFAD00'

interface BdAction {
  id?: number
  line_id: string
  status: string
}

function classifyHealth(line: Line): 'healthy' | 'marginal' | 'overpaying' {
  // Use effectiveMinG vs pc5 with unified thresholds
  if (line.pc5 == null || line.pc5 === 0) return 'overpaying'
  const effMinG = line.gst === 18 ? line.minG * 1.13 : line.minG
  const delta = (effMinG - line.pc5) / line.pc5 * 100
  if (delta < 0) return 'healthy'
  if (delta <= 1) return 'marginal'
  return 'overpaying'
}

function KpiCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'pos' | 'neg' | 'neutral' }) {
  const toneClass = tone === 'pos' ? 'text-[#73D700]' : tone === 'neg' ? 'text-[#FFAD00]' : 'text-[#444444] dark:text-white'
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 border border-gray-100 dark:border-gray-800">
      <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
    </div>
  )
}

export default function Executive() {
  const allLines = useStore((s) => s.lines)
  const activeRegion = useStore((s) => s.activeRegion)
  const lines = useMemo(() => activeRegion === 'all' ? allLines : allLines.filter(l => l.region === activeRegion), [allLines, activeRegion])
  const sheetData = useStore((s) => s.sheetData)
  const availableWeeks = useStore((s) => s.availableWeeks)
  const [trend, setTrend] = useState<{ week: string; payableCr: number }[]>([])
  const [bdActions, setBdActions] = useState<BdAction[]>([])

  // Fetch trend (all available weeks)
  useEffect(() => {
    if (availableWeeks.length < 2) return
    const ctrl = new AbortController()
    Promise.all(
      availableWeeks.map((w) =>
        fetch(`/api/sheet-data?week=${w}`, { signal: ctrl.signal })
          .then((r) => (r.ok ? (r.json() as Promise<RawSnapshot>) : null))
          .catch(() => null)
      )
    ).then((snaps) => {
      const points = snaps
        .filter((s): s is RawSnapshot => s !== null && !!s.year_week && Array.isArray(s.rows))
        .map((s) => ({
          week: s.year_week,
          payableCr: s.rows.reduce((sum, r) => sum + (r.payableAmount ?? 0), 0) / 1e7,
        }))
        .sort((a, b) => {
          const [ay, aw] = a.week.split('_W').map(Number)
          const [by, bw] = b.week.split('_W').map(Number)
          return ay !== by ? ay - by : aw - bw
        })
      setTrend(points)
    })
    return () => ctrl.abort()
  }, [availableWeeks])

  // Fetch open BD actions
  useEffect(() => {
    fetch('/api/bd-actions')
      .then((r) => r.json())
      .then((data) => Array.isArray(data) ? setBdActions(data) : setBdActions([]))
      .catch(() => setBdActions([]))
  }, [])

  const lineActuals = useMemo<LineActual[]>(
    () => (sheetData ? computeLineActuals(sheetData.rows) : []),
    [sheetData]
  )

  // KPIs
  const totalMonthly = useMemo(() => lines.reduce((s, l) => s + l.monthly, 0), [lines])
  const avgMinG = useMemo(() => {
    if (lines.length === 0) return 0
    const totalKm = lines.reduce((s, l) => s + l.owKm * l.rt * 2 * l.buses, 0)
    if (totalKm === 0) return 0
    return lines.reduce((s, l) => s + l.minG * l.owKm * l.rt * 2 * l.buses, 0) / totalKm
  }, [lines])

  const healthCounts = useMemo(() => {
    const c = { healthy: 0, marginal: 0, overpaying: 0 }
    lines.forEach((l) => { c[classifyHealth(l)]++ })
    return c
  }, [lines])

  const fleetHealthPct = lines.length === 0 ? 0 : (healthCounts.healthy / lines.length) * 100

  const bdOpportunities = useMemo(() => {
    return lines
      .filter((l) => l.pc5 != null && l.pc5 > 0)
      .map((l) => {
        const pc5Val = l.pc5 as number
        const effMinG = l.gst === 18 ? l.minG * 1.13 : l.minG
        const delta = ((effMinG - pc5Val) / pc5Val) * 100
        const targetMinG = +(pc5Val * 1.02).toFixed(2)
        const monthlyKm = l.owKm * 2 * l.rt * l.buses
        const savPerKm = Math.max(0, effMinG - targetMinG)
        const monthlySavings = +(savPerKm * monthlyKm / 1e5).toFixed(2)
        return { line: l, targetMinG, monthlySavings, delta }
      })
      .filter((r) => r.delta > 0) // positive delta = overpaying = opportunity
      .sort((a, b) => b.delta - a.delta) // highest delta first
  }, [lines])

  const totalSavings = bdOpportunities.reduce((s, r) => s + r.monthlySavings, 0)
  const top5 = bdOpportunities.slice(0, 5)

  const openActions = bdActions.filter((a) => a.status === 'open' || a.status === 'in_progress').length

  // Region breakdown
  const regionData = useMemo(() => {
    const regions: ('N' | 'S' | 'W')[] = ['N', 'S', 'W']
    return regions.map((r) => {
      const rLines = lines.filter((l) => l.region === r)
      const monthly = rLines.reduce((s, l) => s + l.monthly, 0)
      const avgD = rLines.length === 0 ? 0 : rLines.reduce((s, l) => {
        if (!l.pc5 || l.pc5 === 0) return s
        const eff = l.gst === 18 ? l.minG * 1.13 : l.minG
        return s + ((eff - l.pc5) / l.pc5 * 100)
      }, 0) / rLines.filter(l => l.pc5 != null && l.pc5 > 0).length || 0
      const buses = rLines.reduce((s, l) => s + l.buses, 0)
      const utilLines = lineActuals.filter((a) => a.region === r)
      const utilTotal = utilLines.reduce((s, a) => s + a.busKm, 0)
      const utilContract = utilLines.reduce((s, a) => s + a.contractedWeeklyKm, 0)
      const util = utilContract > 0 ? (utilTotal / utilContract) * 100 : null
      return { region: r, lines: rLines.length, buses, monthly, avgDelta: avgD, util }
    })
  }, [lines, lineActuals])

  // 4-week projection from bl2 fleet forecast (not linear regression)
  const projection = useMemo(() => {
    if (!lines.length) return []
    const SEASON_FACTORS: Record<string, number> = { S: 0.71, L: 0.86, XL: 1.0 }
    const MONTH_SEASON: Record<number, string> = { 1:'XL', 2:'L', 3:'S', 4:'S', 5:'S', 6:'S', 7:'S', 8:'L', 9:'L', 10:'L', 11:'XL', 12:'XL' }
    const today = new Date()
    return [1, 2, 3, 4].map((k) => {
      const d = new Date(today)
      d.setDate(d.getDate() + k * 7)
      const monthNo = d.getMonth() + 1
      const season = MONTH_SEASON[monthNo] ?? 'L'
      const factor = SEASON_FACTORS[season] ?? 0.86
      const payoutL = lines.reduce((s, l) => s + l.monthly * factor, 0) / 4.33
      return { week: `+${k}w`, payableCr: +(payoutL / 100).toFixed(2), projected: true }
    })
  }, [lines])

  const trendWithProjection = useMemo(
    () => [
      ...trend.map((t) => ({ week: t.week, actual: t.payableCr, projected: null as number | null })),
      ...projection.map((p) => ({ week: p.week, actual: null as number | null, projected: p.payableCr })),
    ],
    [trend, projection]
  )

  const donutData = [
    { name: 'Healthy', value: healthCounts.healthy, color: FLIX_GREEN },
    { name: 'Marginal', value: healthCounts.marginal, color: AMBER },
    { name: 'Overpaying', value: healthCounts.overpaying, color: RED },
  ]

  return (
    <div className="space-y-6">
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard
          label="Monthly Outlay"
          value={fmtCr(totalMonthly)}
          sub={`${lines.length} lines`}
        />
        <KpiCard
          label="Avg MinG"
          value={fmtINR(avgMinG, 1) + '/km'}
          sub="fleet weighted"
        />
        <KpiCard
          label="Fleet Health"
          value={fleetHealthPct.toFixed(0) + '%'}
          sub={`${healthCounts.healthy} of ${lines.length} healthy`}
          tone={fleetHealthPct >= 60 ? 'pos' : fleetHealthPct >= 40 ? 'neutral' : 'neg'}
        />
        <KpiCard
          label="Partners"
          value={String(new Set(lines.map(l => l.partner)).size)}
          sub={`N: ${new Set(lines.filter(l => l.region === 'N').map(l => l.partner)).size} · S: ${new Set(lines.filter(l => l.region === 'S').map(l => l.partner)).size} · W: ${new Set(lines.filter(l => l.region === 'W').map(l => l.partner)).size}`}
        />
        <KpiCard
          label="BD Opportunity"
          value={fmtLakhs(totalSavings) + '/mo'}
          sub={`${bdOpportunities.length} lines · ${new Set(bdOpportunities.map(b => b.line.partner)).size} partners`}
          tone="neg"
        />
        <KpiCard
          label="Open Actions"
          value={String(openActions)}
          sub="from BD board"
          tone={openActions > 0 ? 'neutral' : 'pos'}
        />
      </div>

      {/* Health donut + region table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5 border border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-[#444444] dark:text-white mb-2">Fleet health distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={donutData}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
              >
                {donutData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${v} lines`} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5 border border-gray-100 dark:border-gray-800 lg:col-span-2 overflow-x-auto">
          <h3 className="text-sm font-semibold text-[#444444] dark:text-white mb-3">Region breakdown</h3>
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-3 py-2 text-left uppercase">Region</th>
                <th className="px-3 py-2 text-right uppercase">Lines</th>
                <th className="px-3 py-2 text-right uppercase">Buses</th>
                <th className="px-3 py-2 text-right uppercase">Monthly</th>
                <th className="px-3 py-2 text-right uppercase">Avg Δ%</th>
                <th className="px-3 py-2 text-right uppercase">Util%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {regionData.map((r) => (
                <tr key={r.region}>
                  <td className="px-3 py-2 font-medium text-[#444444] dark:text-white">{r.region}</td>
                  <td className="px-3 py-2 text-right">{r.lines}</td>
                  <td className="px-3 py-2 text-right">{r.buses}</td>
                  <td className="px-3 py-2 text-right">{fmtLakhs(r.monthly)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${deltaColor(r.avgDelta)}`}>{fmtPct(r.avgDelta)}</td>
                  <td className="px-3 py-2 text-right">{r.util != null ? fmtPct(r.util) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top 5 BD opportunities */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5 border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#444444] dark:text-white">Top 5 BD opportunities</h3>
          <span className="text-xs text-gray-400">Sorted by monthly savings</span>
        </div>
        {top5.length === 0 ? (
          <p className="text-sm text-gray-400 italic">All lines within margin — nothing to renegotiate.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-2 text-left uppercase">Code</th>
                  <th className="px-3 py-2 text-left uppercase">Route</th>
                  <th className="px-3 py-2 text-left uppercase">Partner</th>
                  <th className="px-3 py-2 text-right uppercase">Δ%</th>
                  <th className="px-3 py-2 text-right uppercase">Current MinG</th>
                  <th className="px-3 py-2 text-right uppercase">Target MinG</th>
                  <th className="px-3 py-2 text-right uppercase">Savings/mo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {top5.map((r) => (
                  <tr key={r.line.code}>
                    <td className="px-3 py-2 font-mono">{r.line.code}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{r.line.route}</td>
                    <td className="px-3 py-2">{r.line.partner}</td>
                    <td className={`px-3 py-2 text-right ${deltaColor(r.delta)}`}>{fmtPct(r.delta)}</td>
                    <td className="px-3 py-2 text-right">{fmtINR(r.line.minG, 1)}</td>
                    <td className="px-3 py-2 text-right text-[#73D700]">{fmtINR(r.targetMinG, 1)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-[#73D700]">{fmtLakhs(r.monthlySavings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Trend + projection */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5 border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#444444] dark:text-white">Weekly payout trend + 4-week projection</h3>
          <span className="text-xs text-gray-400">{trend.length} weeks history</span>
        </div>
        {trend.length < 4 ? (
          <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">
            Need 4+ weeks of data to project
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={trendWithProjection} margin={{ left: 10, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${v.toFixed(1)}Cr`} />
              <Tooltip formatter={(v) => v == null ? '—' : `${Number(v).toFixed(2)} Cr`} />
              <Legend wrapperStyle={{ fontSize: '11px' }} />
              <ReferenceLine x={trend[trend.length - 1]?.week} stroke="#9CA3AF" strokeDasharray="2 4" label={{ value: 'now', fontSize: 10, fill: '#9CA3AF' }} />
              <RLine type="monotone" dataKey="actual" name="Actual" stroke={FLIX_GREEN} strokeWidth={2} dot={{ fill: FLIX_GREEN, r: 3 }} connectNulls={false} />
              <RLine type="monotone" dataKey="projected" name="Projected" stroke={NAVY} strokeWidth={2} strokeDasharray="5 5" dot={{ fill: NAVY, r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
