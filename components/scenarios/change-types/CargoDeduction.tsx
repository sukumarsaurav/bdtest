'use client'

import { useStore } from '@/store/useStore'
import { Change } from '@/types'
import { fmtMoney, fmtPerKm } from '@/lib/formatters'
import LineSearchSelect from '../LineSearchSelect'

interface Props {
  change: Change
  scenarioUid: number
}

export default function CargoDeduction({ change, scenarioUid }: Props) {
  const updateChange = useStore((s) => s.updateChange)
  const lines = useStore((s) => s.lines)

  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)

  const update = (u: Partial<Change>) => updateChange(scenarioUid, change.cid, u)

  const selectedLine = change.baselineLineId
    ? lines.find((l) => l.code === change.baselineLineId)
    : null

  const perTrip = change.cargoPerTrip || 0

  // -(cargoRevenuePerTrip * rt * buses / 100000)
  // Trips = rt * buses * 2 (OW trips)
  const totalTrips = selectedLine ? selectedLine.rt * selectedLine.buses * 2 : 0
  const monthlyImpact = -(perTrip * totalTrips) / 100000

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
          <label className="block text-xs text-gray-500 mb-1">Cargo Revenue / Trip ({showEur ? '€' : '₹'})</label>
          <input
            type="number"
            value={change.cargoPerTrip || ''}
            onChange={(e) => update({ cargoPerTrip: +e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
            placeholder="e.g. 2000"
          />
        </div>
      </div>

      {selectedLine && perTrip > 0 && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Cargo deduction:</span>
            <span className="font-medium text-[#444444]">{fmtMoney(perTrip / 100000, showEur, eurRate)} / trip</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Total monthly trips:</span>
            <span className="font-medium text-[#444444]">{totalTrips.toLocaleString('en-IN')}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1">
            <span className="text-gray-600 font-medium">Monthly Savings (for Flix):</span>
            <span className="font-semibold text-[#73D700]">{fmtMoney(monthlyImpact, showEur, eurRate)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
