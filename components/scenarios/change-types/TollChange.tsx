'use client'

import { useStore } from '@/store/useStore'
import { Change } from '@/types'
import { fmtMoney, fmtPerKm } from '@/lib/formatters'
import LineSearchSelect from '../LineSearchSelect'

interface Props {
  change: Change
  scenarioUid: number
}

export default function TollChange({ change, scenarioUid }: Props) {
  const updateChange = useStore((s) => s.updateChange)
  const lines = useStore((s) => s.lines)

  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)

  const update = (u: Partial<Change>) => updateChange(scenarioUid, change.cid, u)

  const selectedLine = change.baselineLineId
    ? lines.find((l) => l.code === change.baselineLineId)
    : null

  const tollPerOW = change.kmDelta || 0
  // Convert toll per OW trip to Rs/km delta
  const tollDeltaPerKm = selectedLine && selectedLine.owKm > 0
    ? tollPerOW / selectedLine.owKm
    : 0

  const lineMonthlyKm = selectedLine
    ? selectedLine.owKm * 2 * selectedLine.rt * selectedLine.buses
    : 0

  const monthlyImpact = selectedLine
    ? (tollDeltaPerKm * lineMonthlyKm) / 100000
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
          <label className="block text-xs text-gray-500 mb-1">New Toll per OW Trip ({showEur ? '€' : '₹'})</label>
          <input
            type="number"
            step="1"
            value={change.kmDelta || ''}
            onChange={(e) => update({ kmDelta: +e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
            placeholder="e.g. 500"
          />
        </div>
      </div>

      {selectedLine && tollPerOW > 0 && (
        <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-500">Toll per OW trip:</span>
            <span className="font-medium text-[#444444]">{fmtMoney(tollPerOW / 100000, showEur, eurRate)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Effective {'\u0394'}/km:</span>
            <span className="font-medium text-[#444444]">{fmtPerKm(tollDeltaPerKm, showEur, eurRate)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1">
            <span className="text-gray-600 font-medium">Monthly Impact:</span>
            <span className={`font-semibold ${monthlyImpact > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
              {monthlyImpact >= 0 ? '+' : ''}{fmtMoney(monthlyImpact, showEur, eurRate)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
