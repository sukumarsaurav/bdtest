'use client'

import { useState } from 'react'

const STAGES = [
  { key: 'identified', label: 'Identified', icon: '⚑' },
  { key: 'pitched', label: 'Pitched', icon: '📞' },
  { key: 'in_discussion', label: 'In Discussion', icon: '💬' },
  { key: 'accepted', label: 'Accepted', icon: '✓' },
  { key: 'effective', label: 'Effective', icon: '✅' },
] as const

interface LineData {
  lineId: string
  lineName: string
  partner: string
  region: string
  currentMinG: number
  suggestedTarget: number
  monthlySavingsL: number
}

interface Props {
  line: LineData
  existingRenego?: any // existing renegotiation record, if any
  onClose: () => void
  onSaved: () => void
}

export default function RenegotiationModal({ line, existingRenego, onClose, onSaved }: Props) {
  const currentStatus = existingRenego?.status || 'identified'
  const currentStageIdx = STAGES.findIndex((s) => s.key === currentStatus)

  const [saving, setSaving] = useState(false)
  const [targetMinG, setTargetMinG] = useState(
    existingRenego?.target_min_g?.toString() || line.suggestedTarget.toFixed(2),
  )
  const [owner, setOwner] = useState(existingRenego?.owner || '')
  const [notes, setNotes] = useState(existingRenego?.notes || '')
  const [agreedMinG, setAgreedMinG] = useState('')
  const [rejectedReason, setRejectedReason] = useState('')
  const [saved, setSaved] = useState(false)

  const handleSave = async (newStatus: string) => {
    setSaving(true)
    const target = parseFloat(targetMinG) || line.suggestedTarget
    const savings = ((line.currentMinG - target) * 100) // rough priority

    if (existingRenego?.id) {
      // PATCH existing
      await fetch(`/api/renegotiations?id=${existingRenego.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          target_min_g: target,
          owner,
          notes,
          ...(newStatus === 'accepted' && agreedMinG ? { new_ming: parseFloat(agreedMinG) } : {}),
          ...(newStatus === 'rejected' ? { rejected_reason: rejectedReason } : {}),
        }),
      }).catch(() => {})
    } else {
      // POST new
      await fetch('/api/renegotiations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          line_id: line.lineId,
          line_name: line.lineName,
          partner: line.partner,
          region: line.region,
          current_min_g: line.currentMinG,
          target_min_g: target,
          status: newStatus,
          priority_score: savings,
          monthly_savings: line.monthlySavingsL,
          owner,
          notes,
        }),
      }).catch(() => {})
    }

    setSaving(false)
    setSaved(true)
    setTimeout(() => {
      onSaved()
      onClose()
    }, 1000)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-lg font-semibold text-[#444444]">
                {existingRenego ? 'Update renegotiation' : 'Initiate renegotiation'}
              </h2>
              <p className="text-xs text-[#444444]/60 mt-1">
                {line.lineId} · {line.lineName} · {line.partner}
              </p>
            </div>
            <button onClick={onClose} className="text-[#444444]/60 hover:text-[#444444] text-xl">
              ×
            </button>
          </div>

          {/* Progress stepper */}
          <div className="flex items-center gap-1 mb-6">
            {STAGES.map((s, i) => (
              <div key={s.key} className="flex items-center flex-1">
                <div
                  className="flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium"
                  style={{
                    background: i <= currentStageIdx ? '#73D700' : i === currentStageIdx + 1 ? 'rgba(255,173,0,0.25)' : 'rgba(68,68,68,0.1)',
                    color: i <= currentStageIdx ? '#FFFFFF' : '#444444',
                    border: i === currentStageIdx + 1 ? '1px solid #FFAD00' : 'none',
                  }}
                >
                  {s.icon}
                </div>
                {i < STAGES.length - 1 && (
                  <div
                    className="flex-1 h-0.5 mx-1"
                    style={{ background: i < currentStageIdx ? '#73D700' : 'rgba(68,68,68,0.15)' }}
                  />
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[#444444]/50 mb-4 text-center">
            {STAGES.map((s) => s.label).join(' → ')}
          </p>

          {/* KPI summary */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-[#444444]/60">Current MinG</p>
              <p className="text-base font-bold text-[#444444]">₹{line.currentMinG.toFixed(2)}/km</p>
            </div>
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-[#444444]/60">Suggested (PC+2%)</p>
              <p className="text-base font-bold text-[#73D700]">₹{line.suggestedTarget.toFixed(2)}/km</p>
            </div>
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-[#444444]/60">Est. savings</p>
              <p className="text-base font-bold text-[#73D700]">₹{line.monthlySavingsL.toFixed(1)}L/mo</p>
            </div>
          </div>

          {/* Form fields */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-[#444444]/60 mb-1">Target MinG (₹/km)</label>
              <input
                type="number"
                step="0.01"
                value={targetMinG}
                onChange={(e) => setTargetMinG(e.target.value)}
                className="w-full bg-gray-50 text-[#444444] text-sm rounded-md px-3 py-2 border border-[rgba(68,68,68,0.15)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#444444]/60 mb-1">
                {currentStatus === 'identified' ? 'Initiated by' : 'Owner'}
              </label>
              <input
                type="text"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="Your name"
                className="w-full bg-gray-50 text-[#444444] text-sm rounded-md px-3 py-2 border border-[rgba(68,68,68,0.15)]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#444444]/60 mb-1">Notes</label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Context, BP reaction, next steps..."
                className="w-full bg-gray-50 text-[#444444] text-xs rounded-md px-3 py-2 border border-[rgba(68,68,68,0.15)] resize-none"
              />
            </div>

            {/* Accepted-specific field */}
            {currentStatus === 'in_discussion' && (
              <div>
                <label className="block text-xs text-[#444444]/60 mb-1">Agreed MinG (₹/km) — if accepting</label>
                <input
                  type="number"
                  step="0.01"
                  value={agreedMinG}
                  onChange={(e) => setAgreedMinG(e.target.value)}
                  placeholder={targetMinG}
                  className="w-full bg-gray-50 text-[#444444] text-sm rounded-md px-3 py-2 border border-[rgba(68,68,68,0.15)]"
                />
              </div>
            )}

            {/* Rejected reason */}
            {currentStatus === 'in_discussion' && (
              <div>
                <label className="block text-xs text-[#444444]/60 mb-1">Rejection reason (if rejecting)</label>
                <select
                  value={rejectedReason}
                  onChange={(e) => setRejectedReason(e.target.value)}
                  className="w-full bg-gray-50 text-[#444444] text-sm rounded-md px-3 py-2 border border-[rgba(68,68,68,0.15)]"
                >
                  <option value="">Select reason...</option>
                  <option value="rate_too_low">Rate too low for partner</option>
                  <option value="market_conditions">Market conditions</option>
                  <option value="partner_dispute">Partner dispute</option>
                  <option value="other">Other</option>
                </select>
              </div>
            )}
          </div>

          {/* Action buttons — context-sensitive by current stage */}
          <div className="flex gap-3 mt-6">
            {saved ? (
              <div className="flex-1 text-center py-2 text-[#73D700] font-semibold">✓ Saved</div>
            ) : (
              <>
                {currentStatus === 'identified' && (
                  <>
                    <button
                      onClick={() => handleSave('identified')}
                      disabled={saving}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-[#444444] border border-[rgba(68,68,68,0.15)]"
                    >
                      Save as Identified
                    </button>
                    <button
                      onClick={() => handleSave('pitched')}
                      disabled={saving || !owner}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[#73D700] text-white disabled:opacity-50"
                    >
                      Mark as Pitched
                    </button>
                  </>
                )}
                {currentStatus === 'pitched' && (
                  <button
                    onClick={() => handleSave('in_discussion')}
                    disabled={saving || !notes}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[#FFAD00] text-[#444444] disabled:opacity-50"
                  >
                    Move to In Discussion
                  </button>
                )}
                {currentStatus === 'in_discussion' && (
                  <>
                    <button
                      onClick={() => handleSave('accepted')}
                      disabled={saving}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[#73D700] text-white disabled:opacity-50"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleSave('rejected')}
                      disabled={saving || !rejectedReason}
                      className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-[#FFAD00] text-[#444444] disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}
                {currentStatus === 'accepted' && (
                  <button
                    onClick={() => handleSave('effective')}
                    disabled={saving}
                    className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-[#73D700] text-white disabled:opacity-50"
                  >
                    Mark Effective
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
