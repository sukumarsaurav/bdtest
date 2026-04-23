'use client'

import { useMemo, useState } from 'react'
import type { HubRow } from '@/types'
import {
  forecastFleetWeek,
  grossPayoutLakhs,
  MONTH_SEASON,
  SEASON_FACTORS,
  type Bl2Line,
  type FleetForecast,
} from '@/lib/cost-utils'

interface Props {
  rows: HubRow[]
  blLines: Bl2Line[]
  monthNo: number
}

const fmtL = (v: number) => `₹${v.toFixed(1)}L`
const fmtKm = (v: number) => v.toLocaleString('en-IN')

export default function LineForecast({ rows, blLines, monthNo }: Props) {
  const [showTable, setShowTable] = useState(false)
  const [sortBy, setSortBy] = useState<'variance' | 'forecastKm'>('variance')

  const forecast = useMemo<FleetForecast | null>(() => {
    if (!blLines.length) return null
    return forecastFleetWeek(blLines, monthNo)
  }, [blLines, monthNo])

  // Actual metrics
  const actualKm = useMemo(() => rows.reduce((s, r) => s + (r.busKm || 0), 0), [rows])
  const actualPayoutL = useMemo(() => grossPayoutLakhs(rows), [rows])
  const actualMinGPKm = useMemo(() => {
    if (actualKm === 0) return 0
    return rows.reduce((s, r) => s + (r.minG || 0) * (r.busKm || 0), 0) / actualKm
  }, [rows, actualKm])

  // Match forecast lines to actuals
  const matched = useMemo(() => {
    if (!forecast) return []
    const actualByLine = new Map<string, { km: number; payoutL: number; minG: number }>()
    for (const r of rows) {
      const existing = actualByLine.get(r.lineId)
      if (existing) {
        existing.km += r.busKm || 0
        existing.payoutL += (r.basicValue || 0) / 1e5
      } else {
        actualByLine.set(r.lineId, {
          km: r.busKm || 0,
          payoutL: (r.basicValue || 0) / 1e5,
          minG: r.minG,
        })
      }
    }

    return forecast.lineForecasts.map((lf) => {
      const actual = actualByLine.get(lf.lineId)
      const aKm = actual?.km ?? 0
      const aPayoutL = actual?.payoutL ?? 0
      const variancePct = lf.forecastKm > 0 ? ((aKm - lf.forecastKm) / lf.forecastKm) * 100 : 0
      const status: 'matched' | 'missing' = actual ? 'matched' : 'missing'
      return { ...lf, actualKm: aKm, actualPayoutL: aPayoutL, variancePct, status }
    })
  }, [forecast, rows])

  const sorted = useMemo(() => {
    const arr = [...matched]
    if (sortBy === 'variance') {
      arr.sort((a, b) => Math.abs(b.variancePct) - Math.abs(a.variancePct))
    } else {
      arr.sort((a, b) => b.forecastKm - a.forecastKm)
    }
    return arr
  }, [matched, sortBy])

  if (!forecast) return null

  const season = MONTH_SEASON[monthNo] ?? 'L'
  const factor = SEASON_FACTORS[season]
  const monthName = new Date(2000, monthNo - 1).toLocaleString('en', { month: 'long' })
  const kmDelta = actualKm - forecast.totalForecastKm
  const kmDeltaPct = forecast.totalForecastKm > 0 ? (kmDelta / forecast.totalForecastKm) * 100 : 0
  const payoutDeltaL = actualPayoutL - forecast.totalForecastPayoutL
  const matchedCount = matched.filter((m) => m.status === 'matched').length
  const missingCount = matched.filter((m) => m.status === 'missing').length

  return (
    <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-5">
      <h2 className="text-sm font-semibold text-[#444444]/80 mb-1">
        Weekly forecast vs actual · {monthName}
      </h2>
      <p className="text-xs text-[#444444]/50 mb-2">
        Season: {season} ({(factor * 100).toFixed(0)}% run-rate) · Forecast = contracted km × season factor
      </p>
      <p className="text-[10px] text-[#444444]/40 mb-4 leading-relaxed">
        Forecast KM = sum of all {blLines.length} lines: (OW km × monthly trips × 2 × buses ÷ 4.33) × season factor ({season}={(factor * 100).toFixed(0)}%)<br />
        Forecast Payout = contracted MinG × forecast KM per line, summed fleet-wide<br />
        Actual KM includes all trips that ran per the BP Cost Snapshot
      </p>

      {/* Fleet summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide text-[#444444]/60">Forecast km</p>
          <p className="text-base font-bold text-[#444444]">{fmtKm(forecast.totalForecastKm)}</p>
        </div>
        <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide text-[#444444]/60">Actual km</p>
          <p className="text-base font-bold text-[#444444]">{fmtKm(Math.round(actualKm))}</p>
          <p className={`text-[10px] font-semibold ${kmDelta >= 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
            {kmDelta >= 0 ? '+' : ''}{fmtKm(Math.round(kmDelta))} ({kmDeltaPct >= 0 ? '+' : ''}{kmDeltaPct.toFixed(0)}%)
          </p>
        </div>
        <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide text-[#444444]/60">Forecast payout</p>
          <p className="text-base font-bold text-[#444444]">{fmtL(forecast.totalForecastPayoutL)}</p>
        </div>
        <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
          <p className="text-[10px] uppercase tracking-wide text-[#444444]/60">Actual payout</p>
          <p className="text-base font-bold text-[#444444]">{fmtL(actualPayoutL)}</p>
          <p className={`text-[10px] font-semibold ${payoutDeltaL >= 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
            {payoutDeltaL >= 0 ? '+' : ''}{fmtL(payoutDeltaL)}
          </p>
        </div>
      </div>

      <p className="text-xs text-[#444444]/50 mb-3">
        {matchedCount} lines matched · {missingCount} lines did not run
      </p>

      {/* Toggle drilldown */}
      <button
        onClick={() => setShowTable(!showTable)}
        className="text-xs text-[#73D700] hover:text-[#73D700]/80 mb-3"
      >
        {showTable ? '▲ Hide' : '▼ View'} line-by-line forecast vs actual
      </button>

      {showTable && (
        <>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setSortBy('variance')}
              className={`px-2 py-1 rounded text-[10px] font-medium ${sortBy === 'variance' ? 'bg-[#73D700] text-[#444444]' : 'bg-gray-100 text-[#444444]'}`}
            >
              Sort by variance
            </button>
            <button
              onClick={() => setSortBy('forecastKm')}
              className={`px-2 py-1 rounded text-[10px] font-medium ${sortBy === 'forecastKm' ? 'bg-[#73D700] text-[#444444]' : 'bg-gray-100 text-[#444444]'}`}
            >
              Sort by forecast km
            </button>
          </div>

          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[#444444]/60 border-b border-[rgba(68,68,68,0.15)]">
                  <th className="pb-1 pr-2 text-left">Line</th>
                  <th className="pb-1 pr-2 text-left">Region</th>
                  <th className="pb-1 pr-2 text-right">Forecast km</th>
                  <th className="pb-1 pr-2 text-right">Actual km</th>
                  <th className="pb-1 pr-2 text-right">Δ km</th>
                  <th className="pb-1 pr-2 text-right">Forecast ₹L</th>
                  <th className="pb-1 pr-2 text-right">Actual ₹L</th>
                  <th className="pb-1 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((m) => (
                  <tr
                    key={m.lineId}
                    className={`border-b border-[rgba(68,68,68,0.15)]/40 ${m.status === 'missing' ? 'bg-amber-900/10' : ''}`}
                  >
                    <td className="py-1 pr-2 font-mono">{m.lineId}</td>
                    <td className="py-1 pr-2">{m.region}</td>
                    <td className="py-1 pr-2 text-right">{fmtKm(m.forecastKm)}</td>
                    <td className="py-1 pr-2 text-right">{m.status === 'matched' ? fmtKm(Math.round(m.actualKm)) : '—'}</td>
                    <td className={`py-1 pr-2 text-right font-semibold ${
                      m.status === 'missing' ? 'text-[#FFAD00]' : m.actualKm >= m.forecastKm ? 'text-[#73D700]' : 'text-[#FFAD00]'
                    }`}>
                      {m.status === 'matched'
                        ? `${m.actualKm - m.forecastKm >= 0 ? '+' : ''}${fmtKm(Math.round(m.actualKm - m.forecastKm))}`
                        : `−${fmtKm(m.forecastKm)}`}
                    </td>
                    <td className="py-1 pr-2 text-right">{m.forecastPayoutL.toFixed(2)}</td>
                    <td className="py-1 pr-2 text-right">{m.status === 'matched' ? m.actualPayoutL.toFixed(2) : '—'}</td>
                    <td className="py-1 text-center">
                      {m.status === 'missing' ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[#FFAD00]/15 text-[#444444] border border-[#FFAD00]">DID NOT RUN</span>
                      ) : m.variancePct > 20 ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-green-600/30 text-green-200">+{m.variancePct.toFixed(0)}%</span>
                      ) : m.variancePct < -20 ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[#FFAD00]/30 text-[#FFAD00]">{m.variancePct.toFixed(0)}%</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-gray-600/30 text-[#444444]/80">ON TARGET</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
