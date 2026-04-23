'use client'

import { useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { Change } from '@/types'
import { fmtMoney, fmtPerKm } from '@/lib/formatters'

interface Props {
  change: Change
  scenarioUid: number
}

const MODES = [
  { key: 'fixed', label: 'Fixed Monthly' },
  { key: 'per_km', label: 'Per Km' },
  { key: 'pct', label: '% of Current' },
] as const

const SCOPES = [
  { key: 'all', label: 'All India' },
  { key: 'region', label: 'By Region' },
  { key: 'partner', label: 'By Partner' },
  { key: 'line', label: 'By Line' },
] as const

export default function Custom({ change, scenarioUid }: Props) {
  const updateChange = useStore((s) => s.updateChange)
  const lines = useStore((s) => s.lines)

  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)

  const mode = change.customMode || 'fixed'
  const scope = change.customScope || 'all'
  const update = (u: Partial<Change>) => updateChange(scenarioUid, change.cid, u)

  const partners = useMemo(() => Array.from(new Set(lines.map((l) => l.partner))).sort(), [lines])

  // Determine target lines based on scope
  const targetLines = useMemo(() => {
    if (scope === 'all') return lines
    if (scope === 'region' && change.customRegion) return lines.filter((l) => l.region === change.customRegion)
    if (scope === 'partner' && change.customBpId) return lines.filter((l) => l.partner === change.customBpId)
    if (scope === 'line' && change.customLineId) return lines.filter((l) => l.code === change.customLineId)
    return lines
  }, [scope, lines, change.customRegion, change.customBpId, change.customLineId])

  const targetMonthlyKm = targetLines.reduce((s, l) => s + l.owKm * 2 * l.rt * l.buses, 0)
  const targetMonthly = targetLines.reduce((s, l) => s + l.monthly, 0)

  let monthlyImpact = 0
  if (mode === 'fixed') {
    monthlyImpact = (change.customAmount || 0) / 100000
  } else if (mode === 'per_km') {
    monthlyImpact = ((change.customPerKm || 0) * targetMonthlyKm) / 100000
  } else if (mode === 'pct') {
    monthlyImpact = targetMonthly * ((change.customPct || 0) / 100)
  }

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex gap-2">
        {MODES.map((m) => (
          <button
            key={m.key}
            onClick={() => update({ customMode: m.key })}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              mode === m.key
                ? 'bg-[#73D700] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Value input */}
      <div className="max-w-xs">
        <label className="block text-xs text-gray-500 mb-1">
          {mode === 'fixed' ? `Amount (${showEur ? '€' : '₹'})` : mode === 'per_km' ? `${showEur ? '€' : '₹'} / Km` : 'Percentage (%)'}
        </label>
        <input
          type="number"
          step={mode === 'pct' ? '0.1' : mode === 'per_km' ? '0.01' : '1'}
          value={mode === 'fixed' ? (change.customAmount || '') : mode === 'per_km' ? (change.customPerKm || '') : (change.customPct || '')}
          onChange={(e) => {
            if (mode === 'fixed') update({ customAmount: +e.target.value })
            else if (mode === 'per_km') update({ customPerKm: +e.target.value })
            else update({ customPct: +e.target.value })
          }}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          placeholder={mode === 'fixed' ? 'e.g. 500000' : mode === 'per_km' ? 'e.g. +0.5' : 'e.g. 5 or -3'}
        />
      </div>

      {/* Scope selector */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Scope</label>
        <div className="flex gap-2 flex-wrap">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => update({ customScope: s.key as Change['customScope'] })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                scope === s.key
                  ? 'bg-[#444444] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target selector */}
      {scope === 'region' && (
        <select
          value={change.customRegion || ''}
          onChange={(e) => update({ customRegion: e.target.value as 'N' | 'S' | 'W' })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
        >
          <option value="">Select region...</option>
          <option value="N">North</option>
          <option value="S">South</option>
          <option value="W">West</option>
        </select>
      )}

      {scope === 'partner' && (
        <select
          value={change.customBpId || ''}
          onChange={(e) => update({ customBpId: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none min-w-[200px]"
        >
          <option value="">Select partner...</option>
          {partners.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      )}

      {scope === 'line' && (
        <select
          value={change.customLineId || ''}
          onChange={(e) => update({ customLineId: e.target.value })}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none min-w-[200px]"
        >
          <option value="">Select line...</option>
          {lines.map((l) => (
            <option key={l.code} value={l.code}>{l.route} ({l.code})</option>
          ))}
        </select>
      )}

      {/* Note */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Note</label>
        <input
          type="text"
          value={change.note || ''}
          onChange={(e) => update({ note: e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          placeholder="Description of this custom change..."
        />
      </div>

      {/* Impact */}
      <div className="text-sm">
        <span className="text-gray-500">Monthly Impact: </span>
        <span className={`font-semibold ${monthlyImpact > 0 ? 'text-[#FFAD00]' : monthlyImpact < 0 ? 'text-[#73D700]' : 'text-gray-500'}`}>
          {monthlyImpact >= 0 ? '+' : ''}{fmtMoney(monthlyImpact, showEur, eurRate)}
        </span>
      </div>
    </div>
  )
}
