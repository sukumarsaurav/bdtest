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

function computeEMI(vehicleCost: number, financing: number, annualRate: number, tenureMonths: number): number {
  const principal = vehicleCost * (financing / 100)
  if (principal === 0 || tenureMonths === 0) return 0
  const r = annualRate / 100 / 12
  if (r === 0) return principal / tenureMonths
  return principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1)
}

const DEFAULT_VEHICLE_COST = 7700000 // 77L
const DEFAULT_INTEREST = 10
const DEFAULT_FINANCING = 85
const DEFAULT_OLD_TENURE = 48

export default function ContractTenure({ change, scenarioUid }: Props) {
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)
  const lines = useStore((s) => s.lines)
  const updateChange = useStore((s) => s.updateChange)

  const update = (u: Partial<Change>) => updateChange(scenarioUid, change.cid, u)
  const revisions = change.fleetRevisions || []

  // Global defaults
  const [globalVehicleCost, setGlobalVehicleCost] = useState(DEFAULT_VEHICLE_COST)
  const [globalInterest, setGlobalInterest] = useState(DEFAULT_INTEREST)
  const [globalFinancing, setGlobalFinancing] = useState(DEFAULT_FINANCING)
  const [globalOldTenure, setGlobalOldTenure] = useState(DEFAULT_OLD_TENURE)

  // Line selection for adding
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [defaultNewTenure, setDefaultNewTenure] = useState(60)
  const [showAdvanced, setShowAdvanced] = useState<Set<string>>(new Set())
  const [lineSearch, setLineSearch] = useState('')

  const availableLines = useMemo(
    () => lines.filter((l) => !revisions.some((r) => r.lineId === l.code)),
    [lines, revisions]
  )

  const filteredAvailableLines = useMemo(() => {
    const q = lineSearch.toLowerCase().trim()
    if (!q) return availableLines
    return availableLines.filter((l) =>
      l.code.toLowerCase().includes(q) ||
      l.route.toLowerCase().includes(q) ||
      l.partner.toLowerCase().includes(q)
    )
  }, [availableLines, lineSearch])

  const toggleCode = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const getLineParams = (rev: (typeof revisions)[0]) => {
    const vc = rev.vehicleCost ?? globalVehicleCost
    const ir = rev.interestRate ?? globalInterest
    const fi = rev.financing ?? globalFinancing
    return { vehicleCost: vc, interestRate: ir, financing: fi }
  }

  const computeNewMinG = (line: Line, rev: (typeof revisions)[0]) => {
    const { vehicleCost, interestRate, financing } = getLineParams(rev)
    const monthlyKmPerBus = line.owKm * 2 * line.rt
    if (monthlyKmPerBus === 0) return line.minG

    const oldEmiPerKm = computeEMI(vehicleCost, financing, interestRate, globalOldTenure) / monthlyKmPerBus
    const newEmiPerKm = computeEMI(vehicleCost, financing, interestRate, rev.newTenure) / monthlyKmPerBus
    return line.minG + (newEmiPerKm - oldEmiPerKm)
  }

  // Add selected lines
  const addLines = () => {
    if (selectedCodes.size === 0) return
    const newRevisions = [...revisions]
    selectedCodes.forEach((code) => {
      if (revisions.some((r) => r.lineId === code)) return
      const line = lines.find((l) => l.code === code)
      if (!line) return
      const rev = { lineId: code, newMinG: 0, newTenure: defaultNewTenure }
      rev.newMinG = computeNewMinG(line, rev)
      newRevisions.push(rev)
    })
    update({ fleetRevisions: newRevisions })
    setSelectedCodes(new Set())
  }

  // Update tenure and auto-compute newMinG
  const updateTenure = (lineId: string, newTenure: number) => {
    const line = lines.find((l) => l.code === lineId)
    if (!line) return
    update({
      fleetRevisions: revisions.map((r) => {
        if (r.lineId !== lineId) return r
        const updated = { ...r, newTenure }
        updated.newMinG = computeNewMinG(line, updated)
        return updated
      }),
    })
  }

  // Update advanced per-line params
  const updateRevisionParam = (
    lineId: string,
    field: 'vehicleCost' | 'interestRate' | 'financing',
    value: number
  ) => {
    const line = lines.find((l) => l.code === lineId)
    if (!line) return
    update({
      fleetRevisions: revisions.map((r) => {
        if (r.lineId !== lineId) return r
        const updated = { ...r, [field]: value }
        updated.newMinG = computeNewMinG(line, updated)
        return updated
      }),
    })
  }

  const removeRevision = (lineId: string) => {
    update({ fleetRevisions: revisions.filter((r) => r.lineId !== lineId) })
  }

  const toggleAdvanced = (lineId: string) => {
    setShowAdvanced((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }

  // Summary
  const totalMonthly = revisions.reduce((s, rev) => {
    const line = lines.find((l) => l.code === rev.lineId)
    if (!line) return s
    const delta = rev.newMinG - line.minG
    return s + (delta * lineMonthlyKm(line)) / 100000
  }, 0)

  return (
    <div className="space-y-4">
      {/* Global defaults row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Vehicle Cost</label>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{'\u20B9'}</span>
            <input
              type="number"
              value={globalVehicleCost}
              onChange={(e) => setGlobalVehicleCost(+e.target.value)}
              className="w-full border border-gray-300 rounded-lg pl-5 pr-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
              placeholder="7700000"
            />
          </div>
          <span className="text-[10px] text-gray-400">{(globalVehicleCost / 100000).toFixed(0)}L</span>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Interest Rate (%)</label>
          <input
            type="number"
            step="0.1"
            value={globalInterest}
            onChange={(e) => setGlobalInterest(+e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Financing (%)</label>
          <input
            type="number"
            step="1"
            value={globalFinancing}
            onChange={(e) => setGlobalFinancing(+e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Old Tenure (mo)</label>
          <input
            type="number"
            min={1}
            max={180}
            value={globalOldTenure}
            onChange={(e) => setGlobalOldTenure(+e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          />
        </div>
      </div>

      {/* Line selection */}
      <div className="flex gap-3 items-end flex-wrap">
        <div className="flex-1 min-w-[250px]">
          <label className="block text-xs text-gray-500 mb-1">Select Lines</label>
          <input
            type="text"
            value={lineSearch}
            onChange={(e) => setLineSearch(e.target.value)}
            placeholder="Search by line code, route or partner..."
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs mb-2 focus:ring-2 focus:ring-[#73D700] outline-none"
          />
          <div className="flex flex-col gap-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
            {filteredAvailableLines.map((l) => (
              <label key={l.code} className="flex items-start gap-2 text-xs text-gray-600 hover:bg-gray-50 rounded px-1 py-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCodes.has(l.code)}
                  onChange={() => toggleCode(l.code)}
                  className="accent-[#73D700] mt-0.5"
                />
                <span className="font-mono text-[10px] bg-[#444444] text-white px-1 py-0.5 rounded mt-0.5 shrink-0">{l.code}</span>
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-[#444444]">{l.route}</span>
                  <span className="text-gray-400"> {'\u00B7'} {l.partner} {'\u00B7'} {l.buses} buses</span>
                </span>
              </label>
            ))}
            {filteredAvailableLines.length === 0 && (
              <span className="text-xs text-gray-400 px-1">
                {availableLines.length === 0 ? 'All lines added' : 'No lines match search'}
              </span>
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">New Tenure (mo)</label>
          <input
            type="number"
            min={1}
            max={180}
            value={defaultNewTenure}
            onChange={(e) => setDefaultNewTenure(+e.target.value)}
            className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          />
        </div>
        <button
          onClick={addLines}
          disabled={selectedCodes.size === 0}
          className="px-3 py-2 rounded-lg text-xs font-semibold text-white bg-[#73D700] hover:bg-[#65c200] disabled:bg-gray-300 transition-colors"
        >
          Add ({selectedCodes.size})
        </button>
      </div>

      {/* Per-line table */}
      {revisions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-2 py-1">Line</th>
                <th className="text-right px-2 py-1">Current MinG</th>
                <th className="text-right px-2 py-1">Old EMI/km</th>
                <th className="text-right px-2 py-1 w-20">New Tenure</th>
                <th className="text-right px-2 py-1">New EMI/km</th>
                <th className="text-right px-2 py-1">New MinG</th>
                <th className="text-right px-2 py-1">{'\u0394'}/km</th>
                <th className="text-right px-2 py-1">Mo Impact</th>
                <th className="px-2 py-1 w-14"></th>
              </tr>
            </thead>
            <tbody>
              {revisions.map((rev) => {
                const line = lines.find((l) => l.code === rev.lineId)
                if (!line) return null
                const { vehicleCost, interestRate, financing } = getLineParams(rev)
                const monthlyKmPerBus = line.owKm * 2 * line.rt
                const oldEmiPerKm = monthlyKmPerBus > 0
                  ? computeEMI(vehicleCost, financing, interestRate, globalOldTenure) / monthlyKmPerBus
                  : 0
                const newEmiPerKm = monthlyKmPerBus > 0
                  ? computeEMI(vehicleCost, financing, interestRate, rev.newTenure) / monthlyKmPerBus
                  : 0
                const deltaPerKm = rev.newMinG - line.minG
                const moImpact = (deltaPerKm * lineMonthlyKm(line)) / 100000
                const isAdvanced = showAdvanced.has(rev.lineId)

                return (
                  <tr key={rev.lineId} className="border-b border-gray-100 group">
                    <td className="px-2 py-1">
                      {line.route}
                      <button
                        onClick={() => toggleAdvanced(rev.lineId)}
                        className="ml-1 text-[10px] text-gray-400 hover:text-[#444444]"
                        title="Advanced overrides"
                      >
                        {isAdvanced ? '\u25B4' : '\u2699'}
                      </button>
                      {isAdvanced && (
                        <div className="mt-1 flex gap-2 text-[10px]">
                          <label className="text-gray-400">
                            VC{' '}
                            <input
                              type="number"
                              value={rev.vehicleCost ?? globalVehicleCost}
                              onChange={(e) => updateRevisionParam(rev.lineId, 'vehicleCost', +e.target.value)}
                              className="w-20 border border-[#444444]/30 bg-[#444444]/5 rounded px-1 py-0.5 text-right outline-none"
                            />
                          </label>
                          <label className="text-gray-400">
                            IR%{' '}
                            <input
                              type="number"
                              step="0.1"
                              value={rev.interestRate ?? globalInterest}
                              onChange={(e) => updateRevisionParam(rev.lineId, 'interestRate', +e.target.value)}
                              className="w-14 border border-[#444444]/30 bg-[#444444]/5 rounded px-1 py-0.5 text-right outline-none"
                            />
                          </label>
                          <label className="text-gray-400">
                            Fin%{' '}
                            <input
                              type="number"
                              step="1"
                              value={rev.financing ?? globalFinancing}
                              onChange={(e) => updateRevisionParam(rev.lineId, 'financing', +e.target.value)}
                              className="w-14 border border-[#444444]/30 bg-[#444444]/5 rounded px-1 py-0.5 text-right outline-none"
                            />
                          </label>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">{fmtPerKm(line.minG, showEur, eurRate)}</td>
                    <td className="px-2 py-1 text-right text-gray-500">{fmtPerKm(oldEmiPerKm, showEur, eurRate)}</td>
                    <td className="px-2 py-1 text-right">
                      <input
                        type="number"
                        min={1}
                        max={180}
                        value={rev.newTenure}
                        onChange={(e) => updateTenure(rev.lineId, +e.target.value)}
                        className="w-16 border border-gray-300 rounded px-2 py-1 text-right text-xs focus:ring-1 focus:ring-[#73D700] outline-none"
                      />
                    </td>
                    <td className="px-2 py-1 text-right text-gray-500">{fmtPerKm(newEmiPerKm, showEur, eurRate)}</td>
                    <td className="px-2 py-1 text-right font-medium">{fmtPerKm(rev.newMinG, showEur, eurRate)}</td>
                    <td
                      className={`px-2 py-1 text-right ${
                        deltaPerKm > 0 ? 'text-[#FFAD00]' : deltaPerKm < 0 ? 'text-[#73D700]' : 'text-gray-400'
                      }`}
                    >
                      {deltaPerKm >= 0 ? '+' : ''}
                      {fmtPerKm(deltaPerKm, showEur, eurRate)}
                    </td>
                    <td
                      className={`px-2 py-1 text-right font-medium ${
                        moImpact > 0 ? 'text-[#FFAD00]' : moImpact < 0 ? 'text-[#73D700]' : 'text-gray-400'
                      }`}
                    >
                      {moImpact >= 0 ? '+' : ''}
                      {fmtMoney(moImpact, showEur, eurRate)}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <button
                        onClick={() => removeRevision(rev.lineId)}
                        className="text-gray-300 hover:text-[#FFAD00] transition-colors"
                      >
                        &#10005;
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {revisions.length === 0 && (
        <div className="text-sm text-gray-400 text-center py-4">
          Select lines above and click Add to create tenure revisions.
        </div>
      )}

      {/* Summary */}
      <div className="text-sm flex gap-4">
        <span className="text-gray-500">{revisions.length} lines</span>
        <span>
          Total Monthly:{' '}
          <span
            className={`font-semibold ${
              totalMonthly > 0 ? 'text-[#FFAD00]' : totalMonthly < 0 ? 'text-[#73D700]' : 'text-gray-500'
            }`}
          >
            {totalMonthly >= 0 ? '+' : ''}
            {fmtMoney(totalMonthly, showEur, eurRate)}
          </span>
        </span>
      </div>
    </div>
  )
}
