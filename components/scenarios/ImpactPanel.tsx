'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { Scenario, Change, Line } from '@/types'
import { fmtPct, fmtMoney, fmtPerKm, getAnnualSeasonFactor } from '@/lib/formatters'

function lineMonthlyKm(l: Line): number {
  return l.owKm * 2 * l.rt * l.buses
}

/** GST effective multiplier: 18% partners pay 1.13× MinG */
function gstMult(gst: number): number {
  return gst === 18 ? 1.13 : 1.0
}

/** Compute per-line delta map for a single change. Returns Record<lineCode, deltaInLakhs>. */
function computePerLineDelta(ch: Change, lines: Line[]): Record<string, number> {
  const result: Record<string, number> = {}

  switch (ch.type) {
    case 'fuel_change': {
      if (ch._fuelResult) {
        // Use pre-computed fuel results - map by lineName
        ch._fuelResult.lineImpacts.forEach((li) => {
          const line = lines.find((l) => l.route === li.lineName || l.code === li.lineName)
          if (line) result[line.code] = (result[line.code] || 0) + li.moImpact
        })
        return result
      }
      const TYPE_MILEAGE: Record<string, number> = { 'Sleeper': 3.2, 'Hybrid': 3.6, 'Seater': 4.0 }
      const fleetMileage = ch.currentMileage || 3.6
      const cur = ch.currentDieselPrice ?? 0
      const nxt = ch.newDieselPrice ?? 0
      if (cur === 0 || nxt === 0) return result
      const filtered = ch.fuelRegion && ch.fuelRegion !== 'all'
        ? lines.filter((l) => l.region === ch.fuelRegion) : lines
      filtered.forEach((l) => {
        const m = TYPE_MILEAGE[l.type] ?? fleetMileage
        const deltaCpk = (nxt - cur) / m
        result[l.code] = (deltaCpk * lineMonthlyKm(l)) / 100000
      })
      return result
    }

    case 'expansion':
      // New route, no existing line affected. Impact is additive to total but not per-baseline-line.
      return result

    case 'repurposing': {
      const from = lines.find((l) => l.code === ch.repFromLineId)
      if (!from) return result
      const b = ch.repBuses || 0
      result[from.code] = -(b * from.minG * from.owKm * 2 * from.rt / 100000)
      const to = ch.repToLineId ? lines.find((l) => l.code === ch.repToLineId) : null
      if (to) {
        const newMinG = ch.repNewMinG || to.minG
        result[to.code] = (result[to.code] || 0) + (b * newMinG * to.owKm * 2 * to.rt / 100000)
      }
      return result
    }

    case 'removal': {
      const line = lines.find((l) => l.code === ch.baselineLineId)
      if (!line) return result
      result[line.code] = -(line.monthly * ((ch.buses || 0) / line.buses))
      return result
    }

    case 'payout_revision': {
      let affected: Line[] = []
      const scope = ch.payoutScope || 'all'
      if (scope === 'all') affected = lines
      else if (scope === 'region' && ch.payoutRegion) affected = lines.filter((l) => l.region === ch.payoutRegion)
      else if (scope === 'partner' && ch.payoutBpId) affected = lines.filter((l) => l.partner === ch.payoutBpId)
      else if (scope === 'line' && ch.payoutSelectedLines) affected = lines.filter((l) => ch.payoutSelectedLines?.[l.code])

      const iMode = ch.payoutInputMode || 'pct'
      const toPerKmDelta = (raw: number, minG: number): number => {
        switch (iMode) {
          case 'delta': return raw
          case 'absolute': return raw - minG
          case 'pct': return minG * (raw / 100)
        }
      }

      affected.forEach((l) => {
        let rawVal = 0
        if (ch.payoutLineRevisions?.[l.code] !== undefined) {
          rawVal = ch.payoutLineRevisions[l.code]
        } else if (ch.payoutBpRevisions?.[l.partner] !== undefined) {
          rawVal = ch.payoutBpRevisions[l.partner]
        } else {
          const mode = ch.payoutMode || 'pct'
          if (mode === 'pct') rawVal = ch.payoutMingPct || 0
          else rawVal = ch.payoutDelta || 0
        }

        const d = toPerKmDelta(rawVal, l.minG)

        // Partial bus count: only affected buses' km changes
        const affectedBuses = ch.payoutLineBuses?.[l.code] ?? l.buses
        const km = l.owKm * 2 * l.rt * affectedBuses
        const gstSw = ch.payoutGstSwitch

        const hasRevisionKey = ch.payoutLineRevisions?.[l.code] !== undefined
          || ch.payoutBpRevisions?.[l.partner] !== undefined

        if (d === 0 && (!gstSw || !hasRevisionKey)) return

        if (gstSw === '18to5' && l.gst === 18 && hasRevisionKey) {
          const newMinG = l.minG + d
          const costBefore = l.minG * 1.13 * km / 100000
          const costAfter = newMinG * 1.0 * km / 100000
          result[l.code] = (result[l.code] || 0) + (costAfter - costBefore)
        } else if (gstSw === '5to18' && l.gst === 5 && hasRevisionKey) {
          const newMinG = l.minG + d
          const costBefore = l.minG * 1.0 * km / 100000
          const costAfter = newMinG * 1.13 * km / 100000
          result[l.code] = (result[l.code] || 0) + (costAfter - costBefore)
        } else if (d !== 0) {
          result[l.code] = (result[l.code] || 0) + (d * km) / 100000
        }
      })
      return result
    }

    case 'rest_stop': {
      const stops = ch.restStopsAdded || 0
      const cost = ch.restStopCost || 0
      const line = ch.baselineLineId ? lines.find((l) => l.code === ch.baselineLineId) : null
      if (line) {
        result[line.code] = (stops * cost * line.rt * line.buses) / 100000
      } else {
        lines.forEach((l) => {
          result[l.code] = (stops * cost * l.rt * l.buses) / 100000
        })
      }
      return result
    }

    case 'cargo_deduction': {
      const perTrip = ch.cargoPerTrip || 0
      const line = ch.baselineLineId ? lines.find((l) => l.code === ch.baselineLineId) : null
      if (line) {
        result[line.code] = -(perTrip * line.rt * line.buses * 2) / 100000
      } else {
        lines.forEach((l) => {
          result[l.code] = -(perTrip * l.rt * l.buses * 2) / 100000
        })
      }
      return result
    }

    case 'toll_change': {
      const tollPerOWTrip = ch.kmDelta || 0
      const line = ch.baselineLineId ? lines.find((l) => l.code === ch.baselineLineId) : null
      if (line) {
        const tollDeltaPerKm = line.owKm > 0 ? tollPerOWTrip / line.owKm : 0
        result[line.code] = (tollDeltaPerKm * lineMonthlyKm(line)) / 100000
      } else {
        lines.forEach((l) => {
          const tollDeltaPerKm = l.owKm > 0 ? tollPerOWTrip / l.owKm : 0
          result[l.code] = (tollDeltaPerKm * lineMonthlyKm(l)) / 100000
        })
      }
      return result
    }

    case 'contract_tenure': {
      (ch.fleetRevisions || []).forEach((rev) => {
        const line = lines.find((l) => l.code === rev.lineId)
        if (!line) return
        const delta = rev.newMinG - line.minG
        result[line.code] = (result[line.code] || 0) + (delta * lineMonthlyKm(line)) / 100000
      })
      return result
    }

    case 'custom': {
      const allKm = lines.reduce((s, l) => s + lineMonthlyKm(l), 0)
      if (ch.customMode === 'fixed') {
        // Distribute proportionally by monthly
        const total = lines.reduce((s, l) => s + l.monthly, 0)
        if (total === 0) return result
        const amount = (ch.customAmount || 0) / 100000
        lines.forEach((l) => { result[l.code] = amount * (l.monthly / total) })
      } else if (ch.customMode === 'per_km') {
        lines.forEach((l) => {
          result[l.code] = ((ch.customPerKm || 0) * lineMonthlyKm(l)) / 100000
        })
      } else if (ch.customMode === 'pct') {
        lines.forEach((l) => {
          result[l.code] = l.monthly * ((ch.customPct || 0) / 100)
        })
      }
      return result
    }

    default:
      return result
  }
}

/** Get total delta for a change (including expansion which is not per-line) */
function totalChangeDelta(ch: Change, lines: Line[]): number {
  const perLine = computePerLineDelta(ch, lines)
  let total = Object.values(perLine).reduce((s, v) => s + v, 0)
  // Add expansion impact (not per-existing-line)
  if (ch.type === 'expansion') {
    total += ((ch.expMinG || 0) * (ch.expOwKms || 0) * 2 * (ch.expRtPerMonth || 0) * (ch.expBuses || 0)) / 100000
  }
  return total
}

type Tab = 'all_india' | 'by_region' | 'by_partner' | 'by_line'

export default function ImpactPanel() {
  const scenarios = useStore((s) => s.scenarios)
  const lines = useStore((s) => s.lines)
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)
  const [activeTab, setActiveTab] = useState<Tab>('all_india')
  const [lineRegionFilter, setLineRegionFilter] = useState<'all' | 'N' | 'S' | 'W'>('all')
  const [linePartnerFilter, setLinePartnerFilter] = useState('')

  // Compute blended per-line deltas and per-scenario contributions
  const analysis = useMemo(() => {
    const baselineMonthly = lines.reduce((s, l) => s + l.monthly, 0)

    // Per-scenario deltas
    const perScenario = scenarios.map((sc) => {
      const perLineDelta: Record<string, number> = {}
      let expansionDelta = 0
      sc.changes.forEach((ch) => {
        const pld = computePerLineDelta(ch, lines)
        Object.entries(pld).forEach(([code, d]) => {
          perLineDelta[code] = (perLineDelta[code] || 0) + d
        })
        if (ch.type === 'expansion') {
          expansionDelta += ((ch.expMinG || 0) * (ch.expOwKms || 0) * 2 * (ch.expRtPerMonth || 0) * (ch.expBuses || 0)) / 100000
        }
      })
      const totalDelta = Object.values(perLineDelta).reduce((s, v) => s + v, 0) + expansionDelta
      return { scenario: sc, perLineDelta, expansionDelta, totalDelta }
    })

    // Blended per-line deltas
    const blendedPerLine: Record<string, number> = {}
    let totalExpansionDelta = 0
    perScenario.forEach((ps) => {
      Object.entries(ps.perLineDelta).forEach(([code, d]) => {
        blendedPerLine[code] = (blendedPerLine[code] || 0) + d
      })
      totalExpansionDelta += ps.expansionDelta
    })

    const blendedTotal = Object.values(blendedPerLine).reduce((s, v) => s + v, 0) + totalExpansionDelta
    const projectedMonthly = baselineMonthly + blendedTotal
    const deltaPct = baselineMonthly !== 0 ? (blendedTotal / baselineMonthly) * 100 : 0

    // Region aggregation
    const regions: Record<string, { baseline: number; delta: number }> = { N: { baseline: 0, delta: 0 }, S: { baseline: 0, delta: 0 }, W: { baseline: 0, delta: 0 } }
    lines.forEach((l) => {
      regions[l.region].baseline += l.monthly
      regions[l.region].delta += blendedPerLine[l.code] || 0
    })
    scenarios.forEach((sc) => {
      sc.changes.forEach((ch) => {
        if (ch.type !== 'expansion') return
        const expDelta = ((ch.expMinG || 0) * (ch.expOwKms || 0) * 2 * (ch.expRtPerMonth || 0) * (ch.expBuses || 0)) / 100000
        const expRegion = (ch.expRegion ?? 'N') as 'N' | 'S' | 'W'
        if (regions[expRegion]) regions[expRegion].delta += expDelta
      })
    })

    // Partner aggregation
    const partnerMap: Record<string, { baseline: number; delta: number; kmWeightedMinG: number; kmWeightedNewMinG: number; totalKm: number }> = {}
    lines.forEach((l) => {
      if (!partnerMap[l.partner]) partnerMap[l.partner] = { baseline: 0, delta: 0, kmWeightedMinG: 0, kmWeightedNewMinG: 0, totalKm: 0 }
      const lKm = lineMonthlyKm(l)
      const deltaPerKm = lKm > 0 ? ((blendedPerLine[l.code] || 0) * 100000) / lKm : 0
      partnerMap[l.partner].baseline += l.monthly
      partnerMap[l.partner].delta += blendedPerLine[l.code] || 0
      partnerMap[l.partner].kmWeightedMinG += l.minG * gstMult(l.gst) * lKm
      partnerMap[l.partner].kmWeightedNewMinG += (l.minG + deltaPerKm) * gstMult(l.gst) * lKm
      partnerMap[l.partner].totalKm += lKm
    })
    scenarios.forEach((sc) => {
      sc.changes.forEach((ch) => {
        if (ch.type !== 'expansion') return
        const expDelta = ((ch.expMinG || 0) * (ch.expOwKms || 0) * 2 * (ch.expRtPerMonth || 0) * (ch.expBuses || 0)) / 100000
        const expPartner = ch.expPartner ?? 'Unknown'
        if (!partnerMap[expPartner]) partnerMap[expPartner] = { baseline: 0, delta: 0, kmWeightedMinG: 0, kmWeightedNewMinG: 0, totalKm: 0 }
        partnerMap[expPartner].delta += expDelta
        const expKm = (ch.expOwKms || 0) * 2 * (ch.expRtPerMonth || 0) * (ch.expBuses || 0)
        partnerMap[expPartner].kmWeightedNewMinG += (ch.expMinG || 0) * gstMult(ch.expGstSlab ?? 5) * expKm
        partnerMap[expPartner].totalKm += expKm
      })
    })
    const partners = Object.entries(partnerMap)
      .map(([name, data]) => {
        const oldMinG = data.totalKm > 0 ? data.kmWeightedMinG / data.totalKm : 0
        const newMinG = data.totalKm > 0 ? data.kmWeightedNewMinG / data.totalKm : 0
        const deltaMinG = newMinG - oldMinG
        return { name, ...data, newTotal: data.baseline + data.delta, deltaPct: data.baseline !== 0 ? (data.delta / data.baseline) * 100 : 0, oldMinG, newMinG, deltaMinG }
      })
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

    // Per-line details
    const lineDetails = lines.map((l) => {
      const delta = blendedPerLine[l.code] || 0
      const newMonthly = l.monthly + delta
      const deltaPerKm = lineMonthlyKm(l) > 0 ? (delta * 100000) / lineMonthlyKm(l) : 0
      const gm = gstMult(l.gst)
      const newMinG = (l.minG + deltaPerKm) * gm
      return { line: l, delta, newMonthly, deltaPerKm, newMinG, baselineMinG: l.minG * gm }
    })

    // Fleet-wide blended MinG (km-weighted, with GST impact for display)
    const totalFleetKm = lines.reduce((s, l) => s + lineMonthlyKm(l), 0)
    const blendedMinGBaseline = totalFleetKm > 0
      ? lines.reduce((s, l) => s + l.minG * gstMult(l.gst) * lineMonthlyKm(l), 0) / totalFleetKm : 0
    const blendedMinGProjected = totalFleetKm > 0
      ? lines.reduce((s, l) => {
          const lKm = lineMonthlyKm(l)
          const deltaPerKm = lKm > 0 ? ((blendedPerLine[l.code] || 0) * 100000) / lKm : 0
          return s + (l.minG + deltaPerKm) * gstMult(l.gst) * lKm
        }, 0) / totalFleetKm : 0

    // Region-level blended MinG (with GST impact for display)
    const regionBlendedMinG: Record<string, { baseline: number; projected: number }> = { N: {baseline:0,projected:0}, S: {baseline:0,projected:0}, W: {baseline:0,projected:0} }
    const regionKm: Record<string, number> = { N: 0, S: 0, W: 0 }
    lines.forEach((l) => {
      const lKm = lineMonthlyKm(l)
      const gm = gstMult(l.gst)
      const deltaPerKm = lKm > 0 ? ((blendedPerLine[l.code] || 0) * 100000) / lKm : 0
      if (regionBlendedMinG[l.region]) {
        regionBlendedMinG[l.region].baseline += l.minG * gm * lKm
        regionBlendedMinG[l.region].projected += (l.minG + deltaPerKm) * gm * lKm
        regionKm[l.region] = (regionKm[l.region] || 0) + lKm
      }
    });
    (['N','S','W'] as const).forEach(r => {
      if (regionKm[r] > 0) {
        regionBlendedMinG[r].baseline /= regionKm[r]
        regionBlendedMinG[r].projected /= regionKm[r]
      }
    })

    return { baselineMonthly, blendedTotal, projectedMonthly, deltaPct, regions, partners, lineDetails, perScenario, totalExpansionDelta, blendedMinGBaseline, blendedMinGProjected, regionBlendedMinG }
  }, [scenarios, lines])

  const deltaColor = (d: number) => d > 0 ? 'text-[#FFAD00]' : d < 0 ? 'text-[#73D700]' : 'text-gray-500'
  const deltaBg = (d: number) => d > 0 ? 'bg-[#FFAD00]/10' : d < 0 ? 'bg-green-50' : 'bg-gray-50'
  const fmtDelta = (d: number) => `${d >= 0 ? '+' : ''}${fmtMoney(d, showEur, eurRate)}`

  const tabs: { key: Tab; label: string }[] = [
    { key: 'all_india', label: 'All India' },
    { key: 'by_region', label: 'By Region' },
    { key: 'by_partner', label: 'By Partner' },
    { key: 'by_line', label: 'By Line' },
  ]

  const allPartners = Array.from(new Set(lines.map((l) => l.partner))).sort()

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      {/* Tab bar */}
      <div className="bg-[#444444] flex">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-5 py-3 text-sm font-semibold transition-colors ${
              activeTab === t.key
                ? 'text-[#73D700] border-b-2 border-[#73D700]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5">
        {/* Per-scenario contribution summary */}
        {analysis.perScenario.length > 1 && (
          <div className="mb-4 space-y-1">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Per-Scenario Contributions</div>
            {analysis.perScenario.map((ps) => (
              <div key={ps.scenario.uid} className="flex justify-between text-xs">
                <span className="text-gray-600">{ps.scenario.name}</span>
                <span className={`font-semibold ${deltaColor(ps.totalDelta)}`}>{fmtDelta(ps.totalDelta)}/mo</span>
              </div>
            ))}
            <div className="flex justify-between text-xs border-t border-gray-200 pt-1 mt-1">
              <span className="text-gray-700 font-semibold">Blended Total</span>
              <span className={`font-bold ${deltaColor(analysis.blendedTotal)}`}>{fmtDelta(analysis.blendedTotal)}/mo</span>
            </div>
          </div>
        )}

        {/* Tab 1: All India */}
        {activeTab === 'all_india' && (
          <div>
            <div className={`rounded-lg p-4 ${deltaBg(analysis.blendedTotal)}`}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <div className="text-gray-400 text-xs">Baseline Monthly</div>
                  <div className="font-semibold text-[#444444]">{fmtMoney(analysis.baselineMonthly, showEur, eurRate)}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">Total {'\u0394'}</div>
                  <div className={`font-semibold ${deltaColor(analysis.blendedTotal)}`}>{fmtDelta(analysis.blendedTotal)}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">Projected Monthly</div>
                  <div className="font-semibold text-[#444444]">{fmtMoney(analysis.projectedMonthly, showEur, eurRate)}</div>
                </div>
                <div>
                  <div className="text-gray-400 text-xs">{'\u0394'} %</div>
                  <div className={`font-semibold ${deltaColor(analysis.blendedTotal)}`}>
                    {analysis.blendedTotal >= 0 ? '+' : ''}{fmtPct(analysis.deltaPct)}
                  </div>
                </div>
              </div>
            </div>
            {(() => {
              const now = new Date()
              const startYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
              const seasonFactor = getAnnualSeasonFactor(startYM, 12)
              const annualBaseline = analysis.baselineMonthly * 12 * seasonFactor
              const annualProjected = analysis.projectedMonthly * 12 * seasonFactor
              return (
                <div className="mt-3 grid grid-cols-2 gap-4 text-sm">
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-gray-400 text-xs">Annual Baseline</div>
                    <div className="font-semibold text-[#444444]">{fmtMoney(annualBaseline, showEur, eurRate)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Seasonality-adjusted ({Math.round(seasonFactor * 100)}% avg utilisation)
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <div className="text-gray-400 text-xs">Annual Projected</div>
                    <div className="font-semibold text-[#444444]">{fmtMoney(annualProjected, showEur, eurRate)}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      Seasonality-adjusted ({Math.round(seasonFactor * 100)}% avg utilisation)
                    </div>
                  </div>
                </div>
              )
            })()}
            <div className="mt-3 rounded-lg bg-[#444444]/5 px-4 py-3 flex items-center justify-between">
              <div className="text-xs text-gray-500">Blended MinG</div>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-[#444444]">{fmtPerKm(analysis.blendedMinGBaseline, showEur, eurRate)}</span>
                {analysis.blendedMinGProjected !== analysis.blendedMinGBaseline && (
                  <>
                    <span className="text-gray-300">{'\u2192'}</span>
                    <span className={`font-semibold ${analysis.blendedMinGProjected > analysis.blendedMinGBaseline ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                      {fmtPerKm(analysis.blendedMinGProjected, showEur, eurRate)}
                    </span>
                  </>
                )}
                <span className="text-xs text-gray-400 border-l border-gray-200 pl-3">
                  Target <span className="font-semibold text-[#444444]">{fmtPerKm(56.565, showEur, eurRate)}</span>
                </span>
              </div>
            </div>
            {analysis.totalExpansionDelta !== 0 && (
              <div className="mt-3 text-xs text-gray-500">
                Includes expansion additions: <span className={`font-semibold ${deltaColor(analysis.totalExpansionDelta)}`}>{fmtDelta(analysis.totalExpansionDelta)}/mo</span>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: By Region */}
        {activeTab === 'by_region' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(['N', 'S', 'W'] as const).map((r) => {
              const d = analysis.regions[r]
              const projected = d.baseline + d.delta
              const pct = d.baseline !== 0 ? (d.delta / d.baseline) * 100 : 0
              return (
                <div key={r} className={`rounded-lg p-4 ${deltaBg(d.delta)}`}>
                  <div className="text-sm font-semibold text-[#444444] mb-2">
                    {r === 'N' ? 'North' : r === 'S' ? 'South' : 'West'}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-xs">Baseline</span>
                      <span className="font-semibold text-[#444444]">{fmtMoney(d.baseline, showEur, eurRate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-xs">{'\u0394'}</span>
                      <span className={`font-semibold ${deltaColor(d.delta)}`}>{fmtDelta(d.delta)}</span>
                    </div>
                    <div className="flex justify-between border-t border-gray-200 pt-1">
                      <span className="text-gray-400 text-xs">Projected</span>
                      <span className="font-semibold text-[#444444]">{fmtMoney(projected, showEur, eurRate)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-xs">{'\u0394'} %</span>
                      <span className={`font-semibold text-xs ${deltaColor(d.delta)}`}>
                        {d.delta >= 0 ? '+' : ''}{fmtPct(pct)}
                      </span>
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-1 mt-1">
                      <span className="text-gray-400 text-xs">Blended MinG</span>
                      <span className="text-xs font-medium text-[#444444]">
                        {fmtPerKm(analysis.regionBlendedMinG[r]?.baseline ?? 0, showEur, eurRate)}
                        {(analysis.regionBlendedMinG[r]?.projected ?? 0) !== (analysis.regionBlendedMinG[r]?.baseline ?? 0) && (
                          <span className={`ml-1 ${(analysis.regionBlendedMinG[r]?.projected ?? 0) > (analysis.regionBlendedMinG[r]?.baseline ?? 0) ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                            {'\u2192'} {fmtPerKm(analysis.regionBlendedMinG[r]?.projected ?? 0, showEur, eurRate)}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Tab 3: By Partner */}
        {activeTab === 'by_partner' && (
          <div>
            <div className="mb-3 rounded-lg bg-[#444444]/5 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Fleet Blended MinG</span>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-[#444444]">{fmtPerKm(analysis.blendedMinGBaseline, showEur, eurRate)}</span>
                {analysis.blendedMinGProjected !== analysis.blendedMinGBaseline && (
                  <>
                    <span className="text-gray-300">{'\u2192'}</span>
                    <span className={`font-semibold ${analysis.blendedMinGProjected > analysis.blendedMinGBaseline ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                      {fmtPerKm(analysis.blendedMinGProjected, showEur, eurRate)}
                    </span>
                    <span className={`text-xs ${analysis.blendedMinGProjected > analysis.blendedMinGBaseline ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                      ({analysis.blendedMinGProjected >= analysis.blendedMinGBaseline ? '+' : ''}{(analysis.blendedMinGProjected - analysis.blendedMinGBaseline).toFixed(2)}/km)
                    </span>
                  </>
                )}
                <span className="text-xs text-gray-400 border-l border-gray-200 pl-3">Target <span className="font-semibold">{fmtPerKm(56.565, showEur, eurRate)}</span></span>
              </div>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-3 py-2">Partner</th>
                  <th className="text-right px-3 py-2">Baseline {'\u20B9'}L</th>
                  <th className="text-right px-3 py-2">Scenario {'\u0394'}</th>
                  <th className="text-right px-3 py-2">New Total</th>
                  <th className="text-right px-3 py-2">{'\u0394'}%</th>
                  <th className="text-right px-3 py-2">Old MinG</th>
                  <th className="text-right px-3 py-2">New MinG</th>
                  <th className="text-right px-3 py-2">{'\u0394'}{'\u20B9'}/km</th>
                </tr>
              </thead>
              <tbody>
                {analysis.partners.map((p) => (
                  <tr key={p.name} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-medium text-[#444444]">{p.name}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(p.baseline, showEur, eurRate)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${deltaColor(p.delta)}`}>
                      {fmtDelta(p.delta)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">{fmtMoney(p.newTotal, showEur, eurRate)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${deltaColor(p.delta)}`}>
                      {p.delta >= 0 ? '+' : ''}{fmtPct(p.deltaPct)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtPerKm(p.oldMinG, showEur, eurRate)}</td>
                    <td className={`px-3 py-2 text-right font-medium ${deltaColor(p.deltaMinG)}`}>{fmtPerKm(p.newMinG, showEur, eurRate)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${deltaColor(p.deltaMinG)}`}>
                      {p.deltaMinG !== 0 ? `${p.deltaMinG >= 0 ? '+' : ''}${fmtPerKm(p.deltaMinG, showEur, eurRate)}` : '--'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-semibold text-[#444444]">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(analysis.baselineMonthly, showEur, eurRate)}</td>
                  <td className={`px-3 py-2 text-right ${deltaColor(analysis.blendedTotal)}`}>{fmtDelta(analysis.blendedTotal)}</td>
                  <td className="px-3 py-2 text-right">{fmtMoney(analysis.projectedMonthly, showEur, eurRate)}</td>
                  <td className={`px-3 py-2 text-right ${deltaColor(analysis.blendedTotal)}`}>
                    {analysis.blendedTotal >= 0 ? '+' : ''}{fmtPct(analysis.deltaPct)}
                  </td>
                  <td className="px-3 py-2 text-right"></td>
                  <td className="px-3 py-2 text-right"></td>
                  <td className="px-3 py-2 text-right"></td>
                </tr>
              </tfoot>
            </table>
          </div>
          </div>
        )}

        {/* Tab 4: By Line */}
        {activeTab === 'by_line' && (
          <div>
            {/* Fleet MinG summary */}
            <div className="mb-3 rounded-lg bg-[#444444]/5 px-4 py-2.5 flex items-center justify-between">
              <span className="text-xs text-gray-500 font-medium">Fleet Blended MinG</span>
              <div className="flex items-center gap-3 text-sm">
                <span className="font-semibold text-[#444444]">{fmtPerKm(analysis.blendedMinGBaseline, showEur, eurRate)}</span>
                {analysis.blendedMinGProjected !== analysis.blendedMinGBaseline && (
                  <>
                    <span className="text-gray-300">{'\u2192'}</span>
                    <span className={`font-semibold ${analysis.blendedMinGProjected > analysis.blendedMinGBaseline ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                      {fmtPerKm(analysis.blendedMinGProjected, showEur, eurRate)}
                    </span>
                    <span className={`text-xs ${analysis.blendedMinGProjected > analysis.blendedMinGBaseline ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                      ({analysis.blendedMinGProjected >= analysis.blendedMinGBaseline ? '+' : ''}{(analysis.blendedMinGProjected - analysis.blendedMinGBaseline).toFixed(2)}/km)
                    </span>
                  </>
                )}
                <span className="text-xs text-gray-400 border-l border-gray-200 pl-3">Target <span className="font-semibold">{fmtPerKm(56.565, showEur, eurRate)}</span></span>
              </div>
            </div>
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-3">
              <select
                value={lineRegionFilter}
                onChange={(e) => setLineRegionFilter(e.target.value as typeof lineRegionFilter)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-[#73D700] outline-none"
              >
                <option value="all">All Regions</option>
                <option value="N">North</option>
                <option value="S">South</option>
                <option value="W">West</option>
              </select>
              <select
                value={linePartnerFilter}
                onChange={(e) => setLinePartnerFilter(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-[#73D700] outline-none min-w-[180px]"
              >
                <option value="">All Partners</option>
                {allPartners.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500">
                    <th className="text-left px-2 py-2">Code</th>
                    <th className="text-left px-2 py-2">Route</th>
                    <th className="text-left px-2 py-2">Partner</th>
                    <th className="text-right px-2 py-2">Old MinG</th>
                    <th className="text-right px-2 py-2">New MinG</th>
                    <th className="text-right px-2 py-2">{'\u0394'}{'\u20B9'}/km</th>
                    <th className="text-right px-2 py-2">Old Monthly</th>
                    <th className="text-right px-2 py-2">New Monthly</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.lineDetails
                    .filter((ld) => lineRegionFilter === 'all' || ld.line.region === lineRegionFilter)
                    .filter((ld) => !linePartnerFilter || ld.line.partner === linePartnerFilter)
                    .map((ld) => (
                      <tr key={ld.line.code} className={`border-b border-gray-100 ${ld.delta !== 0 ? deltaBg(ld.delta) : ''}`}>
                        <td className="px-2 py-1.5 font-mono text-[#444444]">{ld.line.code}</td>
                        <td className="px-2 py-1.5">{ld.line.route}</td>
                        <td className="px-2 py-1.5 text-gray-600">{ld.line.partner}</td>
                        <td className="px-2 py-1.5 text-right">{fmtPerKm(ld.line.minG, showEur, eurRate)}</td>
                        <td className={`px-2 py-1.5 text-right font-medium ${deltaColor(ld.deltaPerKm)}`}>
                          {fmtPerKm(ld.newMinG, showEur, eurRate)}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-semibold ${deltaColor(ld.deltaPerKm)}`}>
                          {ld.deltaPerKm !== 0 ? `${ld.deltaPerKm >= 0 ? '+' : ''}${fmtPerKm(ld.deltaPerKm, showEur, eurRate)}` : '--'}
                        </td>
                        <td className="px-2 py-1.5 text-right">{fmtMoney(ld.line.monthly, showEur, eurRate)}</td>
                        <td className={`px-2 py-1.5 text-right font-medium ${deltaColor(ld.delta)}`}>
                          {fmtMoney(ld.newMonthly, showEur, eurRate)}
                        </td>
                      </tr>
                    ))}
                  {/* Expansion rows */}
                  {scenarios.flatMap((sc) =>
                    sc.changes
                      .filter((ch) => ch.type === 'expansion')
                      .filter((ch) => lineRegionFilter === 'all' || (ch.expRegion ?? 'N') === lineRegionFilter)
                      .filter((ch) => !linePartnerFilter || (ch.expPartner ?? '') === linePartnerFilter)
                      .map((ch, i) => {
                        const expDelta = ((ch.expMinG || 0) * (ch.expOwKms || 0) * 2 * (ch.expRtPerMonth || 0) * (ch.expBuses || 0)) / 100000
                        return (
                          <tr key={`exp-${sc.uid}-${i}`} className="border-b border-gray-100 bg-[#444444]/5/50">
                            <td className="px-2 py-1.5 font-mono text-[#444444]">
                              <span className="inline-flex items-center gap-1">
                                <span className="text-[10px] bg-[#444444]/10 text-[#444444] px-1.5 py-0.5 rounded font-semibold">Expansion</span>
                              </span>
                            </td>
                            <td className="px-2 py-1.5">{ch.expRouteName || 'New Route'}</td>
                            <td className="px-2 py-1.5 text-gray-600">{ch.expPartner || '--'}</td>
                            <td className="px-2 py-1.5 text-right">--</td>
                            <td className="px-2 py-1.5 text-right font-medium">{fmtPerKm(ch.expMinG || 0, showEur, eurRate)}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-[#FFAD00]">new</td>
                            <td className="px-2 py-1.5 text-right">--</td>
                            <td className={`px-2 py-1.5 text-right font-medium ${deltaColor(expDelta)}`}>
                              {fmtMoney(expDelta, showEur, eurRate)}
                            </td>
                          </tr>
                        )
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
