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

export default function PayoutRevision({ change, scenarioUid }: Props) {
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)
  const lines = useStore((s) => s.lines)
  const updateChange = useStore((s) => s.updateChange)

  const update = (u: Partial<Change>) => updateChange(scenarioUid, change.cid, u)

  const bpRevisions = change.payoutBpRevisions || {}
  const lineRevisions = change.payoutLineRevisions || {}
  const inputMode = change.payoutInputMode || 'pct'
  const lineBuses = change.payoutLineBuses || {}

  const [search, setSearch] = useState('')
  const [expandedBps, setExpandedBps] = useState<Set<string>>(new Set())
  const [selectedBps, setSelectedBps] = useState<Set<string>>(new Set())
  const [bulkPct, setBulkPct] = useState('')
  const [bulkScope, setBulkScope] = useState<'all' | 'selected'>('all')

  // Group lines by BP
  const bpGroups = useMemo(() => {
    const map = new Map<string, Line[]>()
    lines.forEach((l) => {
      const arr = map.get(l.partner) || []
      arr.push(l)
      map.set(l.partner, arr)
    })
    return Array.from(map.entries())
      .map(([name, bpLines]) => ({ name, lines: bpLines }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [lines])

  // Filter by search
  const filteredBps = useMemo(() => {
    if (!search.trim()) return bpGroups
    const q = search.toLowerCase()
    return bpGroups.filter(
      (bp) =>
        bp.name.toLowerCase().includes(q) ||
        bp.lines.some((l) => l.code.toLowerCase().includes(q) || l.route.toLowerCase().includes(q))
    )
  }, [bpGroups, search])

  /** Convert raw input value to ₹/km delta based on input mode */
  const toPerKmDelta = (raw: number, currentMinG: number): number => {
    switch (inputMode) {
      case 'delta': return raw                    // raw IS the ₹/km delta
      case 'absolute': return raw - currentMinG   // new rate - current
      case 'pct': return currentMinG * (raw / 100) // % of current
    }
  }

  const getLineDelta = (l: Line): number => {
    if (lineRevisions[l.code] !== undefined) return toPerKmDelta(lineRevisions[l.code], l.minG)
    if (bpRevisions[l.partner] !== undefined) return toPerKmDelta(bpRevisions[l.partner], l.minG)
    return 0
  }

  const getLineImpact = (l: Line) => {
    const delta = getLineDelta(l)
    const buses = lineBuses[l.code] ?? l.buses // partial bus count
    const km = l.owKm * 2 * l.rt * buses
    return (delta * km) / 100000
  }

  // Select all / clear
  const handleSelectAll = () => {
    setSelectedBps(new Set(filteredBps.map((bp) => bp.name)))
  }
  const handleClear = () => {
    setSelectedBps(new Set())
  }

  // Bulk apply
  const handleBulkApply = () => {
    const pct = parseFloat(bulkPct)
    if (isNaN(pct)) return
    const newBpRevisions = { ...bpRevisions }
    const targets = bulkScope === 'selected' ? Array.from(selectedBps) : bpGroups.map((bp) => bp.name)
    targets.forEach((name) => {
      newBpRevisions[name] = pct
    })
    update({ payoutBpRevisions: newBpRevisions })
  }

  // Toggle expand
  const toggleExpand = (name: string) => {
    setExpandedBps((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // Toggle BP selection
  const toggleBpSelect = (name: string) => {
    setSelectedBps((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  // BP-level delta update
  const setBpDelta = (name: string, pct: number) => {
    update({ payoutBpRevisions: { ...bpRevisions, [name]: pct } })
  }

  // Line-level delta update
  const setLineDelta = (code: string, pct: number | undefined) => {
    const next = { ...lineRevisions }
    if (pct === undefined) delete next[code]
    else next[code] = pct
    update({ payoutLineRevisions: next })
  }

  // Summary stats
  const allAffected = lines.filter((l) => getLineDelta(l) !== 0)
  const totalMonthly = allAffected.reduce((s, l) => s + getLineImpact(l), 0)
  const totalAnnual = totalMonthly * 12

  return (
    <div className="space-y-4">
      {/* GST switch */}
      <div className="flex items-center gap-3 text-xs">
        <span className="text-[#444444]/60">GST change?</span>
        <select
          value={change.payoutGstSwitch || ''}
          onChange={(e) => update({ payoutGstSwitch: (e.target.value || null) as Change['payoutGstSwitch'] })}
          className="border border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-[#73D700] outline-none"
        >
          <option value="">No change</option>
          <option value="5to18">5% → 18%</option>
          <option value="18to5">18% → 5%</option>
        </select>
        {change.payoutGstSwitch && (
          <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(255,173,0,0.15)', color: '#FFAD00', border: '1px solid #FFAD00' }}>
            {change.payoutGstSwitch === '18to5' ? 'GST saving offsets rate increase' : 'GST cost increases'}
          </span>
        )}
      </div>

      {/* Input mode toggle */}
      <div className="flex items-center gap-2 text-xs">
        <span className="text-[#444444]/60">Input mode:</span>
        {(['pct', 'delta', 'absolute'] as const).map((m) => (
          <button
            key={m}
            onClick={() => update({ payoutInputMode: m })}
            className={`px-2.5 py-1 rounded text-[10px] font-medium ${
              inputMode === m ? 'bg-[#73D700] text-white' : 'bg-gray-100 text-[#444444] hover:bg-gray-200'
            }`}
          >
            {m === 'pct' ? '% change' : m === 'delta' ? 'Δ ₹/km' : 'New rate'}
          </button>
        ))}
        <span className="text-[10px] text-[#444444]/40 ml-2">
          {inputMode === 'pct' ? 'Enter % of current MinG' : inputMode === 'delta' ? 'Enter ₹/km change (+/-)' : 'Enter target ₹/km rate'}
        </span>
      </div>

      {/* Top toolbar */}
      <div className="flex gap-2 items-center flex-wrap">
        <input
          type="text"
          placeholder="Search BPs or lines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
        />
        <button
          onClick={handleSelectAll}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          Select All
        </button>
        <button
          onClick={handleClear}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors"
        >
          Clear
        </button>
        <div className="flex items-center gap-1 ml-2">
          <input
            type="number"
            step="0.1"
            placeholder="Bulk %"
            value={bulkPct}
            onChange={(e) => setBulkPct(e.target.value)}
            className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-1 focus:ring-[#73D700] outline-none"
          />
          <select
            value={bulkScope}
            onChange={(e) => setBulkScope(e.target.value as 'all' | 'selected')}
            className="border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:ring-1 focus:ring-[#73D700] outline-none"
          >
            <option value="all">All</option>
            <option value="selected">Selected</option>
          </select>
          <button
            onClick={handleBulkApply}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#73D700] hover:bg-[#65c200] transition-colors"
          >
            Apply
          </button>
        </div>
      </div>

      {/* BP accordion cards */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {filteredBps.map((bp) => {
          const bpPct = bpRevisions[bp.name]
          const avgMinG = bp.lines.reduce((s, l) => s + l.minG, 0) / bp.lines.length
          const bpImpact = bp.lines.reduce((s, l) => s + getLineImpact(l), 0)
          const isExpanded = expandedBps.has(bp.name)
          const isSelected = selectedBps.has(bp.name)

          return (
            <div key={bp.name} className="border border-gray-200 rounded-lg overflow-hidden">
              {/* BP Header */}
              <div
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => toggleExpand(bp.name)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => {
                    e.stopPropagation()
                    toggleBpSelect(bp.name)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="accent-[#73D700]"
                />
                <span className="text-xs font-semibold text-gray-700 flex-1">
                  {bp.name}
                  <span className="text-gray-400 font-normal ml-2">
                    {bp.lines.length} lines | Avg MinG {fmtPerKm(avgMinG, showEur, eurRate)}
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.1"
                    placeholder="%"
                    value={bpPct ?? ''}
                    onChange={(e) => {
                      e.stopPropagation()
                      setBpDelta(bp.name, +e.target.value)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="w-16 border border-gray-300 rounded px-2 py-1 text-xs text-right focus:ring-1 focus:ring-[#73D700] outline-none"
                  />
                  <span className="text-xs text-gray-500">{inputMode === 'pct' ? '%' : '₹/km'}</span>
                  <span
                    className={`text-xs font-medium min-w-[70px] text-right ${
                      bpImpact > 0 ? 'text-[#FFAD00]' : bpImpact < 0 ? 'text-[#73D700]' : 'text-gray-400'
                    }`}
                  >
                    {bpImpact !== 0 ? (bpImpact >= 0 ? '+' : '') + fmtMoney(bpImpact, showEur, eurRate) + '/mo' : '--'}
                  </span>
                  <span className="text-gray-400 text-xs">{isExpanded ? '\u25B2' : '\u25BC'}</span>
                </div>
              </div>

              {/* Expanded: per-line rows */}
              {isExpanded && (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-white text-gray-400 border-b border-gray-100">
                        <th className="text-left px-3 py-1">Code</th>
                        <th className="text-left px-2 py-1">Route</th>
                        <th className="text-right px-2 py-1">Current MinG</th>
                        <th className="text-right px-2 py-1 w-20">{inputMode === 'pct' ? 'Δ%' : inputMode === 'delta' ? 'Δ ₹/km' : 'New ₹/km'}</th>
                        <th className="text-right px-2 py-1">New MinG</th>
                        <th className="text-center px-2 py-1 w-16">Buses</th>
                        <th className="text-right px-2 py-1">Impact</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bp.lines.map((l) => {
                        const hasLineOverride = lineRevisions[l.code] !== undefined
                        const delta = getLineDelta(l)
                        const newMinG = l.minG + delta
                        const impact = getLineImpact(l)
                        const affectedBuses = lineBuses[l.code] ?? l.buses
                        const isPartial = affectedBuses < l.buses

                        return (
                          <tr key={l.code} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-1 text-gray-500">{l.code}</td>
                            <td className="px-2 py-1">{l.route}</td>
                            <td className="px-2 py-1 text-right">{fmtPerKm(l.minG, showEur, eurRate)}</td>
                            <td className="px-2 py-1 text-right">
                              <input
                                type="number"
                                step="0.1"
                                placeholder={bpPct !== undefined ? String(bpPct) : '0'}
                                value={hasLineOverride ? lineRevisions[l.code] : ''}
                                onChange={(e) => {
                                  const val = e.target.value
                                  if (val === '') setLineDelta(l.code, undefined)
                                  else setLineDelta(l.code, +val)
                                }}
                                className={`w-16 border rounded px-2 py-0.5 text-xs text-right focus:ring-1 focus:ring-[#73D700] outline-none ${
                                  hasLineOverride ? 'border-[#444444]/30 bg-[#444444]/5' : 'border-gray-300'
                                }`}
                              />
                            </td>
                            <td className="px-2 py-1 text-right">
                              <span className="text-gray-400 mr-1">{'\u2192'}</span>
                              {fmtPerKm(newMinG, showEur, eurRate)}
                            </td>
                            <td className="px-2 py-1 text-center">
                              <input
                                type="number"
                                min={1}
                                max={l.buses}
                                value={affectedBuses}
                                onChange={(e) => {
                                  const v = Math.min(l.buses, Math.max(1, parseInt(e.target.value) || l.buses))
                                  const next = { ...lineBuses }
                                  if (v === l.buses) delete next[l.code]
                                  else next[l.code] = v
                                  update({ payoutLineBuses: next })
                                }}
                                className={`w-10 border rounded px-1 py-0.5 text-xs text-center focus:ring-1 focus:ring-[#73D700] outline-none ${
                                  isPartial ? 'border-[#FFAD00] bg-[#FFAD00]/5' : 'border-gray-300'
                                }`}
                              />
                              <span className="text-[9px] text-gray-400">/{l.buses}</span>
                            </td>
                            <td
                              className={`px-2 py-1 text-right font-medium ${
                                impact > 0 ? 'text-[#FFAD00]' : impact < 0 ? 'text-[#73D700]' : 'text-gray-400'
                              }`}
                            >
                              {impact !== 0
                                ? (impact >= 0 ? '+' : '') + fmtMoney(impact, showEur, eurRate)
                                : '--'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div
        className={`rounded-lg p-3 text-sm flex justify-between ${
          totalMonthly > 0 ? 'bg-[#FFAD00]/10' : totalMonthly < 0 ? 'bg-green-50' : 'bg-gray-50'
        }`}
      >
        <span className="text-gray-600">{allAffected.length} lines affected</span>
        <div className="flex gap-4">
          <span>
            Monthly:{' '}
            <span
              className={`font-semibold ${
                totalMonthly > 0 ? 'text-[#FFAD00]' : totalMonthly < 0 ? 'text-[#73D700]' : 'text-gray-500'
              }`}
            >
              {totalMonthly >= 0 ? '+' : ''}
              {fmtMoney(totalMonthly, showEur, eurRate)}
            </span>
          </span>
          <span>
            Annual:{' '}
            <span
              className={`font-semibold ${
                totalAnnual > 0 ? 'text-[#FFAD00]' : totalAnnual < 0 ? 'text-[#73D700]' : 'text-gray-500'
              }`}
            >
              {totalAnnual >= 0 ? '+' : ''}
              {fmtMoney(totalAnnual, showEur, eurRate)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
