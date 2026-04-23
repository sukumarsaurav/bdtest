'use client'

import { useState } from 'react'
import type { Bl2Line } from '@/lib/cost-utils'

const GM = (slab: number | null) => (slab ?? 5) === 18 ? 1.13 : 1.0

interface Props {
  line: Bl2Line
  onSubmit: (data: {
    line: Bl2Line
    targetMinG: number
    newGstSlab: number | null
    affectedBuses: number | null
    owner: string
    notes: string
  }) => void
  onCancel: () => void
}

export default function AddRenegotiationForm({ line, onSubmit, onCancel }: Props) {
  const [targetMinG, setTargetMinG] = useState(line.pc5 ? (line.pc5 * 1.02).toFixed(2) : '')
  const [newGstSlab, setNewGstSlab] = useState<number | null>(null)
  const [affectedBuses, setAffectedBuses] = useState(line.buses)
  const [owner, setOwner] = useState('')
  const [notes, setNotes] = useState('')

  const target = parseFloat(targetMinG) || 0
  const oldEff = line.min_g * GM(line.gst_slab)
  const newGst = newGstSlab ?? line.gst_slab
  const newEff = target * GM(newGst)
  const totalDelta = newEff - oldEff
  const km = line.ow_km * line.rt * 2 * affectedBuses
  const monthlySavingL = Math.abs(totalDelta) * km / 1e5

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onCancel}>
      <div className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6 space-y-5">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-lg font-semibold text-[#444444]">Start renegotiation</h2>
              <p className="text-xs text-[#444444]/60 mt-1">{line.line_id} · {line.line_name} · {line.partner}</p>
              <p className="text-[10px] text-[#444444]/40">{line.region} · {line.buses} buses · {line.bus_type} · {line.gst_slab}% GST</p>
            </div>
            <button onClick={onCancel} className="text-[#444444]/60 hover:text-[#444444] text-xl">×</button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-[#444444]/50">Current MinG</p>
              <p className="text-base font-bold text-[#444444]">₹{line.min_g.toFixed(2)}/km</p>
            </div>
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-[#444444]/50">Current eff. MinG</p>
              <p className="text-base font-bold text-[#444444]">₹{oldEff.toFixed(2)}/km</p>
            </div>
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-[#444444]/50">PC</p>
              <p className="text-base font-bold text-[#444444]">{line.pc5 ? `₹${line.pc5.toFixed(2)}` : '—'}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#444444]/60 mb-1">Target MinG (₹/km)</label>
            <input type="number" step="0.01" value={targetMinG} onChange={(e) => setTargetMinG(e.target.value)}
              className="w-full bg-gray-50 text-[#444444] text-sm rounded-md px-3 py-2 border border-[rgba(68,68,68,0.15)]" />
            {target > 0 && (
              <p className="text-[10px] text-[#444444]/50 mt-1">
                Current: ₹{line.min_g.toFixed(2)} · New: ₹{target.toFixed(2)} · Delta: {(target - line.min_g) >= 0 ? '+' : ''}{(target - line.min_g).toFixed(2)}/km
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-[#444444]/60 mb-1">GST change?</label>
            <div className="flex gap-2">
              {[
                { label: 'No change', value: null },
                ...(line.gst_slab === 18 ? [{ label: '18% → 5%', value: 5 }] : []),
                ...(line.gst_slab === 5 ? [{ label: '5% → 18%', value: 18 }] : []),
              ].map((opt) => (
                <button key={String(opt.value)} onClick={() => setNewGstSlab(opt.value)}
                  className={`px-3 py-1 rounded text-xs font-medium ${newGstSlab === opt.value ? 'bg-[#73D700] text-white' : 'bg-gray-100 text-[#444444] hover:bg-gray-200'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#444444]/60 mb-1">Buses affected</label>
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={line.buses} value={affectedBuses}
                onChange={(e) => setAffectedBuses(Math.min(line.buses, Math.max(1, parseInt(e.target.value) || line.buses)))}
                className="w-16 bg-gray-50 text-[#444444] text-sm rounded-md px-2 py-2 border border-[rgba(68,68,68,0.15)] text-center" />
              <span className="text-xs text-[#444444]/50">of {line.buses} total</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-[#444444]/60 mb-1">Initiated by</label>
            <input type="text" value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Your name"
              className="w-full bg-gray-50 text-[#444444] text-sm rounded-md px-3 py-2 border border-[rgba(68,68,68,0.15)]" />
          </div>
          <div>
            <label className="block text-xs text-[#444444]/60 mb-1">Notes</label>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Context, reason..."
              className="w-full bg-gray-50 text-[#444444] text-xs rounded-md px-3 py-2 border border-[rgba(68,68,68,0.15)] resize-none" />
          </div>

          {target > 0 && (
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-wider text-[#444444]/50">Computed impact</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-[#444444]/50">New effective MinG</p>
                  <p className={`text-base font-bold ${newEff < oldEff ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>₹{newEff.toFixed(2)}/km</p>
                </div>
                <div>
                  <p className="text-[#444444]/50">Total saving</p>
                  <p className={`text-base font-bold ${totalDelta < 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
                    {totalDelta < 0 ? '' : '+'}{totalDelta.toFixed(2)}/km
                  </p>
                </div>
                <div>
                  <p className="text-[#444444]/50">Monthly saving</p>
                  <p className="text-sm font-semibold text-[#444444]">{monthlySavingL.toFixed(1)}L/mo</p>
                </div>
                <div>
                  <p className="text-[#444444]/50">Annual saving</p>
                  <p className="text-sm font-semibold text-[#444444]">{(monthlySavingL * 12).toFixed(1)}L/yr</p>
                </div>
              </div>
              {newGstSlab != null && (
                <p className="text-[10px] text-[#444444]/50 pt-1 border-t border-[rgba(68,68,68,0.1)]">
                  GST: {line.gst_slab}% → {newGstSlab}% · MinG delta: {(target - line.min_g).toFixed(2)}/km · GST delta: {(totalDelta - (target - line.min_g)).toFixed(2)}/km
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-[#444444]">Cancel</button>
            <button
              onClick={() => {
                if (!target || target <= 0) { alert('Enter a valid target MinG'); return }
                onSubmit({ line, targetMinG: target, newGstSlab, affectedBuses, owner, notes })
              }}
              className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[#73D700] text-white"
            >
              Save & add to pipeline
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
