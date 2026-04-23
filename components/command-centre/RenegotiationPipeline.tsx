'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Bl2Line } from '@/lib/cost-utils'
import { effectiveMinG, deltaVsPc5, computeHealthVsPc5 } from '@/lib/cost-utils'
import AddRenegotiationForm from './AddRenegotiationForm'

interface Renegotiation {
  id: number
  line_id: string
  line_name: string
  partner: string
  region: string
  current_min_g: number
  target_min_g: number
  old_min_g: number | null
  old_gst_slab: number | null
  new_gst_slab: number | null
  new_ming: number | null
  status: string
  priority_score: number
  monthly_savings: number
  owner: string | null
  notes: any
  status_history: any[]
  status_changed_at: string | null
  affected_buses: number | null
  approved_by: string | null
  approval_note: string | null
  effective_at: string | null
  created_at: string
  updated_at: string
}

interface Impact {
  baselineMinG: number
  effectiveMinG: number
  agreedMinG: number
  pipelineMinG: number
  realisedImpact: number
  agreedImpact: number
  pipelineImpact: number
  effectiveMonthlySavingL: number
  effectiveCount: number
  agreedCount: number
  pipelineCount: number
}

const GM = (slab: number | null) => (slab ?? 5) === 18 ? 1.13 : 1.0
const fmtKm = (v: number) => `₹${v.toFixed(2)}/km`
const fmtL = (v: number) => `₹${Math.abs(v).toFixed(1)}L`

const STATUS_LABELS: Record<string, string> = {
  identified: 'Identified',
  proposed: 'Proposed',
  pitched: 'Pitched',
  in_discussion: 'In Discussion',
  agreed: 'Agreed',
  pending_approval: 'Pending Approval',
  effective: 'Effective',
  rejected: 'Rejected',
}

const STATUS_COLORS: Record<string, string> = {
  identified: 'bg-gray-200 text-[#444444]',
  proposed: 'bg-gray-200 text-[#444444]',
  pitched: 'bg-[#FFAD00]/20 text-[#444444]',
  in_discussion: 'bg-[#FFAD00]/30 text-[#444444]',
  agreed: 'bg-[#FFAD00] text-[#444444]',
  pending_approval: 'bg-[#FFAD00] text-[#444444]',
  effective: 'bg-[#73D700] text-white',
  rejected: 'bg-gray-300 text-[#444444]',
}

const NEXT_STATUS: Record<string, string> = {
  identified: 'proposed',
  proposed: 'in_discussion',
  pitched: 'in_discussion',
  in_discussion: 'agreed',
  agreed: 'pending_approval',
  pending_approval: 'effective',
}

interface Props {
  bl2Lines: Bl2Line[]
  onBl2Refresh: () => void
}

export default function RenegotiationPipeline({ bl2Lines, onBl2Refresh }: Props) {
  const [renegotiations, setRenegotiations] = useState<Renegotiation[]>([])
  const [impact, setImpact] = useState<Impact | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'active' | 'identified' | 'effective' | 'rejected'>('active')
  const [filterRegion, setFilterRegion] = useState('All')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [detailId, setDetailId] = useState<number | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [prefillLine, setPrefillLine] = useState<Bl2Line | null>(null)

  // Fetch renegotiations
  const fetchData = () => {
    fetch('/api/renegotiations')
      .then((r) => r.json())
      .then((d) => {
        setRenegotiations(d.renegotiations || [])
        setImpact(d.impact || null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }
  useEffect(() => { fetchData() }, [])

  // Transition status
  const moveToStatus = async (id: number, newStatus: string, extra?: Record<string, unknown>) => {
    const res = await fetch(`/api/renegotiations?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, ...extra }),
    })
    const result = await res.json()
    if (result.error) {
      alert(result.error)
      return
    }
    if (newStatus === 'effective' && result.bl2Updated) {
      onBl2Refresh()
    }
    fetchData()
  }

  // Delete
  const removeRenego = async (id: number) => {
    const rec = renegotiations.find((r) => r.id === id)
    const isEffective = rec?.status === 'effective'
    const msg = isEffective
      ? `Remove ${rec?.line_id}? This was effective — bl2.min_g will be reverted to ₹${rec?.old_min_g}.`
      : `Remove ${rec?.line_id}? This will permanently delete the record.`
    if (!confirm(msg)) return
    await fetch(`/api/renegotiations?id=${id}`, { method: 'DELETE' })
    if (isEffective) onBl2Refresh()
    fetchData()
  }

  // Identified lines (overpaying, not in pipeline)
  const activeLineIds = useMemo(
    () => new Set(renegotiations.filter((r) => !['rejected', 'effective'].includes(r.status)).map((r) => r.line_id)),
    [renegotiations],
  )
  const identifiedLines = useMemo(
    () => bl2Lines
      .filter((l) => {
        if (activeLineIds.has(l.line_id)) return false
        const d = deltaVsPc5(l.min_g, l.gst_slab, l.pc5)
        return d != null && d > 0 && l.pc5 != null && l.pc5 > 0
      })
      .sort((a, b) => {
        const da = deltaVsPc5(a.min_g, a.gst_slab, a.pc5) ?? 0
        const db = deltaVsPc5(b.min_g, b.gst_slab, b.pc5) ?? 0
        return db - da
      }),
    [bl2Lines, activeLineIds],
  )

  // Open the add form pre-filled with a bl2 line
  const startRenego = (l: Bl2Line) => {
    setPrefillLine(l)
    setShowAddForm(true)
  }

  // Submit the add form — creates record, closes form, switches tab
  const submitRenego = async (formData: {
    line: Bl2Line
    targetMinG: number
    newGstSlab: number | null
    affectedBuses: number | null
    owner: string
    notes: string
  }) => {
    const l = formData.line
    const eff = effectiveMinG(l.min_g, l.gst_slab)
    const newEff = formData.targetMinG * GM(formData.newGstSlab ?? l.gst_slab)
    const km = l.ow_km * l.rt * 2 * (formData.affectedBuses ?? l.buses)
    const saving = Math.max(0, eff - newEff) * km / 1e5

    const res = await fetch('/api/renegotiations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        line_id: l.line_id,
        line_name: l.line_name,
        partner: l.partner,
        region: l.region,
        current_min_g: l.min_g,
        target_min_g: formData.targetMinG,
        old_min_g: l.min_g,
        old_gst_slab: l.gst_slab,
        new_gst_slab: formData.newGstSlab,
        affected_buses: formData.affectedBuses,
        status: 'proposed',
        priority_score: 0,
        monthly_savings: saving,
        owner: formData.owner,
        notes: formData.notes,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      alert(`Error: ${err.error || 'Failed to create renegotiation'}`)
      return
    }
    setShowAddForm(false)
    setPrefillLine(null)
    await new Promise<void>((resolve) => {
      fetch('/api/renegotiations')
        .then((r) => r.json())
        .then((d) => { setRenegotiations(d.renegotiations || []); setImpact(d.impact || null) })
        .catch(() => {})
        .finally(() => resolve())
    })
    setActiveTab('active')
  }

  // Filter renegotiations by tab
  const tabRecs = useMemo(() => {
    let recs = renegotiations
    if (activeTab === 'active') recs = recs.filter((r) => !['rejected', 'effective'].includes(r.status))
    else if (activeTab === 'effective') recs = recs.filter((r) => r.status === 'effective')
    else if (activeTab === 'rejected') recs = recs.filter((r) => r.status === 'rejected')
    else if (activeTab === 'identified') return [] // use identifiedLines instead
    if (filterRegion !== 'All') recs = recs.filter((r) => r.region === filterRegion)
    return recs
  }, [renegotiations, activeTab, filterRegion])

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {}
    renegotiations.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1 })
    return c
  }, [renegotiations])

  if (loading) return <p className="text-[#444444]/50 text-sm animate-pulse">Loading pipeline...</p>

  return (
    <div className="space-y-4">
      {/* Pipeline KPIs */}
      {impact && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#444444]/50">Realised (effective)</p>
            <p className={`text-xl font-bold ${impact.realisedImpact < 0 ? 'text-[#73D700]' : 'text-[#444444]'}`}>
              {impact.realisedImpact < 0 ? '' : '+'}{impact.realisedImpact.toFixed(2)}/km
            </p>
            <p className="text-[10px] text-[#444444]/50">{impact.effectiveCount} lines · {fmtL(impact.effectiveMonthlySavingL)}/mo saved</p>
          </div>
          <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#444444]/50">If agreed lines close</p>
            <p className={`text-xl font-bold ${impact.agreedImpact < 0 ? 'text-[#73D700]' : 'text-[#444444]'}`}>
              {impact.agreedImpact < 0 ? '' : '+'}{impact.agreedImpact.toFixed(2)}/km
            </p>
            <p className="text-[10px] text-[#444444]/50">{impact.agreedCount} lines in agreed/pending/effective</p>
          </div>
          <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#444444]/50">Full pipeline potential</p>
            <p className={`text-xl font-bold ${impact.pipelineImpact < 0 ? 'text-[#73D700]' : 'text-[#444444]'}`}>
              {impact.pipelineImpact < 0 ? '' : '+'}{impact.pipelineImpact.toFixed(2)}/km
            </p>
            <p className="text-[10px] text-[#444444]/50">{impact.pipelineCount} lines in pipeline</p>
          </div>
        </div>
      )}

      {/* Funnel — Identified count from bl2 auto-flag, all others from renegotiations table */}
      <div className="flex items-center gap-1 text-[10px] text-[#444444]/60 flex-wrap">
        {['identified', 'proposed', 'in_discussion', 'agreed', 'pending_approval', 'effective'].map((s, i) => {
          // Identified = computed from bl2 (NOT from renegotiations table)
          const count = s === 'identified' ? identifiedLines.length : (statusCounts[s] || 0)
          return (
            <span key={s} className="flex items-center gap-1">
              {i > 0 && <span>›</span>}
              <span className={`px-1.5 py-0.5 rounded ${count > 0 ? 'font-semibold text-[#444444]' : ''}`}>
                {STATUS_LABELS[s]}({count})
              </span>
            </span>
          )
        })}
        <span className="ml-2 text-[#444444]/40">| Rejected({statusCounts['rejected'] || 0})</span>
      </div>

      {/* Tabs + filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['active', 'identified', 'effective', 'rejected'] as const).map((t) => {
          const count = t === 'active'
            ? renegotiations.filter((r) => !['rejected', 'effective'].includes(r.status)).length
            : t === 'identified' ? identifiedLines.length
            : t === 'effective' ? (statusCounts['effective'] || 0)
            : (statusCounts['rejected'] || 0)
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-3 py-1 rounded text-xs font-medium ${
                activeTab === t ? 'bg-[#73D700] text-white' : 'bg-gray-100 text-[#444444] hover:bg-gray-200'
              }`}
            >
              {t === 'active' ? 'Active' : t === 'identified' ? 'Identified' : t === 'effective' ? 'Effective' : 'Rejected'} ({count})
            </button>
          )
        })}
        <span className="mx-1 text-gray-300">|</span>
        {['All', 'N', 'S', 'W'].map((r) => (
          <button
            key={r}
            onClick={() => setFilterRegion(r)}
            className={`px-2 py-1 rounded text-[10px] font-medium ${
              filterRegion === r ? 'bg-[#73D700] text-white' : 'bg-gray-100 text-[#444444]'
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Identified tab — BD opportunity queue */}
      {activeTab === 'identified' && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#444444]/50 border-b border-gray-200">
                <th className="text-left pb-1 pr-2">Line</th>
                <th className="text-left pb-1 pr-2">Partner</th>
                <th className="text-right pb-1 pr-2">MinG</th>
                <th className="text-right pb-1 pr-2">Eff. MinG</th>
                <th className="text-right pb-1 pr-2">PC</th>
                <th className="text-right pb-1 pr-2">Delta%</th>
                <th className="text-center pb-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {identifiedLines.slice(0, 50).map((l) => {
                const eff = effectiveMinG(l.min_g, l.gst_slab)
                const d = deltaVsPc5(l.min_g, l.gst_slab, l.pc5)
                return (
                  <tr key={l.line_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-1.5 pr-2 font-mono">{l.line_id}</td>
                    <td className="py-1.5 pr-2">{l.partner}</td>
                    <td className="py-1.5 pr-2 text-right">₹{l.min_g.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right text-[#FFAD00]">₹{eff.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-right">{l.pc5 ? `₹${l.pc5.toFixed(2)}` : '—'}</td>
                    <td className="py-1.5 pr-2 text-right text-[#FFAD00]">+{d?.toFixed(1)}%</td>
                    <td className="py-1.5 text-center">
                      <button
                        onClick={() => startRenego(l)}
                        className="px-2 py-0.5 rounded text-[9px] font-medium bg-[#73D700] text-white"
                      >
                        Start
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-[#444444]/40 mt-2">{identifiedLines.length} overpaying lines not in pipeline</p>
        </div>
      )}

      {/* Active / Effective / Rejected table */}
      {activeTab !== 'identified' && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[#444444]/50 border-b border-gray-200">
                <th className="text-left pb-1 pr-2">Line</th>
                <th className="text-left pb-1 pr-2">Partner</th>
                <th className="text-right pb-1 pr-2">Cur. eff.</th>
                <th className="text-center pb-1 pr-2">→</th>
                <th className="text-right pb-1 pr-2">New eff.</th>
                <th className="text-right pb-1 pr-2">Saving/km</th>
                <th className="text-right pb-1 pr-2">₹L/mo</th>
                <th className="text-center pb-1 pr-2">GST</th>
                <th className="text-center pb-1 pr-2">Status</th>
                <th className="text-center pb-1">Action</th>
              </tr>
            </thead>
            <tbody>
              {tabRecs.map((r) => {
                const oldEff = (r.old_min_g ?? r.current_min_g) * GM(r.old_gst_slab)
                const newEff = (r.target_min_g) * GM(r.new_gst_slab ?? r.old_gst_slab)
                const savKm = newEff - oldEff
                const line = bl2Lines.find((l) => l.line_id === r.line_id)
                const buses = r.affected_buses ?? line?.buses ?? 1
                const km = line ? line.ow_km * line.rt * 2 * buses : 0
                const savL = Math.abs(savKm) * km / 1e5
                const gstChanged = r.new_gst_slab != null && r.new_gst_slab !== r.old_gst_slab
                const next = NEXT_STATUS[r.status]

                return (
                  <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-1.5 pr-2 font-mono">{r.line_id}</td>
                    <td className="py-1.5 pr-2 max-w-[100px] truncate">{r.partner}</td>
                    <td className="py-1.5 pr-2 text-right">₹{oldEff.toFixed(2)}</td>
                    <td className="py-1.5 pr-2 text-center text-[#444444]/30">→</td>
                    <td className="py-1.5 pr-2 text-right text-[#73D700]">₹{newEff.toFixed(2)}</td>
                    <td className={`py-1.5 pr-2 text-right font-medium ${savKm < 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
                      {savKm < 0 ? '' : '+'}{savKm.toFixed(2)}
                    </td>
                    <td className={`py-1.5 pr-2 text-right ${savKm < 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
                      {fmtL(savL)}
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      {gstChanged ? (
                        <span className="px-1 py-0.5 rounded text-[8px] font-medium bg-[#FFAD00]/15 text-[#FFAD00] border border-[#FFAD00]">
                          {r.old_gst_slab}→{r.new_gst_slab}%
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-1.5 pr-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${STATUS_COLORS[r.status] || ''}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="py-1.5 text-center">
                      <div className="flex items-center gap-1 justify-center">
                        {next && r.status !== 'effective' && (
                          <button
                            onClick={() => {
                              if (next === 'effective') {
                                const approver = prompt('Approved by:')
                                if (!approver) return
                                moveToStatus(r.id, next, { approved_by: approver })
                              } else {
                                moveToStatus(r.id, next)
                              }
                            }}
                            className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[#73D700] text-white"
                          >
                            {next === 'effective' ? 'Approve' : '▶'}
                          </button>
                        )}
                        {r.status !== 'effective' && r.status !== 'rejected' && (
                          <button
                            onClick={() => moveToStatus(r.id, 'rejected')}
                            className="px-1.5 py-0.5 rounded text-[9px] bg-gray-100 text-[#444444]"
                          >
                            ✕
                          </button>
                        )}
                        {r.status === 'rejected' && (
                          <button
                            onClick={() => moveToStatus(r.id, 'proposed')}
                            className="px-1.5 py-0.5 rounded text-[9px] bg-gray-100 text-[#444444]"
                          >
                            Reopen
                          </button>
                        )}
                        <button
                          onClick={() => removeRenego(r.id)}
                          className="px-1 py-0.5 rounded text-[9px] text-[#444444]/40 hover:text-[#FFAD00]"
                          title="Remove"
                        >
                          ⋯
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {tabRecs.length === 0 && (
            <p className="text-center text-[#444444]/40 text-xs py-4">No records</p>
          )}
        </div>
      )}
      {/* Add renegotiation slide-over form (shared component) */}
      {showAddForm && prefillLine && (
        <AddRenegotiationForm
          line={prefillLine}
          onSubmit={submitRenego}
          onCancel={() => { setShowAddForm(false); setPrefillLine(null) }}
        />
      )}
    </div>
  )
}

