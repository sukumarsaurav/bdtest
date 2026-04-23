'use client'

import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { Change, Line } from '@/types'
import ScenarioCard from './ScenarioCard'
import ImpactPanel from './ImpactPanel'
import { fmtMoney, fmtPerKm, INDIA_MING_TARGET, getAnnualSeasonFactor } from '@/lib/formatters'

const TYPE_MILEAGE: Record<string, number> = { 'Sleeper': 3.2, 'Hybrid': 3.6, 'Seater': 4.0 }

function lineMonthlyKm(l: Line): number {
  return l.owKm * 2 * l.rt * l.buses
}

function computeChangeImpactForStrip(ch: Change, lines: Line[]): number {
  const allMonthlyKm = lines.reduce((sum, l) => sum + lineMonthlyKm(l), 0)

  switch (ch.type) {
    case 'fuel_change': {
      if (ch._fuelResult) {
        return ch._fuelResult.lineImpacts.reduce((s, li) => s + li.moImpact, 0)
      }
      const mileage = ch.currentMileage || 3.6
      const filteredLines = ch.fuelRegion && ch.fuelRegion !== 'all'
        ? lines.filter((l) => l.region === ch.fuelRegion)
        : lines
      return filteredLines.reduce((s, l) => {
        const lineMileage = TYPE_MILEAGE[l.type] ?? mileage
        const deltaCpk = lineMileage > 0 && (ch.newDieselPrice || 0) > 0 && (ch.currentDieselPrice || 0) > 0
          ? ((ch.newDieselPrice ?? 0) - (ch.currentDieselPrice ?? 0)) / lineMileage
          : 0
        return s + (deltaCpk * lineMonthlyKm(l)) / 100000
      }, 0)
    }
    case 'expansion': {
      const buses = ch.expBuses || 0
      const owKm = ch.expOwKms || 0
      const rt = ch.expRtPerMonth || 0
      const minG = ch.expMinG || 0
      return (minG * owKm * 2 * rt * buses) / 100000
    }
    case 'repurposing': {
      const fromLine = lines.find((l) => l.code === ch.repFromLineId)
      if (!fromLine) return 0
      const busesToMove = ch.repBuses || 0
      const fromDelta = -(busesToMove * fromLine.minG * fromLine.owKm * 2 * fromLine.rt / 100000)
      const toLine = ch.repToLineId ? lines.find((l) => l.code === ch.repToLineId) : null
      const toOwKm = toLine ? toLine.owKm : (ch.repToOwKms || 0)
      const toRt = toLine ? toLine.rt : (ch.repToRtPerMonth || 0)
      const newMinG = ch.repNewMinG || (toLine ? toLine.minG : 0)
      const toDelta = +(busesToMove * newMinG * toOwKm * 2 * toRt / 100000)
      return fromDelta + toDelta
    }
    case 'removal': {
      const line = lines.find((l) => l.code === ch.baselineLineId)
      if (!line) return 0
      const busesRemoved = ch.buses || 0
      return -(line.monthly * (busesRemoved / line.buses))
    }
    case 'payout_revision': {
      let affected: Line[] = []
      const scope = ch.payoutScope || 'all'
      if (scope === 'all') affected = lines
      else if (scope === 'region' && ch.payoutRegion) affected = lines.filter((l) => l.region === ch.payoutRegion)
      else if (scope === 'partner' && ch.payoutBpId) affected = lines.filter((l) => l.partner === ch.payoutBpId)
      else if (scope === 'line' && ch.payoutSelectedLines) affected = lines.filter((l) => ch.payoutSelectedLines?.[l.code])
      else affected = lines
      return affected.reduce((s, l) => {
        let delta = 0
        if (ch.payoutLineRevisions?.[l.code] !== undefined) {
          delta = l.minG * (ch.payoutLineRevisions[l.code] / 100)
        } else if (ch.payoutBpRevisions?.[l.partner] !== undefined) {
          delta = l.minG * (ch.payoutBpRevisions[l.partner] / 100)
        } else {
          const mode = ch.payoutMode || 'pct'
          if (mode === 'pct') delta = l.minG * ((ch.payoutMingPct || 0) / 100)
          else delta = ch.payoutDelta || 0
        }
        return s + (delta * lineMonthlyKm(l)) / 100000
      }, 0)
    }
    case 'rest_stop': {
      const stops = ch.restStopsAdded || 0
      const cost = ch.restStopCost || 0
      const line = ch.baselineLineId ? lines.find((l) => l.code === ch.baselineLineId) : null
      if (line) return (stops * cost * line.rt * line.buses) / 100000
      return lines.reduce((s, l) => s + (stops * cost * l.rt * l.buses) / 100000, 0)
    }
    case 'cargo_deduction': {
      const perTrip = ch.cargoPerTrip || 0
      const line = ch.baselineLineId ? lines.find((l) => l.code === ch.baselineLineId) : null
      if (line) return -(perTrip * line.rt * line.buses * 2) / 100000
      const totalTrips = lines.reduce((s, l) => s + l.rt * l.buses * 2, 0)
      return -(perTrip * totalTrips) / 100000
    }
    case 'toll_change': {
      const tollPerOWTrip = ch.kmDelta || 0
      const line = ch.baselineLineId ? lines.find((l) => l.code === ch.baselineLineId) : null
      if (line) {
        const tollDeltaPerKm = line.owKm > 0 ? tollPerOWTrip / line.owKm : 0
        return (tollDeltaPerKm * lineMonthlyKm(line)) / 100000
      }
      return lines.reduce((s, l) => {
        const tollDeltaPerKm = l.owKm > 0 ? tollPerOWTrip / l.owKm : 0
        return s + (tollDeltaPerKm * lineMonthlyKm(l)) / 100000
      }, 0)
    }
    case 'contract_tenure': {
      if (!ch.fleetRevisions) return 0
      return ch.fleetRevisions.reduce((s, rev) => {
        const line = lines.find((l) => l.code === rev.lineId)
        if (!line) return s
        const delta = rev.newMinG - line.minG
        return s + (delta * lineMonthlyKm(line)) / 100000
      }, 0)
    }
    case 'custom': {
      if (ch.customMode === 'fixed') return (ch.customAmount || 0) / 100000
      if (ch.customMode === 'per_km') return ((ch.customPerKm || 0) * allMonthlyKm) / 100000
      if (ch.customMode === 'pct') {
        const totalMonthly = lines.reduce((s, l) => s + l.monthly, 0)
        return totalMonthly * ((ch.customPct || 0) / 100)
      }
      return 0
    }
    default:
      return 0
  }
}

export default function ScenarioList() {
  const scenarios = useStore((s) => s.scenarios)
  const addScenario = useStore((s) => s.addScenario)
  const lines = useStore((s) => s.lines)
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)

  const stats = useMemo(() => {
    const activeCount = scenarios.length
    const totalDelta = scenarios.reduce(
      (sum, sc) => sum + sc.changes.reduce((s, ch) => s + computeChangeImpactForStrip(ch, lines), 0),
      0
    )
    const baselineMonthly = lines.reduce((s, l) => s + l.monthly, 0)
    const projectedMonthly = baselineMonthly + totalDelta
    const now = new Date()
    const startYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const seasonFactor = getAnnualSeasonFactor(startYM, 12)
    const annualDelta = totalDelta * 12 * seasonFactor

    // Blended MinG computation
    const totalKm = lines.reduce((s, l) => s + lineMonthlyKm(l), 0)
    const blendedMinGBefore = totalKm > 0
      ? lines.reduce((s, l) => s + l.minG * lineMonthlyKm(l), 0) / totalKm
      : 0

    // Compute per-line minG deltas from all scenario changes
    const perLineMinGDelta: Record<string, number> = {}
    scenarios.forEach((sc) => {
      sc.changes.forEach((ch) => {
        if (ch.type === 'payout_revision') {
          let affected: Line[] = []
          const scope = ch.payoutScope || 'all'
          if (scope === 'all') affected = lines
          else if (scope === 'region' && ch.payoutRegion) affected = lines.filter((l) => l.region === ch.payoutRegion)
          else if (scope === 'partner' && ch.payoutBpId) affected = lines.filter((l) => l.partner === ch.payoutBpId)
          else if (scope === 'line' && ch.payoutSelectedLines) affected = lines.filter((l) => ch.payoutSelectedLines?.[l.code])
          affected.forEach((l) => {
            let delta = 0
            if (ch.payoutLineRevisions?.[l.code] !== undefined) {
              delta = l.minG * (ch.payoutLineRevisions[l.code] / 100)
            } else if (ch.payoutBpRevisions?.[l.partner] !== undefined) {
              delta = l.minG * (ch.payoutBpRevisions[l.partner] / 100)
            } else {
              const mode = ch.payoutMode || 'pct'
              if (mode === 'pct') delta = l.minG * ((ch.payoutMingPct || 0) / 100)
              else delta = ch.payoutDelta || 0
            }
            perLineMinGDelta[l.code] = (perLineMinGDelta[l.code] || 0) + delta
          })
        } else if (ch.type === 'fuel_change') {
          const mileageFallback = ch.currentMileage || 3.6
          const filtered = ch.fuelRegion && ch.fuelRegion !== 'all'
            ? lines.filter((l) => l.region === ch.fuelRegion)
            : lines
          filtered.forEach((l) => {
            const lineMileage = TYPE_MILEAGE[l.type] ?? mileageFallback
            const deltaCpk = lineMileage > 0 && (ch.newDieselPrice || 0) > 0 && (ch.currentDieselPrice || 0) > 0
              ? ((ch.newDieselPrice ?? 0) - (ch.currentDieselPrice ?? 0)) / lineMileage
              : 0
            if (deltaCpk !== 0) {
              perLineMinGDelta[l.code] = (perLineMinGDelta[l.code] || 0) + deltaCpk
            }
          })
        }
      })
    })

    const blendedMinGAfter = totalKm > 0
      ? lines.reduce((s, l) => s + (l.minG + (perLineMinGDelta[l.code] || 0)) * lineMonthlyKm(l), 0) / totalKm
      : 0

    return { activeCount, totalDelta, projectedMonthly, annualDelta, blendedMinGBefore, blendedMinGAfter, seasonFactor }
  }, [scenarios, lines])

  return (
    <div className="space-y-6">
      {/* Scenario strip */}
      <div className="rounded-xl bg-[#444444] px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-white">
        <div>
          <span className="text-gray-400">Active scenarios: </span>
          <span className="font-semibold">{stats.activeCount}</span>
        </div>
        <div>
          <span className="text-gray-400">Total {'\u0394'}: </span>
          <span className={`font-semibold ${stats.totalDelta > 0 ? 'text-[#FFAD00]' : stats.totalDelta < 0 ? 'text-[#73D700]' : 'text-gray-300'}`}>
            {stats.totalDelta >= 0 ? '+' : ''}{fmtMoney(stats.totalDelta, showEur, eurRate)}/mo
          </span>
        </div>
        <div>
          <span className="text-gray-400">Annual (seasonality-adjusted): </span>
          <span className={`font-semibold ${stats.annualDelta > 0 ? 'text-[#FFAD00]' : stats.annualDelta < 0 ? 'text-[#73D700]' : 'text-gray-300'}`}>
            {stats.annualDelta >= 0 ? '+' : ''}{fmtMoney(stats.annualDelta, showEur, eurRate)} p.a.
          </span>
          <div className="text-[10px] text-gray-500">{Math.round(stats.seasonFactor * 100)}% avg run-rate</div>
        </div>
        <div>
          <span className="text-gray-400">Projected fleet: </span>
          <span className="font-semibold">{fmtMoney(stats.projectedMonthly, showEur, eurRate)}/mo</span>
        </div>
        <div>
          <span className="text-gray-400">Blended MinG: </span>
          <span className="font-semibold">
            {fmtPerKm(stats.blendedMinGBefore, showEur, eurRate)} {'\u2192'} {fmtPerKm(stats.blendedMinGAfter, showEur, eurRate)}
          </span>
          <div className="text-xs text-gray-400">
            Target: <span className="font-semibold text-white">{fmtPerKm(INDIA_MING_TARGET, showEur, eurRate)}</span>
            {stats.blendedMinGAfter <= INDIA_MING_TARGET
              ? <span className="text-[#73D700] ml-1">{'\u2713'} on track</span>
              : <span className="text-[#FFAD00] ml-1">{'\u2191'} above target</span>
            }
          </div>
        </div>
      </div>

      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[#444444]">Scenarios</h2>
        <button
          onClick={addScenario}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#73D700] hover:bg-[#65c200] transition-colors"
        >
          + Add Scenario
        </button>
      </div>

      {scenarios.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
          <div className="text-gray-400 text-4xl mb-3">&#128202;</div>
          <p className="text-gray-500 text-sm">
            Create a scenario to model fleet changes
          </p>
          <button
            onClick={addScenario}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#73D700] hover:bg-[#65c200] transition-colors"
          >
            + New Scenario
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-6">
            {scenarios.map((sc) => (
              <ScenarioCard key={sc.uid} scenario={sc} />
            ))}
          </div>

          {/* ImpactPanel at bottom - always visible */}
          <ImpactPanel />
        </>
      )}
    </div>
  )
}
