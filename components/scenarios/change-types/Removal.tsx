'use client'

import { useStore } from '@/store/useStore'
import { Change } from '@/types'
import { fmtMoney, fmtPerKm } from '@/lib/formatters'
import LineSearchSelect from '../LineSearchSelect'

interface Props {
  change: Change
  scenarioUid: number
}

export default function Removal({ change, scenarioUid }: Props) {
  const updateChange = useStore((s) => s.updateChange)
  const lines = useStore((s) => s.lines)

  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)

  const update = (u: Partial<Change>) => updateChange(scenarioUid, change.cid, u)

  const selectedLine = change.baselineLineId
    ? lines.find((l) => l.code === change.baselineLineId)
    : null
  const maxBuses = selectedLine?.buses || 0
  const busesRemoved = Math.min(change.buses || 0, maxBuses)

  const savings = selectedLine
    ? -(selectedLine.monthly * (busesRemoved / selectedLine.buses))
    : 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Line</label>
          <LineSearchSelect
            lines={lines}
            value={change.baselineLineId || ''}
            onChange={(code) => update({ baselineLineId: code })}
            placeholder="Search by line code, route or partner..."
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Buses to Remove {maxBuses > 0 && <span className="text-gray-400">(max {maxBuses})</span>}
          </label>
          <input
            type="number"
            min={0}
            max={maxBuses}
            value={change.buses || ''}
            onChange={(e) => update({ buses: Math.min(+e.target.value, maxBuses) })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          />
        </div>
      </div>

      {selectedLine && busesRemoved > 0 && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm">
          <span className="text-gray-600">Monthly Savings: </span>
          <span className="font-semibold text-[#73D700]">{fmtMoney(savings, showEur, eurRate)}</span>
          <span className="text-gray-400 text-xs ml-2">
            ({busesRemoved} of {selectedLine.buses} buses)
          </span>
        </div>
      )}
    </div>
  )
}
