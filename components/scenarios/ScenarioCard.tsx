'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { Scenario, ChangeType, Change, Line } from '@/types'
import { fmtMoney, fmtPerKm } from '@/lib/formatters'
import FuelChange from './change-types/FuelChange'
import Expansion from './change-types/Expansion'
import Repurposing from './change-types/Repurposing'
import Removal from './change-types/Removal'
import PayoutRevision from './change-types/PayoutRevision'
import ContractTenure from './change-types/ContractTenure'
import TollChange from './change-types/TollChange'
import RestStop from './change-types/RestStop'
import CargoDeduction from './change-types/CargoDeduction'
import Custom from './change-types/Custom'

const CHANGE_LABELS: Record<ChangeType, string> = {
  fuel_change: 'Fuel Price Change',
  expansion: 'Expansion (New Route)',
  repurposing: 'Repurposing',
  removal: 'Removal',
  rest_stop: 'Rest Stop',
  cargo_deduction: 'Cargo Deduction',
  toll_change: 'Toll Change',
  payout_revision: 'Payout Revision',
  contract_tenure: 'Contract Tenure',
  custom: 'Custom',
}

const CHANGE_TYPES: ChangeType[] = [
  'fuel_change', 'expansion', 'repurposing', 'removal',
  'rest_stop', 'cargo_deduction', 'toll_change',
  'payout_revision', 'contract_tenure', 'custom',
]

function lineMonthlyKm(l: Line): number {
  return l.owKm * 2 * l.rt * l.buses
}

function computeChangeDelta(ch: Change, lines: Line[]): number {
  const allMonthlyKm = lines.reduce((sum, l) => sum + lineMonthlyKm(l), 0)

  switch (ch.type) {
    case 'fuel_change': {
      if (ch._fuelResult) return ch._fuelResult.lineImpacts.reduce((s, li) => s + li.moImpact, 0)
      const mileage = ch.currentMileage || 3.6
      const deltaCpk = (ch.newDieselPrice || 0) > 0 && (ch.currentDieselPrice || 0) > 0
        ? ((ch.newDieselPrice ?? 0) - (ch.currentDieselPrice ?? 0)) / mileage : 0
      const fl = ch.fuelRegion && ch.fuelRegion !== 'all' ? lines.filter((l) => l.region === ch.fuelRegion) : lines
      return (deltaCpk * fl.reduce((s, l) => s + lineMonthlyKm(l), 0)) / 100000
    }
    case 'expansion':
      return ((ch.expMinG || 0) * (ch.expOwKms || 0) * 2 * (ch.expRtPerMonth || 0) * (ch.expBuses || 0)) / 100000
    case 'repurposing': {
      const from = lines.find((l) => l.code === ch.repFromLineId)
      if (!from) return 0
      const b = ch.repBuses || 0
      const fd = -(b * from.minG * from.owKm * 2 * from.rt / 100000)
      const to = ch.repToLineId ? lines.find((l) => l.code === ch.repToLineId) : null
      const td = +(b * (ch.repNewMinG || 0) * (to ? to.owKm : (ch.repToOwKms || 0)) * 2 * (to ? to.rt : (ch.repToRtPerMonth || 0)) / 100000)
      return fd + td
    }
    case 'removal': {
      const line = lines.find((l) => l.code === ch.baselineLineId)
      return line ? -(line.monthly * ((ch.buses || 0) / line.buses)) : 0
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
        let d = 0
        if (ch.payoutLineRevisions?.[l.code] !== undefined) {
          d = l.minG * (ch.payoutLineRevisions[l.code] / 100)
        } else if (ch.payoutBpRevisions?.[l.partner] !== undefined) {
          d = l.minG * (ch.payoutBpRevisions[l.partner] / 100)
        } else {
          const mode = ch.payoutMode || 'pct'
          if (mode === 'pct') d = l.minG * ((ch.payoutMingPct || 0) / 100)
          else d = ch.payoutDelta || 0
        }
        return s + (d * lineMonthlyKm(l)) / 100000
      }, 0)
    }
    case 'rest_stop': {
      const line = ch.baselineLineId ? lines.find((l) => l.code === ch.baselineLineId) : null
      if (line) return ((ch.restStopsAdded || 0) * (ch.restStopCost || 0) * line.rt * line.buses) / 100000
      return lines.reduce((s, l) => s + ((ch.restStopsAdded || 0) * (ch.restStopCost || 0) * l.rt * l.buses) / 100000, 0)
    }
    case 'cargo_deduction': {
      const line = ch.baselineLineId ? lines.find((l) => l.code === ch.baselineLineId) : null
      if (line) return -((ch.cargoPerTrip || 0) * line.rt * line.buses * 2) / 100000
      return -((ch.cargoPerTrip || 0) * lines.reduce((s, l) => s + l.rt * l.buses * 2, 0)) / 100000
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
    case 'contract_tenure':
      return (ch.fleetRevisions || []).reduce((s, rev) => {
        const line = lines.find((l) => l.code === rev.lineId)
        if (!line) return s
        return s + ((rev.newMinG - line.minG) * lineMonthlyKm(line)) / 100000
      }, 0)
    case 'custom': {
      if (ch.customMode === 'fixed') return (ch.customAmount || 0) / 100000
      if (ch.customMode === 'per_km') return ((ch.customPerKm || 0) * allMonthlyKm) / 100000
      if (ch.customMode === 'pct') return lines.reduce((s, l) => s + l.monthly, 0) * ((ch.customPct || 0) / 100)
      return 0
    }
    default: return 0
  }
}

function ChangeComponent({ change, scenarioUid }: { change: Change; scenarioUid: number }) {
  switch (change.type) {
    case 'fuel_change': return <FuelChange change={change} scenarioUid={scenarioUid} />
    case 'expansion': return <Expansion change={change} scenarioUid={scenarioUid} />
    case 'repurposing': return <Repurposing change={change} scenarioUid={scenarioUid} />
    case 'removal': return <Removal change={change} scenarioUid={scenarioUid} />
    case 'payout_revision': return <PayoutRevision change={change} scenarioUid={scenarioUid} />
    case 'contract_tenure': return <ContractTenure change={change} scenarioUid={scenarioUid} />
    case 'toll_change': return <TollChange change={change} scenarioUid={scenarioUid} />
    case 'rest_stop': return <RestStop change={change} scenarioUid={scenarioUid} />
    case 'cargo_deduction': return <CargoDeduction change={change} scenarioUid={scenarioUid} />
    case 'custom': return <Custom change={change} scenarioUid={scenarioUid} />
    default: return null
  }
}

export default function ScenarioCard({ scenario }: { scenario: Scenario }) {
  const updateScenario = useStore((s) => s.updateScenario)
  const deleteScenario = useStore((s) => s.deleteScenario)
  const addChange = useStore((s) => s.addChange)
  const deleteChange = useStore((s) => s.deleteChange)
  const lines = useStore((s) => s.lines)
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)

  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(scenario.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<number, boolean>>({})

  const toggleCollapse = (cid: number) =>
    setCollapsed((p) => ({ ...p, [cid]: !p[cid] }))

  const handleRename = () => {
    if (name.trim()) updateScenario(scenario.uid, { name: name.trim() })
    setEditing(false)
  }

  const changeDelta = useMemo(
    () => Object.fromEntries(scenario.changes.map((ch) => [ch.cid, computeChangeDelta(ch, lines)])),
    [scenario.changes, lines]
  )

  return (
    <div className="rounded-xl border border-gray-200 shadow-sm">
      {/* Header */}
      <div className="bg-[#444444] px-5 py-3 flex items-center justify-between">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => e.key === 'Enter' && handleRename()}
            className="bg-[#444444] text-white text-sm font-semibold px-2 py-1 rounded outline-none focus:ring-2 focus:ring-[#73D700]"
          />
        ) : (
          <h3
            className="text-white text-sm font-semibold cursor-pointer hover:text-[#73D700] transition-colors"
            onClick={() => { setName(scenario.name); setEditing(true) }}
          >
            {scenario.name}
          </h3>
        )}
        <div className="flex items-center gap-2">
          {confirmDelete ? (
            <>
              <span className="text-xs text-[#FFAD00]">Delete?</span>
              <button
                onClick={() => deleteScenario(scenario.uid)}
                className="text-xs px-2 py-1 rounded bg-[#FFAD00] text-white hover:bg-[#FFAD00]/80"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-xs px-2 py-1 rounded bg-[#444444] text-gray-300 hover:text-white"
              >
                No
              </button>
            </>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-gray-400 hover:text-[#FFAD00] text-sm transition-colors"
              title="Delete scenario"
            >
              &#10005;
            </button>
          )}
        </div>
      </div>

      {/* Changes */}
      <div className="bg-white divide-y divide-gray-100">
        {scenario.changes.length === 0 && (
          <div className="px-5 py-6 text-center text-sm text-gray-400">
            No changes yet. Add one below.
          </div>
        )}
        {scenario.changes.map((ch) => {
          const delta = changeDelta[ch.cid] || 0
          return (
            <div key={ch.cid} className="border-l-4 border-[#73D700]">
              <div
                className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => toggleCollapse(ch.cid)}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-xs text-gray-400">{collapsed[ch.cid] ? '\u25B6' : '\u25BC'}</span>
                  <span className="text-sm font-medium text-[#444444]">
                    {CHANGE_LABELS[ch.type]}
                  </span>
                  {ch.note && (
                    <span className="text-xs text-gray-400 truncate max-w-[200px]">
                      &mdash; {ch.note}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <span className={`text-xs font-semibold ${delta > 0 ? 'text-[#FFAD00]' : delta < 0 ? 'text-[#73D700]' : 'text-gray-400'}`}>
                      {delta !== 0 && (delta >= 0 ? '+' : '')}{delta !== 0 ? fmtMoney(delta, showEur, eurRate) + '/mo' : '--'}
                    </span>
                    {(() => {
                      const monthlyKm = lines.reduce((s, l) => s + l.owKm * 2 * l.rt * l.buses, 0)
                      const deltaLakhs = changeDelta[ch.cid] || 0
                      const deltaPerKm = monthlyKm > 0 ? (deltaLakhs * 100000) / monthlyKm : 0
                      return deltaPerKm !== 0 ? (
                        <span className={`text-xs ${deltaPerKm > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                          {deltaPerKm >= 0 ? '+' : ''}{fmtPerKm(deltaPerKm, showEur, eurRate)} blended
                        </span>
                      ) : null
                    })()}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteChange(scenario.uid, ch.cid) }}
                    className="text-gray-300 hover:text-[#FFAD00] text-xs transition-colors"
                    title="Remove change"
                  >
                    &#10005;
                  </button>
                </div>
              </div>
              {!collapsed[ch.cid] && (
                <div className="px-5 pb-4">
                  <ChangeComponent change={ch} scenarioUid={scenario.uid} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add Change */}
      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 relative">
        <button
          onClick={() => setShowTypeMenu((v) => !v)}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#73D700] hover:bg-[#65c200] transition-colors"
        >
          + Add Change
        </button>
        {showTypeMenu && (
          <div className="absolute left-5 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[220px]">
            {CHANGE_TYPES.map((ct) => (
              <button
                key={ct}
                onClick={() => { addChange(scenario.uid, ct); setShowTypeMenu(false) }}
                className="block w-full text-left px-4 py-2 text-sm text-[#444444] hover:bg-gray-50 transition-colors"
              >
                {CHANGE_LABELS[ct]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
