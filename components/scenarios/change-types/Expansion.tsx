'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { Change } from '@/types'
import { fmtMoney, fmtPerKm } from '@/lib/formatters'

interface Props {
  change: Change
  scenarioUid: number
}

export default function Expansion({ change, scenarioUid }: Props) {
  const updateChange = useStore((s) => s.updateChange)
  const lines = useStore((s) => s.lines)
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)
  const [partnerSearch, setPartnerSearch] = useState('')

  const update = (u: Partial<Change>) => updateChange(scenarioUid, change.cid, u)

  const partners = useMemo(() => {
    const all = Array.from(new Set(lines.map((l) => l.partner))).sort()
    if (!partnerSearch) return all
    return all.filter((p) => p.toLowerCase().includes(partnerSearch.toLowerCase()))
  }, [lines, partnerSearch])

  const buses = change.expBuses || 0
  const owKm = change.expOwKms || 0
  const rt = change.expRtPerMonth || 0
  const minG = change.expMinG || 0
  const monthlyAdd = (minG * owKm * 2 * rt * buses) / 100000

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Route Name</label>
          <input
            type="text"
            value={change.expRouteName || ''}
            onChange={(e) => update({ expRouteName: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
            placeholder="e.g. Delhi-Jaipur Express"
          />
        </div>
        <div className="relative">
          <label className="block text-xs text-gray-500 mb-1">Partner</label>
          <input
            type="text"
            value={change.expPartner || partnerSearch}
            onChange={(e) => {
              setPartnerSearch(e.target.value)
              update({ expPartner: e.target.value })
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
            placeholder="Search partner..."
          />
          {partnerSearch && partners.length > 0 && !partners.includes(partnerSearch) && (
            <div className="absolute z-40 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-32 overflow-y-auto">
              {partners.slice(0, 8).map((p) => (
                <button
                  key={p}
                  onClick={() => { update({ expPartner: p }); setPartnerSearch('') }}
                  className="block w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Region</label>
          <select
            value={change.expRegion || ''}
            onChange={(e) => update({ expRegion: e.target.value as 'N' | 'S' | 'W' })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          >
            <option value="">Select...</option>
            <option value="N">North</option>
            <option value="S">South</option>
            <option value="W">West</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bus Type</label>
          <select
            value={change.expBusType || ''}
            onChange={(e) => update({ expBusType: e.target.value as 'Sleeper' | 'Hybrid' | 'Seater' })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          >
            <option value="">Select...</option>
            <option value="Sleeper">Sleeper</option>
            <option value="Hybrid">Hybrid</option>
            <option value="Seater">Seater</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">GST Slab</label>
          <select
            value={change.expGstSlab || ''}
            onChange={(e) => update({ expGstSlab: +e.target.value as 5 | 18 })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          >
            <option value="">Select...</option>
            <option value="5">5%</option>
            <option value="18">18%</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Buses</label>
          <input
            type="number"
            min={1}
            value={change.expBuses || ''}
            onChange={(e) => update({ expBuses: +e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">OW Km</label>
          <input
            type="number"
            value={change.expOwKms || ''}
            onChange={(e) => update({ expOwKms: +e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">RT / Month</label>
          <input
            type="number"
            value={change.expRtPerMonth || ''}
            onChange={(e) => update({ expRtPerMonth: +e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          />
        </div>
      </div>

      <div className="max-w-xs">
        <label className="block text-xs text-gray-500 mb-1">MinG ({showEur ? '€' : '₹'}/km)</label>
        <input
          type="number"
          step="0.01"
          value={change.expMinG || ''}
          onChange={(e) => update({ expMinG: +e.target.value })}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none"
          placeholder="e.g. 52.50"
        />
      </div>

      {/* Summary */}
      {monthlyAdd > 0 && (
        <div className="rounded-lg bg-[#FFAD00]/10 border border-[#FFAD00]/30 p-3 text-sm">
          <span className="text-gray-600">Monthly Cost Added: </span>
          <span className="font-semibold text-[#FFAD00]">+{fmtMoney(monthlyAdd, showEur, eurRate)}</span>
          {buses > 0 && owKm > 0 && rt > 0 && (
            <span className="text-gray-400 text-xs ml-2">
              ({buses} bus{buses > 1 ? 'es' : ''} x {owKm}km OW x {rt} RT/mo)
            </span>
          )}
        </div>
      )}
    </div>
  )
}
