'use client'

import { useStore } from '@/store/useStore'
import { Change } from '@/types'
import { fmtMoney, fmtPerKm } from '@/lib/formatters'
import LineSearchSelect from '../LineSearchSelect'

interface Props {
  change: Change
  scenarioUid: number
}

export default function Repurposing({ change, scenarioUid }: Props) {
  const updateChange = useStore((s) => s.updateChange)
  const lines = useStore((s) => s.lines)

  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)

  const update = (u: Partial<Change>) => updateChange(scenarioUid, change.cid, u)

  const fromLine = change.repFromLineId ? lines.find((l) => l.code === change.repFromLineId) : null
  const maxBuses = fromLine?.buses || 0
  const busesToMove = Math.min(change.repBuses || 0, maxBuses)

  const toLine = change.repToLineId ? lines.find((l) => l.code === change.repToLineId) : null
  const newMinG = change.repNewMinG || (toLine ? toLine.minG : 0)

  // fromDelta = -(buses * fromLine.minG * fromLine.owKm * 2 * fromLine.rt / 100000)
  const fromDelta = fromLine
    ? -(busesToMove * fromLine.minG * fromLine.owKm * 2 * fromLine.rt / 100000)
    : 0

  // toDelta = +(buses * newMinG * toLine.owKm * 2 * toLine.rt / 100000)
  const toOwKm = toLine ? toLine.owKm : (change.repToOwKms || 0)
  const toRt = toLine ? toLine.rt : (change.repToRtPerMonth || 0)
  const toDelta = +(busesToMove * newMinG * toOwKm * 2 * toRt / 100000)

  const netImpact = fromDelta + toDelta

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">From Line</label>
          <LineSearchSelect
            lines={lines}
            value={change.repFromLineId || ''}
            onChange={(code) => update({ repFromLineId: code })}
            placeholder="Search source line..."
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Buses to Move {maxBuses > 0 && <span className="text-gray-400">(max {maxBuses})</span>}
          </label>
          <input
            type="number"
            min={0}
            max={maxBuses}
            value={change.repBuses || ''}
            onChange={(e) => update({ repBuses: Math.min(+e.target.value, maxBuses) })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">To Line</label>
          <LineSearchSelect
            lines={lines.filter((l) => l.code !== change.repFromLineId)}
            value={change.repToLineId || ''}
            onChange={(code) => {
              const line = lines.find((l) => l.code === code)
              update({
                repToLineId: code,
                repNewMinG: line ? line.minG : change.repNewMinG,
              })
            }}
            placeholder="Search destination line..."
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">New MinG ({showEur ? '€' : '₹'}/km)</label>
          <input
            type="number"
            step="0.01"
            value={change.repNewMinG || ''}
            onChange={(e) => update({ repNewMinG: +e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
            placeholder={toLine ? String(toLine.minG) : 'MinG for destination'}
          />
        </div>
        {!toLine && (
          <>
            <div>
              <label className="block text-xs text-gray-500 mb-1">New OW Km</label>
              <input
                type="number"
                value={change.repToOwKms || ''}
                onChange={(e) => update({ repToOwKms: +e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">RT / Month</label>
              <input
                type="number"
                value={change.repToRtPerMonth || ''}
                onChange={(e) => update({ repToRtPerMonth: +e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
              />
            </div>
          </>
        )}
      </div>

      {/* Net impact breakdown */}
      <div className="rounded-lg bg-gray-50 p-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">From line (removal):</span>
          <span className="text-[#73D700] font-semibold">{fmtMoney(fromDelta, showEur, eurRate)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">To line (addition):</span>
          <span className="text-[#FFAD00] font-semibold">+{fmtMoney(toDelta, showEur, eurRate)}</span>
        </div>
        <div className="flex justify-between border-t border-gray-200 pt-1">
          <span className="text-gray-700 font-medium">Net Impact:</span>
          <span className={`font-semibold ${netImpact > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
            {netImpact >= 0 ? '+' : ''}{fmtMoney(netImpact, showEur, eurRate)}
          </span>
        </div>
      </div>
    </div>
  )
}
