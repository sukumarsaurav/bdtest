'use client'

import { useMemo } from 'react'
import type { HubRow } from '@/types'
import {
  actualWtdEffectiveMinG,
  grossPayoutLakhs,
  netPayableLakhs,
  totalGstLakhs,
  totalTdsLakhs,
  formatYearWeekRange,
} from '@/lib/cost-utils'

interface Props {
  thisWeekRows: HubRow[]
  mtdRows: HubRow[]
  ytdRows: HubRow[]
  yearWeek: string
  mtdWeekCount: number
  ytdWeekCount: number
  loading: boolean
}

function computeMetrics(rows: HubRow[]) {
  if (!rows.length) return null
  const totalKm = rows.reduce((s, r) => s + (r.busKm || 0), 0)
  return {
    kmL: totalKm / 1e5,
    grossPayoutL: grossPayoutLakhs(rows),
    netPayableL: netPayableLakhs(rows),
    gstL: totalGstLakhs(rows),
    tdsL: totalTdsLakhs(rows),
    realCostPKm: actualWtdEffectiveMinG(rows),
    linesCount: new Set(rows.map((r) => r.lineId)).size,
  }
}

const fmtL = (v: number) => `₹${v.toFixed(1)}L`
const fmtCr = (vL: number) => `₹${(vL / 100).toFixed(2)}Cr`
const fmtKmL = (v: number) => `${v.toFixed(2)}L km`

function MetricRow({
  label,
  subLabel,
  metrics,
  sparse,
  sparseMsg,
}: {
  label: string
  subLabel: string
  metrics: ReturnType<typeof computeMetrics>
  sparse?: boolean
  sparseMsg?: string
}) {
  if (!metrics) {
    return (
      <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-4">
        <p className="text-[10px] uppercase tracking-wider text-[#444444]/50 font-semibold mb-2">{label}</p>
        <p className="text-xs text-[#444444]/50 italic">No data synced</p>
      </div>
    )
  }

  return (
    <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-4">
      <p className="text-[10px] uppercase tracking-wider text-[#73D700] font-semibold mb-2">
        {label} <span className="text-[#444444]/50 font-normal">· {subLabel}</span>
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <div>
          <p className="text-xs text-[#444444]/60">km run</p>
          <p className="text-base font-semibold text-[#444444]">{fmtKmL(metrics.kmL)}</p>
        </div>
        <div>
          <p className="text-xs text-[#444444]/60">Gross payout</p>
          <p className="text-base font-semibold text-[#444444]">
            {metrics.grossPayoutL >= 100 ? fmtCr(metrics.grossPayoutL) : fmtL(metrics.grossPayoutL)}
          </p>
          <p className="text-[10px] text-[#444444]/50">MinG × km</p>
        </div>
        <div>
          <p className="text-xs text-[#444444]/60">Real cost/km</p>
          <p className="text-base font-semibold text-[#444444]">₹{metrics.realCostPKm.toFixed(2)}/km</p>
          <p className="text-[10px] text-[#444444]/50">ex-GST, km-weighted MinG</p>
        </div>
        <div>
          <p className="text-xs text-[#444444]/60">GST paid</p>
          <p className="text-base font-semibold text-[#444444]">{fmtL(metrics.gstL)}</p>
          <p className="text-[10px] text-[#444444]/50">tax, not in cost</p>
        </div>
      </div>

      <p className="text-[10px] text-[#444444]/50 mt-2">
        Net cash out: {metrics.netPayableL >= 100 ? fmtCr(metrics.netPayableL) : fmtL(metrics.netPayableL)} (after TDS ·{' '}
        {fmtL(Math.abs(metrics.tdsL))}) · {metrics.linesCount} lines
      </p>

      {sparse && sparseMsg && (
        <div className="mt-2 px-3 py-1.5 bg-[#FFAD00]/10 border border-[#FFAD00]/40 rounded text-[10px] text-[#444444]/70">
          {sparseMsg}
        </div>
      )}
    </div>
  )
}

export default function ThreeHorizonKPIs({
  thisWeekRows,
  mtdRows,
  ytdRows,
  yearWeek,
  mtdWeekCount,
  ytdWeekCount,
  loading,
}: Props) {
  const weekMetrics = useMemo(() => computeMetrics(thisWeekRows), [thisWeekRows])
  const mtdMetrics = useMemo(() => computeMetrics(mtdRows), [mtdRows])
  const ytdMetrics = useMemo(() => computeMetrics(ytdRows), [ytdRows])

  // Derive current month/year from thisWeekRows
  const sample = thisWeekRows[0]
  const monthName = sample
    ? new Date(2000, (sample.monthNo || 1) - 1).toLocaleString('en', { month: 'long' })
    : '—'
  const currentYear = sample?.year ?? new Date().getFullYear()

  return (
    <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-[#444444]/80">
          Three-horizon view
        </h2>
        {loading && (
          <span className="text-[10px] text-[#444444]/50 animate-pulse">
            Loading multi-week data...
          </span>
        )}
      </div>

      <div className="space-y-3">
        <MetricRow
          label="THIS WEEK"
          subLabel={`${yearWeek} · ${formatYearWeekRange(yearWeek)}`}
          metrics={weekMetrics}
        />

        <MetricRow
          label="MONTH-TO-DATE"
          subLabel={`${monthName} ${currentYear} · ${mtdWeekCount} week${mtdWeekCount !== 1 ? 's' : ''}`}
          metrics={mtdMetrics}
          sparse={mtdWeekCount < 2}
          sparseMsg={`Only ${mtdWeekCount} week(s) synced this month. Upload more weeks to complete MTD.`}
        />

        <MetricRow
          label="YEAR-TO-DATE"
          subLabel={`Jan 1 – ${formatYearWeekRange(yearWeek).split(' to ')[1] ?? ''} ${currentYear} · ${ytdWeekCount} weeks`}
          metrics={ytdMetrics}
          sparse={ytdWeekCount < 4}
          sparseMsg={`YTD based on ${ytdWeekCount} week(s). Upload remaining weeks from BP Cost Snapshot for complete picture.`}
        />
      </div>
    </div>
  )
}
