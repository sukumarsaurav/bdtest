'use client'

import React, { useMemo } from 'react'
import { ModelResult } from './types'
import { computeFleetBlended } from './evEngine'
import { computeFeasibility } from './advancedCompute'
import { fmtPerKm, INDIA_MING_TARGET } from '@/lib/formatters'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
  ReferenceLine,
} from 'recharts'

interface Props {
  results: ModelResult[]
  dieselResult: ModelResult | null
  showEur: boolean
  eurRate: number
  busesPerModel: Record<string, number>
  onBusesChange: (id: string, buses: number) => void
  fleetAvgMinG: number
  owKm?: number
}

export default function TCOTable({
  results,
  dieselResult,
  showEur,
  eurRate,
  busesPerModel,
  onBusesChange,
  fleetAvgMinG,
  owKm = 400,
}: Props) {
  if (!results.length) return null

  // Best EV = lowest weightedAvgPerKm among EVs
  const evResults = results.filter((r) => r.model.type === 'ev')
  const bestEvAvg = evResults.length
    ? Math.min(...evResults.map((r) => r.weightedAvgPerKm))
    : Infinity

  // Sort by weightedAvgPerKm ascending
  const sorted = [...results].sort((a, b) => a.weightedAvgPerKm - b.weightedAvgPerKm)

  const blended = useMemo(
    () => computeFleetBlended(results, busesPerModel),
    [results, busesPerModel]
  )

  // All-ICE blended reference
  const allIceBlended = useMemo(() => {
    if (!dieselResult) return 0
    return dieselResult.weightedAvgPerKm
  }, [dieselResult])

  // Scenario bar: 0, 25, 50, 75, 100% EV penetration
  const scenarioData = useMemo(() => {
    if (!dieselResult || evResults.length === 0) return []
    // Use the best EV as the "EV" in the mix
    const bestEv = evResults.reduce((best, r) =>
      r.weightedAvgPerKm < best.weightedAvgPerKm ? r : best
    )
    return [0, 25, 50, 75, 100].map((pct) => {
      const evShare = pct / 100
      const iceShare = 1 - evShare
      const blendedKm =
        evShare * bestEv.weightedAvgPerKm + iceShare * dieselResult.weightedAvgPerKm
      return {
        pct: `${pct}%`,
        label: pct === 0 ? '100% ICE' : pct === 100 ? '100% EV' : `${pct}% EV`,
        blended: blendedKm,
      }
    })
  }, [dieselResult, evResults])

  // Current user fleet mix % EV
  const currentEVPct = useMemo(() => {
    let evBuses = 0
    let totalBuses = 0
    results.forEach((r) => {
      const b = busesPerModel[r.model.id] ?? 0
      totalBuses += b
      if (r.model.type === 'ev') evBuses += b
    })
    return totalBuses > 0 ? (evBuses / totalBuses) * 100 : 0
  }, [results, busesPerModel])

  return (
    <div className="space-y-6">
      {/* TCO summary table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-bold text-[#444444]">TCO Summary</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Weighted ₹/km = total cost ₹ ÷ total KM · BEST = lowest weighted ₹/km · Fleet MinG
            target = {fmtPerKm(fleetAvgMinG, showEur, eurRate)}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Model</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Type</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Seats</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">
                  Weighted ₹/km
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-400">
                  Ex-spike ₹/km
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">
                  Cost/seat-km
                </th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">
                  Breakeven
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">
                  Min viable MinG
                </th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">
                  Chemistry
                </th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">
                  AMC ₹/km
                </th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">
                  AMC locked
                </th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">
                  Feasibility
                </th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">
                  Battery
                </th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">
                  Opt tenure
                </th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">
                  Fleet buses
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.map((r) => {
                const isEV = r.model.type === 'ev'
                const isBest = isEV && r.weightedAvgPerKm === bestEvAvg
                const isPreferred = r.model.tag === 'PREFERRED'
                const mingColor =
                  r.minViableMinG <= fleetAvgMinG ? 'text-[#73D700]' : 'text-[#FFAD00]'
                const rowBg = isEV
                  ? r.weightedAvgPerKm < (dieselResult?.weightedAvgPerKm ?? Infinity)
                    ? 'bg-green-50/50'
                    : 'bg-[#FFAD00]/10/30'
                  : 'bg-gray-50/50'
                const feas = isEV
                  ? computeFeasibility(r.model, { owKm, tripsPerMonth: 0, buses: 1, contractYears: 1, extensionYears: 0 })
                  : null
                const amcPerKm = r.model.amc ?? r.model.maintenancePerKm
                return (
                  <tr key={r.model.id} className={rowBg}>
                    <td className="px-3 py-2 font-medium text-[#444444]">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isEV ? 'bg-[#73D700]' : 'bg-gray-500'
                          }`}
                        />
                        <span>{r.model.name}</span>
                        {isPreferred && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-[#444444] text-white rounded font-bold">
                            PREFERRED
                          </span>
                        )}
                        {isBest && (
                          <span className="text-[9px] px-1.5 py-0.5 bg-[#73D700] text-white rounded font-bold">
                            BEST
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-gray-500 ml-3.5">
                        {r.model.manufacturer}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${
                          isEV ? 'bg-[#73D700]/15 text-[#73D700]' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {isEV ? 'EV' : 'DSL'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-gray-600">
                      {r.model.seats}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-[#444444]">
                      {fmtPerKm(r.weightedAvgPerKm, showEur, eurRate)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-400">
                      {fmtPerKm(r.weightedAvgExSpikesPerKm, showEur, eurRate)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#444444]">
                      {fmtPerKm(r.costPerSeatKm, showEur, eurRate)}
                    </td>
                    <td className="px-3 py-2 text-center text-[11px]">
                      {isEV ? (
                        r.breakevenYear ? (
                          <span className="text-[#73D700] font-semibold">Y{r.breakevenYear}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-semibold ${mingColor}`}
                      title={`Operator should quote Flix ≥ ${fmtPerKm(
                        r.minViableMinG,
                        showEur,
                        eurRate
                      )}`}
                    >
                      {fmtPerKm(r.minViableMinG, showEur, eurRate)}
                    </td>
                    {/* Chemistry */}
                    <td className="px-3 py-2 text-center">
                      {isEV && r.model.batteryChemistry ? (
                        <span
                          className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            r.model.batteryChemistry === 'LFP'
                              ? 'bg-[#73D700]/20 text-[#73D700]'
                              : 'bg-[#FFAD00]/10 text-[#FFAD00]'
                          }`}
                        >
                          {r.model.batteryChemistry}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {/* AMC ₹/km */}
                    <td className="px-3 py-2 text-right tabular-nums text-[#444444]">
                      {isEV ? (
                        <span className="inline-flex items-center gap-1">
                          {r.model.amcLocked && <span title="Locked">🔒</span>}
                          {fmtPerKm(amcPerKm, showEur, eurRate)}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {/* AMC locked */}
                    <td className="px-3 py-2 text-center text-[10px]">
                      {isEV ? (
                        r.model.amcLocked ? (
                          <span className="px-1.5 py-0.5 rounded bg-[#73D700]/20 text-[#73D700] font-bold">
                            YES{r.model.amcDurationYrs ? ` ${r.model.amcDurationYrs}y` : ''}
                          </span>
                        ) : !r.model.amcDurationYrs ? (
                          <span className="px-1.5 py-0.5 rounded bg-[#FFAD00]/10 text-[#FFAD00] font-bold">
                            NONE
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                            NO
                          </span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {/* Feasibility */}
                    <td className="px-3 py-2 text-center text-[9px]">
                      {feas ? (
                        <span
                          className={`px-1.5 py-0.5 rounded font-bold ${
                            feas.status === 'VIABLE'
                              ? 'bg-[#73D700]/20 text-[#73D700]'
                              : feas.status === 'VIABLE_FAST_CHARGE'
                              ? 'bg-[#73D700]/15 text-[#73D700]'
                              : feas.status === 'MARGINAL' || feas.status === 'INFRA_NEEDED'
                              ? 'bg-amber-100 text-amber-800'
                              : feas.status === 'NOT_VIABLE'
                              ? 'bg-[#FFAD00]/10 text-[#FFAD00]'
                              : 'bg-gray-200 text-gray-700'
                          }`}
                          title={feas.note}
                        >
                          {feas.status.replace('_', ' ')}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-[11px]">
                      {isEV ? (
                        r.batteryRiskFlag ? (
                          <span className="text-[#FFAD00]">🔴</span>
                        ) : (
                          <span className="text-[#73D700]">✅</span>
                        )
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-[11px] text-[#444444]">
                      {Math.floor(r.optimalTenureMonths / 12)}y
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="number"
                        min={0}
                        value={busesPerModel[r.model.id] ?? 0}
                        onChange={(e) =>
                          onBusesChange(r.model.id, parseInt(e.target.value) || 0)
                        }
                        className="w-14 text-center text-[11px] rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[#444444] focus:border-[#73D700] focus:outline-none"
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fleet Blended Analysis */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-[#444444] to-[#1a2e52] text-white">
          <h3 className="text-sm font-bold">Fleet Deployment Simulator</h3>
          <p className="text-[11px] text-white/60 mt-0.5">
            Blended ₹/km = KM-weighted average across deployed buses
          </p>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1 space-y-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold">
              Current mix
            </div>
            <div className="text-xs text-[#444444]">
              {blended.totalBuses} buses · {currentEVPct.toFixed(0)}% EV penetration
            </div>
            <div className="mt-3 p-3 rounded-lg bg-[#73D700]/10 border border-[#73D700]/30">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold">
                Blended ₹/km
              </div>
              <div className="text-2xl font-bold text-[#444444] tabular-nums">
                {blended.totalBuses > 0
                  ? fmtPerKm(blended.blendedPerKm, showEur, eurRate)
                  : '—'}
              </div>
              {allIceBlended > 0 && blended.totalBuses > 0 && (
                <div className="text-[10px] text-gray-500 mt-1">
                  vs all-ICE: {fmtPerKm(allIceBlended, showEur, eurRate)}
                  <span
                    className={`ml-1 font-semibold ${
                      blended.blendedPerKm < allIceBlended
                        ? 'text-[#73D700]'
                        : 'text-[#FFAD00]'
                    }`}
                  >
                    ({blended.blendedPerKm < allIceBlended ? '−' : '+'}
                    {fmtPerKm(
                      Math.abs(allIceBlended - blended.blendedPerKm),
                      showEur,
                      eurRate
                    )}
                    )
                  </span>
                </div>
              )}
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wide font-bold mb-2">
              Fleet penetration scenarios
            </div>
            {scenarioData.length === 0 ? (
              <div className="text-[11px] text-gray-400 italic py-4">
                Add at least one EV and one diesel model to see penetration scenarios.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={scenarioData}
                  margin={{ top: 20, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7280' }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6B7280' }}
                    tickFormatter={(v) =>
                      showEur ? `€${(v / eurRate).toFixed(1)}` : `₹${v.toFixed(0)}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #E5E7EB',
                      fontSize: 11,
                    }}
                    formatter={(v: any) => fmtPerKm(+v, showEur, eurRate)}
                  />
                  <ReferenceLine
                    y={fleetAvgMinG}
                    stroke="#FFAD00"
                    strokeDasharray="4 4"
                    label={{
                      value: `Fleet MinG ${fmtPerKm(fleetAvgMinG, showEur, eurRate)}`,
                      position: 'insideTopRight',
                      fill: '#FFAD00',
                      fontSize: 9,
                    }}
                  />
                  <Bar dataKey="blended" radius={[4, 4, 0, 0]}>
                    {scenarioData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={
                          Math.abs(
                            parseInt(d.pct) - Math.round(currentEVPct / 25) * 25
                          ) < 12.5
                            ? '#73D700'
                            : '#1e3a5f'
                        }
                      />
                    ))}
                    <LabelList
                      dataKey="blended"
                      position="top"
                      formatter={(v: any) =>
                        typeof v === 'number'
                          ? showEur
                            ? `€${(v / eurRate).toFixed(1)}`
                            : `₹${v.toFixed(1)}`
                          : ''
                      }
                      style={{ fontSize: 10, fill: '#374151' }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
