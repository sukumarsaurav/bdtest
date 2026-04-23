'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Change, Line } from '@/types'
import { fmtMoney, fmtPerKm } from '@/lib/formatters'

interface Props {
  change: Change
  scenarioUid: number
}

function lineMonthlyKm(l: Line) {
  return l.owKm * 2 * l.rt * l.buses
}

const TYPE_MILEAGE: Record<string, number> = { 'Sleeper': 3.2, 'Hybrid': 3.6, 'Seater': 4.0 }

const CITY_DIESEL: Record<string, number> = {
  'Delhi': 94.27,
  'Mumbai': 97.03,
  'Bangalore': 88.58,
  'Chennai': 96.47,
  'Hyderabad': 91.73,
  'Kolkata': 93.18,
  'Pune': 95.85,
  'Ahmedabad': 91.45,
  'Jaipur': 92.39,
  'Lucknow': 93.15,
  'Chandigarh': 92.38,
  'Kochi': 96.89,
  'Trivandrum': 96.75,
  'Coimbatore': 96.33,
  'Vizag': 96.42,
}

const CITIES = Object.keys(CITY_DIESEL)

const REGION_PILLS = [
  { key: 'all', label: 'All' },
  { key: 'N', label: 'North' },
  { key: 'S', label: 'South' },
  { key: 'W', label: 'West' },
] as const

type SortKey = 'route' | 'deltaCpk' | 'moImpact'
type SortDir = 'asc' | 'desc'

export default function FuelChange({ change, scenarioUid }: Props) {
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)
  const lines = useStore((s) => s.lines)
  const updateChange = useStore((s) => s.updateChange)

  const currentPrice = change.currentDieselPrice || 0
  const newPrice = change.newDieselPrice || 0
  const mileage = change.currentMileage || 3.6

  const update = (u: Partial<Change>) => updateChange(scenarioUid, change.cid, u)

  const [displayRegion, setDisplayRegion] = useState<'all' | 'N' | 'S' | 'W'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('moImpact')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const selectedLines = change.payoutSelectedLines || {}
  const hasAnySelected = Object.values(selectedLines).some(Boolean)

  const handleCityChange = (city: string) => {
    update({
      fuelCity: city,
      currentDieselPrice: CITY_DIESEL[city] || 0,
    })
  }

  const curCpk = mileage > 0 ? currentPrice / mileage : 0
  const fcstCpk = mileage > 0 ? newPrice / mileage : 0
  const deltaCpk = fcstCpk - curCpk

  // All line impacts (for computation, NOT filtered by display region)
  const allLineImpacts = useMemo(() => {
    return lines.map((l) => {
      const lineMileage = TYPE_MILEAGE[l.type] ?? mileage
      const lineDeltaCpk = lineMileage > 0 ? (newPrice - currentPrice) / lineMileage : 0
      const moKm = lineMonthlyKm(l)
      const moImpact = (lineDeltaCpk * moKm) / 100000
      return { code: l.code, route: l.route, partner: l.partner, region: l.region, busType: l.type, lineMileage, moKm, moImpact, deltaCpk: lineDeltaCpk, dieselAtCommission: l.dieselAtCommission }
    })
  }, [lines, currentPrice, newPrice, mileage])

  // Display-filtered lines (by region pill)
  const displayFiltered = useMemo(() => {
    const filtered = displayRegion !== 'all'
      ? allLineImpacts.filter((li) => li.region === displayRegion)
      : allLineImpacts
    return [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'route') cmp = a.route.localeCompare(b.route)
      else if (sortKey === 'deltaCpk') cmp = a.deltaCpk - b.deltaCpk
      else cmp = a.moImpact - b.moImpact
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [allLineImpacts, displayRegion, sortKey, sortDir])

  // Effective selected: if none selected, treat as all
  const isLineSelected = (code: string) => !hasAnySelected || selectedLines[code]

  // Summary: based on selected lines only
  const summaryLines = allLineImpacts.filter((li) => isLineSelected(li.code))
  const totalSelectedKm = summaryLines.reduce((s, li) => s + li.moKm, 0)
  const totalMonthlyImpact = summaryLines.reduce((s, li) => s + li.moImpact, 0)
  const blendedDelta = totalSelectedKm > 0 ? (totalMonthlyImpact * 100000) / totalSelectedKm : 0

  // Select all / clear
  const handleSelectAll = () => {
    const next: Record<string, boolean> = {}
    lines.forEach((l) => { next[l.code] = true })
    update({ payoutSelectedLines: next })
  }
  const handleClearSelection = () => {
    update({ payoutSelectedLines: {} })
  }

  // Toggle line selection
  const toggleLine = (code: string) => {
    update({
      payoutSelectedLines: { ...selectedLines, [code]: !selectedLines[code] },
    })
  }

  // Sort toggle
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const sortArrow = (key: SortKey) => {
    if (sortKey !== key) return ' \u2195'
    return sortDir === 'asc' ? ' \u25B2' : ' \u25BC'
  }

  return (
    <div className="space-y-4">
      {/* City + inputs row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">City</label>
          <select
            value={change.fuelCity || ''}
            onChange={(e) => handleCityChange(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          >
            <option value="">Select city...</option>
            {CITIES.map((c) => (
              <option key={c} value={c}>{c} ({'\u20B9'}{CITY_DIESEL[c]})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Current Market ({'\u20B9'}/L)</label>
          <input
            type="number"
            step="0.01"
            value={currentPrice || ''}
            onChange={(e) => update({ currentDieselPrice: +e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
            placeholder="e.g. 94.27"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Forecast / Scenario Rate ({'\u20B9'}/L)</label>
          <input
            type="number"
            step="0.01"
            value={newPrice || ''}
            onChange={(e) => update({ newDieselPrice: +e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
            placeholder="e.g. 98.00"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Fleet Mileage (km/L)</label>
          <input
            type="number"
            step="0.1"
            value={mileage || ''}
            onChange={(e) => update({ currentMileage: +e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
            placeholder="3.6"
          />
          <p className="text-[10px] text-gray-400 mt-1">Overrides per-type defaults (Sleeper 3.2, Hybrid 3.6, Seater 4.0)</p>
        </div>
      </div>

      {/* CPK progression display */}
      {mileage > 0 && (currentPrice > 0 || newPrice > 0) && (
        <div className="flex items-center gap-2 flex-wrap text-xs px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
          {(() => {
            const avgCommission = lines.reduce((s, l) => s + (l.dieselAtCommission || 0), 0) / (lines.filter(l => l.dieselAtCommission).length || 1)
            const commCpk = avgCommission > 0 && mileage > 0 ? avgCommission / mileage : 0
            return (
              <>
                {commCpk > 0 && (
                  <>
                    <span className="text-gray-500">At commissioning:</span>
                    <span className="font-semibold text-[#444444]">{fmtPerKm(commCpk, showEur, eurRate)}</span>
                    <span className="text-gray-400">{'\u2192'}</span>
                  </>
                )}
                <span className="text-gray-500">Current:</span>
                <span className="font-semibold text-[#444444]">{fmtPerKm(curCpk, showEur, eurRate)}</span>
                {commCpk > 0 && curCpk > commCpk && (
                  <span className="text-[#FFAD00] text-[10px]">(+{fmtPerKm(curCpk - commCpk, showEur, eurRate)})</span>
                )}
                <span className="text-gray-400">{'\u2192'}</span>
                <span className="text-gray-500">Forecast:</span>
                <span className={`font-semibold ${fcstCpk > curCpk ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                  {fmtPerKm(fcstCpk, showEur, eurRate)}
                </span>
                <span className={`text-[10px] ${deltaCpk > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                  ({deltaCpk >= 0 ? '+' : ''}{fmtPerKm(deltaCpk, showEur, eurRate)})
                </span>
              </>
            )
          })()}
        </div>
      )}

      {/* Summary strip -- reflects selected lines only */}
      <div className="rounded-lg bg-[#444444] p-4 grid grid-cols-4 gap-4 text-white text-sm">
        <div>
          <div className="text-gray-400 text-xs">Current Fuel CPK</div>
          <div className="font-semibold">{fmtPerKm(curCpk, showEur, eurRate)}</div>
        </div>
        <div>
          <div className="text-gray-400 text-xs">Forecast Fuel CPK</div>
          <div className="font-semibold">{fmtPerKm(fcstCpk, showEur, eurRate)}</div>
        </div>
        <div>
          <div className="text-gray-400 text-xs">{'\u0394'}/km (blended)</div>
          <div className={`font-semibold ${blendedDelta > 0 ? 'text-[#FFAD00]' : blendedDelta < 0 ? 'text-[#73D700]' : ''}`}>
            {blendedDelta >= 0 ? '+' : ''}{fmtPerKm(blendedDelta, showEur, eurRate)}
          </div>
        </div>
        <div>
          <div className="text-gray-400 text-xs">Monthly Impact</div>
          <div className={`font-semibold ${totalMonthlyImpact > 0 ? 'text-[#FFAD00]' : totalMonthlyImpact < 0 ? 'text-[#73D700]' : ''}`}>
            {totalMonthlyImpact >= 0 ? '+' : ''}{fmtMoney(totalMonthlyImpact, showEur, eurRate)}
          </div>
        </div>
      </div>

      {/* Region filter pills + select controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1">
          {REGION_PILLS.map((rp) => (
            <button
              key={rp.key}
              onClick={() => setDisplayRegion(rp.key as typeof displayRegion)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                displayRegion === rp.key
                  ? 'bg-[#73D700] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {rp.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSelectAll}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Select All
          </button>
          <button
            onClick={handleClearSelection}
            className="px-3 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Per-line impact table */}
      {deltaCpk !== 0 && (
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-center px-2 py-1 w-8">
                  <input
                    type="checkbox"
                    checked={hasAnySelected && displayFiltered.every((li) => selectedLines[li.code])}
                    onChange={(e) => {
                      const next = { ...selectedLines }
                      displayFiltered.forEach((li) => { next[li.code] = e.target.checked })
                      update({ payoutSelectedLines: next })
                    }}
                    className="accent-[#73D700]"
                  />
                </th>
                <th
                  className="text-left px-2 py-1 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('route')}
                >
                  Route{sortArrow('route')}
                </th>
                <th className="text-left px-2 py-1">Partner</th>
                <th className="text-left px-2 py-1">Region</th>
                <th className="text-left px-2 py-1">Bus Type</th>
                <th className="text-right px-2 py-1">Mileage</th>
                <th className="text-right px-2 py-1">PC Diesel</th>
                <th
                  className="text-right px-2 py-1 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('deltaCpk')}
                >
                  {'\u0394'}/km{sortArrow('deltaCpk')}
                </th>
                <th className="text-right px-2 py-1">Mo Km</th>
                <th
                  className="text-right px-2 py-1 cursor-pointer select-none hover:text-gray-700"
                  onClick={() => handleSort('moImpact')}
                >
                  Mo Impact{sortArrow('moImpact')}
                </th>
              </tr>
            </thead>
            <tbody>
              {displayFiltered.map((li) => {
                const selected = isLineSelected(li.code)
                return (
                  <tr
                    key={li.code}
                    className={`border-b border-gray-100 ${!selected && hasAnySelected ? 'opacity-40' : ''}`}
                  >
                    <td className="text-center px-2 py-1">
                      <input
                        type="checkbox"
                        checked={selectedLines[li.code] || false}
                        onChange={() => toggleLine(li.code)}
                        className="accent-[#73D700]"
                      />
                    </td>
                    <td className="px-2 py-1">{li.route}</td>
                    <td className="px-2 py-1 text-gray-500">{li.partner}</td>
                    <td className="px-2 py-1 text-gray-500">{li.region}</td>
                    <td className="px-2 py-1 text-gray-500">{li.busType}</td>
                    <td className="px-2 py-1 text-right text-gray-500">{li.lineMileage.toFixed(1)}</td>
                    <td className="px-2 py-1 text-right text-gray-500">
                      {li.dieselAtCommission != null ? `${'\u20B9'}${li.dieselAtCommission.toFixed(2)}` : '\u2014'}
                    </td>
                    <td className={`px-2 py-1 text-right ${li.deltaCpk > 0 ? 'text-[#FFAD00]' : li.deltaCpk < 0 ? 'text-[#73D700]' : ''}`}>
                      {li.deltaCpk >= 0 ? '+' : ''}{fmtPerKm(li.deltaCpk, showEur, eurRate)}
                    </td>
                    <td className="px-2 py-1 text-right">{(li.moKm / 1000).toFixed(0)}k</td>
                    <td className={`px-2 py-1 text-right font-medium ${li.moImpact > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                      {li.moImpact >= 0 ? '+' : ''}{fmtMoney(li.moImpact, showEur, eurRate)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {/* Summary row */}
            <tfoot>
              <tr className="bg-gray-50 font-semibold text-xs border-t border-gray-200">
                <td colSpan={7} className="px-2 py-1.5 text-gray-600">
                  Total selected: {summaryLines.length} lines
                </td>
                <td className={`px-2 py-1.5 text-right ${blendedDelta > 0 ? 'text-[#FFAD00]' : blendedDelta < 0 ? 'text-[#73D700]' : ''}`}>
                  {blendedDelta >= 0 ? '+' : ''}{fmtPerKm(blendedDelta, showEur, eurRate)}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-600">{(totalSelectedKm / 1000).toFixed(0)}k</td>
                <td className={`px-2 py-1.5 text-right ${totalMonthlyImpact > 0 ? 'text-[#FFAD00]' : totalMonthlyImpact < 0 ? 'text-[#73D700]' : ''}`}>
                  {totalMonthlyImpact >= 0 ? '+' : ''}{fmtMoney(totalMonthlyImpact, showEur, eurRate)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
