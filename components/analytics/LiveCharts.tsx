'use client'

import { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { LineActual, HubRow } from '@/types'

// Raw shape returned by /api/sheet-data (Supabase columns are snake_case)
interface RawSnapshot {
  year_week: string
  period: string
  pushed_at: string
  source: string
  rows: HubRow[]
}
import { computeLineActuals, computePayoutWaterfall } from '@/lib/metrics'
import { fmtINR, fmtPct, fmtNum } from '@/lib/formatters'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import CostActualsPanel from './CostActualsPanel'

const FLIX_GREEN = '#73D700'
const NAVY = '#444444'
const RED = '#FFAD00'
const AMBER = '#FFAD00'

function ChartCard({ title, annotation, children }: {
  title: string
  annotation: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <h3 className="text-sm font-semibold text-[#444444] mb-3">{title}</h3>
      {children}
      <p className="text-xs text-gray-400 mt-3 italic">{annotation}</p>
    </div>
  )
}

function utilisationColor(val: number) {
  if (val < 60) return RED
  if (val < 80) return AMBER
  return FLIX_GREEN
}

export default function LiveCharts() {
  const sheetData = useStore((s) => s.sheetData)
  const availableWeeks = useStore((s) => s.availableWeeks)
  const [trendData, setTrendData] = useState<{ week: string; totalCr: number }[]>([])

  // Fetch trend data for Chart D
  useEffect(() => {
    if (availableWeeks.length < 2) return
    const controller = new AbortController()

    Promise.all(
      availableWeeks.slice(0, 12).map((w) =>
        fetch(`/api/sheet-data?week=${w}`, { signal: controller.signal })
          .then((r) => r.ok ? r.json() as Promise<RawSnapshot> : null)
          .catch(() => null)
      )
    ).then((snapshots) => {
      const points = snapshots
        .filter((s): s is RawSnapshot => s !== null && !!s.year_week && Array.isArray(s.rows))
        .map((s) => ({
          week: s.year_week,
          totalCr: s.rows.reduce((sum, r) => sum + (r.payableAmount ?? 0), 0) / 10000000,
        }))
        .sort((a, b) => a.week.localeCompare(b.week))
      setTrendData(points)
    })

    return () => controller.abort()
  }, [availableWeeks])

  const lineActuals = useMemo(
    () => (sheetData ? computeLineActuals(sheetData.rows) : []),
    [sheetData]
  )

  const waterfall = useMemo(
    () => (sheetData ? computePayoutWaterfall(sheetData.rows) : null),
    [sheetData]
  )

  if (!sheetData) {
    return (
      <div className="space-y-5">
        <CostActualsPanel />
        <div className="rounded-xl border-2 border-[#73D700] bg-green-50/30 p-8 text-center">
          <p className="text-[#444444] font-medium">
            Connect SharePoint data to unlock live analytics
          </p>
          <p className="text-gray-500 text-sm mt-1">
            Push your weekly hub sheet to see KM utilisation, payout waterfalls, and trends.
          </p>
        </div>
      </div>
    )
  }

  // Chart A data — filter out lines with 0 utilisation (not in baseline)
  const kmData = [...lineActuals]
    .filter((l) => l.kmUtilisation > 0 && l.contractedWeeklyKm > 0)
    .sort((a, b) => a.kmUtilisation - b.kmUtilisation)
    .slice(0, 20)

  // Chart B data
  const mingVarianceData = lineActuals
    .filter((l) => l.minGVariance !== 0)
    .sort((a, b) => a.minGVariance - b.minGVariance)

  // Chart C data
  const waterfallData = waterfall
    ? [
        { name: 'Basic Value', value: waterfall.basicValue, cumStart: 0, cumEnd: waterfall.basicValue, type: 'total' },
        { name: '+GST', value: waterfall.gstAmount, cumStart: waterfall.basicValue, cumEnd: waterfall.basicValue + waterfall.gstAmount, type: 'add' },
        { name: '-TDS', value: -waterfall.tdsAmount, cumStart: waterfall.basicValue + waterfall.gstAmount, cumEnd: waterfall.basicValue + waterfall.gstAmount - waterfall.tdsAmount, type: 'deduct' },
        { name: 'Held GST', value: -waterfall.heldGst, cumStart: waterfall.basicValue + waterfall.gstAmount - waterfall.tdsAmount, cumEnd: waterfall.basicValue + waterfall.gstAmount - waterfall.tdsAmount - waterfall.heldGst, type: 'deduct' },
        { name: 'Other Adj', value: waterfall.otherAdj, cumStart: waterfall.basicValue + waterfall.gstAmount - waterfall.tdsAmount - waterfall.heldGst, cumEnd: waterfall.basicValue + waterfall.gstAmount - waterfall.tdsAmount - waterfall.heldGst + waterfall.otherAdj, type: 'adj' },
        { name: 'Net Payable', value: waterfall.payableAmount, cumStart: 0, cumEnd: waterfall.payableAmount, type: 'payable' },
      ]
    : []

  // Chart E data
  const regionAdjData = (['N', 'S', 'W'] as const).map((region) => {
    const regionLines = lineActuals.filter((l) => l.region === region)
    return {
      region,
      bonus: regionLines.reduce((s, l) => s + l.bonus, 0),
      penalty: regionLines.reduce((s, l) => s + l.penalty, 0),
      cancellation: regionLines.reduce((s, l) => s + l.cancellation, 0),
    }
  })

  return (
    <div className="space-y-5">
      <CostActualsPanel />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Chart A - KM Utilisation */}
      <ChartCard
        title="KM Utilisation by Line"
        annotation="Lines below 80% — paying contracted MinG for unused capacity"
      >
        <ResponsiveContainer width="100%" height={Math.max(300, kmData.length * 28)}>
          <BarChart data={kmData} layout="vertical" margin={{ left: 80, right: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" domain={[0, 150]} tickFormatter={(v) => `${v}%`} />
            <YAxis type="category" dataKey="lineId" width={75} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmtPct(Number(v))} />
            <ReferenceLine x={80} stroke={RED} strokeDasharray="4 4" label={{ value: '80%', fill: RED, fontSize: 11 }} />
            <Bar dataKey="kmUtilisation" radius={[0, 4, 4, 0]}>
              {kmData.map((entry, i) => (
                <Cell key={i} fill={utilisationColor(entry.kmUtilisation)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart B - MinG Variance */}
      <ChartCard
        title="MinG Variance (Contract vs Sheet)"
        annotation="MinG mismatch — contract may have changed since baseline"
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={mingVarianceData} margin={{ left: 10, right: 10, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="lineId" angle={-45} textAnchor="end" tick={{ fontSize: 10 }} height={60} />
            <YAxis tickFormatter={(v) => fmtINR(v, 0)} />
            <Tooltip formatter={(v) => fmtINR(Number(v), 2)} />
            <Bar dataKey="minGVariance" radius={[4, 4, 0, 0]}>
              {mingVarianceData.map((entry, i) => (
                <Cell key={i} fill={entry.minGVariance >= 0 ? FLIX_GREEN : RED} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart C - Invoice to Payable Waterfall */}
      <ChartCard
        title="Invoice to Payable Waterfall"
        annotation="Breakdown from basic value to net payable after deductions"
      >
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={waterfallData} margin={{ left: 20, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
            <Tooltip formatter={(v) => fmtINR(Number(v), 0)} />
            {/* Invisible base bar for waterfall stacking */}
            <Bar dataKey="cumStart" stackId="waterfall" fill="transparent" />
            <Bar dataKey="value" stackId="waterfall" radius={[4, 4, 0, 0]}>
              {waterfallData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={
                    entry.type === 'total' ? NAVY
                    : entry.type === 'payable' ? FLIX_GREEN
                    : entry.type === 'deduct' ? RED
                    : AMBER
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Chart D - Weekly Payout Trend */}
      <ChartCard
        title="Weekly Payout Trend"
        annotation="Total payable per week across all lines"
      >
        {trendData.length < 4 ? (
          <div className="flex items-center justify-center h-[300px] text-gray-400 text-sm">
            Need 4+ weeks of data to show trend
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => `${v.toFixed(1)}Cr`} />
              <Tooltip formatter={(v) => `${Number(v).toFixed(2)} Cr`} />
              <Legend />
              <Line
                type="monotone"
                dataKey="totalCr"
                name="Total Payable"
                stroke={FLIX_GREEN}
                strokeWidth={2}
                dot={{ fill: FLIX_GREEN, r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Chart E - Bonus / Penalty / Cancellation by Region */}
      <ChartCard
        title="Bonus / Penalty / Cancellation by Region"
        annotation="Net adjustments this week"
      >
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={regionAdjData} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="region" />
            <YAxis tickFormatter={(v) => `${(v / 100000).toFixed(0)}L`} />
            <Tooltip formatter={(v) => fmtINR(Number(v), 0)} />
            <Legend />
            <Bar dataKey="bonus" name="Bonus" stackId="adj" fill={FLIX_GREEN} radius={[0, 0, 0, 0]} />
            <Bar dataKey="penalty" name="Penalty" stackId="adj" fill={RED} />
            <Bar dataKey="cancellation" name="Cancellation" stackId="adj" fill={AMBER} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      </div>
    </div>
  )
}
