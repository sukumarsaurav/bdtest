'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Bl2Line } from '@/lib/cost-utils'

interface TargetRow {
  id?: number
  line_code: string
  line_name: string
  partner: string
  region: string
  gst_slab: number
  current_min_g: number
  target_min_g: number | null
  health: string
  note?: string
}

interface Props {
  blLines: Bl2Line[]
}

function lineHealth(minG: number, target: number, gstSlab?: number): 'healthy' | 'marginal' | 'overpaying' {
  if (!target || target === 0) return 'overpaying'
  // Apply 13% GST impact for 18% partners, same as Fleet Health
  const effMinG = gstSlab === 18 ? minG * 1.13 : minG
  const delta = (effMinG - target) / target * 100
  if (delta < 0) return 'healthy'
  if (delta <= 1) return 'marginal'
  return 'overpaying'
}

const HEALTH_BADGE: Record<string, { bg: string; text: string; label: string; border?: string }> = {
  healthy:    { bg: 'bg-[#73D700]', text: 'text-white', label: 'Healthy' },
  marginal:   { bg: 'bg-[#FFAD00]/15', text: 'text-[#444444]', label: 'Marginal', border: 'border border-[#FFAD00]' },
  overpaying: { bg: 'bg-[#FFAD00]', text: 'text-[#444444]', label: 'Overpaying' },
  unknown:    { bg: 'bg-[#444444]/10', text: 'text-[#444444]', label: 'Unknown', border: 'border border-[#444444]/20' },
}

function bl2AsTargets(lines: Bl2Line[]): TargetRow[] {
  return lines.map((l) => ({
    line_code: l.line_id,
    line_name: l.line_name,
    partner: l.partner,
    region: l.region,
    gst_slab: l.gst_slab,
    current_min_g: l.min_g,
    target_min_g: l.pc5,
    health: l.health,
  }))
}

export default function AnalyticsTargets({ blLines }: Props) {
  const [targets, setTargets] = useState<TargetRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [filterHealth, setFilterHealth] = useState<string>('All')
  const [filterRegion, setFilterRegion] = useState<string>('All')

  // Fetch or auto-seed targets
  useEffect(() => {
    fetch('/api/analytics-targets')
      .then((r) => r.json())
      .then(async (data) => {
        if (Array.isArray(data) && data.length > 0) {
          setTargets(data)
          setLoading(false)
          return
        }

        // Auto-seed from bl2 lines
        if (blLines.length === 0) {
          setTargets([])
          setLoading(false)
          return
        }

        setSeeding(true)
        const seedRows = blLines.map((l) => ({
          line_code: l.line_id,
          line_name: l.line_name,
          partner: l.partner,
          region: l.region,
          gst_slab: l.gst_slab,
          current_min_g: l.min_g,
          target_min_g: l.pc5,
          health: l.health,
        }))

        // Batch in chunks of 50
        for (let i = 0; i < seedRows.length; i += 50) {
          await fetch('/api/analytics-targets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(seedRows.slice(i, i + 50)),
          }).catch(() => {})
        }

        // Re-fetch — if still empty (table doesn't exist), fall back to bl2 in-memory
        const refreshed = await fetch('/api/analytics-targets').then((r) => r.json()).catch(() => [])
        const refreshedArr = Array.isArray(refreshed) ? refreshed : []
        if (refreshedArr.length > 0) {
          setTargets(refreshedArr)
        } else {
          // Table likely doesn't exist — show bl2 lines directly from memory
          setTargets(bl2AsTargets(blLines))
        }
        setSeeding(false)
        setLoading(false)
      })
      .catch(() => {
        setTargets(bl2AsTargets(blLines))
        setLoading(false)
      })
  }, [blLines])

  const filtered = useMemo(() => {
    if (!targets) return []
    return targets.filter((t) => {
      if (filterHealth !== 'All') {
        const h = t.target_min_g ? lineHealth(t.current_min_g, t.target_min_g, t.gst_slab) : 'unknown'
        if (h !== filterHealth.toLowerCase()) return false
      }
      if (filterRegion !== 'All' && t.region !== filterRegion) return false
      return true
    })
  }, [targets, filterHealth, filterRegion])

  // Fleet summary
  const summary = useMemo(() => {
    if (!targets?.length) return null
    const withTarget = targets.filter((t) => t.target_min_g != null && t.target_min_g > 0)
    const healthy = withTarget.filter((t) => lineHealth(t.current_min_g, t.target_min_g!, t.gst_slab) === 'healthy').length
    const marginal = withTarget.filter((t) => lineHealth(t.current_min_g, t.target_min_g!, t.gst_slab) === 'marginal').length
    const overpaying = withTarget.filter((t) => lineHealth(t.current_min_g, t.target_min_g!, t.gst_slab) === 'overpaying').length
    const total = withTarget.length
    return { healthy, marginal, overpaying, total, unknown: targets.length - total }
  }, [targets])

  const handleSave = async (lineCode: string) => {
    const val = parseFloat(editValue)
    if (isNaN(val) || val <= 0) return
    const t = targets?.find((t) => t.line_code === lineCode)
    if (!t?.id) return

    await fetch(`/api/analytics-targets?id=${t.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_min_g: val }),
    }).catch(() => {})

    setTargets((prev) =>
      prev?.map((r) => (r.line_code === lineCode ? { ...r, target_min_g: val } : r)) ?? null,
    )
    setEditingId(null)
  }

  const handleResetToPC = async (lineCode: string) => {
    const bl2 = blLines.find((l) => l.line_id === lineCode)
    if (!bl2) return
    const pcTarget = bl2.pc5
    if (pcTarget == null) return
    const t = targets?.find((t) => t.line_code === lineCode)
    if (t?.id) {
      await fetch(`/api/analytics-targets?id=${t.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_min_g: pcTarget }),
      }).catch(() => {})
    }
    setTargets((prev) =>
      prev?.map((r) => (r.line_code === lineCode ? { ...r, target_min_g: pcTarget } : r)) ?? null,
    )
  }

  if (loading) {
    return (
      <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-5">
        <p className="text-sm text-[#444444]/60 animate-pulse">
          {seeding ? 'Auto-seeding 125 line targets from production cost baseline...' : 'Loading targets...'}
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#444444]/80">
          Line targets · {targets?.length ?? 0} lines · Pre-set to Production Cost
        </h2>
      </div>

      {/* Fleet summary */}
      {summary && (
        <div className="flex gap-3 text-xs mb-4">
          <span className="text-[#73D700] font-semibold">{summary.healthy} healthy ({summary.total > 0 ? ((summary.healthy / summary.total) * 100).toFixed(0) : 0}%)</span>
          <span className="text-[#FFAD00] font-semibold">{summary.marginal} marginal ({summary.total > 0 ? ((summary.marginal / summary.total) * 100).toFixed(0) : 0}%)</span>
          <span className="text-[#FFAD00] font-semibold">{summary.overpaying} overpaying ({summary.total > 0 ? ((summary.overpaying / summary.total) * 100).toFixed(0) : 0}%)</span>
          {summary.unknown > 0 && <span className="text-[#444444]/60">{summary.unknown} no PC</span>}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-3">
        {['All', 'Healthy', 'Marginal', 'Overpaying'].map((h) => (
          <button
            key={h}
            onClick={() => setFilterHealth(h)}
            className={`px-2 py-1 rounded text-[10px] font-medium ${filterHealth === h ? 'bg-[#73D700] text-[#444444]' : 'bg-gray-100 text-[#444444] hover:bg-gray-200'}`}
          >
            {h}
          </button>
        ))}
        <span className="mx-1 text-gray-600">|</span>
        {['All', 'N', 'S', 'W'].map((r) => (
          <button
            key={r}
            onClick={() => setFilterRegion(r)}
            className={`px-2 py-1 rounded text-[10px] font-medium ${filterRegion === r ? 'bg-[#73D700] text-[#444444]' : 'bg-gray-100 text-[#444444] hover:bg-gray-200'}`}
          >
            {r === 'All' ? 'All' : r}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white">
            <tr className="text-[#444444]/60 border-b border-[rgba(68,68,68,0.15)]">
              <th className="pb-1 pr-2 text-left">Line</th>
              <th className="pb-1 pr-2 text-left">Partner</th>
              <th className="pb-1 pr-2 text-center">GST</th>
              <th className="pb-1 pr-2 text-right">Target (PC)</th>
              <th className="pb-1 pr-2 text-right">Current MinG</th>
              <th className="pb-1 pr-2 text-right">Delta%</th>
              <th className="pb-1 pr-2 text-center">Health</th>
              <th className="pb-1 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const effMinG = t.gst_slab === 18 ? t.current_min_g * 1.13 : t.current_min_g
              const delta = t.target_min_g != null && t.target_min_g > 0
                ? ((effMinG - t.target_min_g) / t.target_min_g) * 100
                : null
              const health = t.target_min_g != null && t.target_min_g > 0
                ? lineHealth(t.current_min_g, t.target_min_g, t.gst_slab)
                : 'unknown'
              const badge = HEALTH_BADGE[health]
              const isEditing = editingId === t.line_code

              return (
                <tr key={t.line_code} className="border-b border-[rgba(68,68,68,0.15)]/40 hover:bg-gray-100/30">
                  <td className="py-1.5 pr-2 font-mono">{t.line_code}</td>
                  <td className="py-1.5 pr-2 max-w-[120px] truncate">{t.partner}</td>
                  <td className="py-1.5 pr-2 text-center">{t.gst_slab}%</td>
                  <td className="py-1.5 pr-2 text-right">
                    {isEditing ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleSave(t.line_code)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSave(t.line_code)}
                        className="w-20 bg-gray-50 text-[#444444] text-xs rounded px-1.5 py-0.5 border border-[#73D700]/50 text-right"
                      />
                    ) : (
                      t.target_min_g != null ? `₹${t.target_min_g.toFixed(2)}` : '—'
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right">₹{t.current_min_g.toFixed(2)}</td>
                  <td className={`py-1.5 pr-2 text-right font-semibold ${delta != null ? (delta > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]') : 'text-[#444444]/50'}`}>
                    {delta != null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : '—'}
                  </td>
                  <td className="py-1.5 pr-2 text-center">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${badge.bg} ${badge.text} ${badge.border || ''}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="py-1.5 text-center">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => {
                          setEditingId(t.line_code)
                          setEditValue(t.target_min_g?.toFixed(2) ?? '')
                        }}
                        className="px-1.5 py-0.5 rounded text-[9px] bg-gray-100 text-[#444444] hover:bg-gray-200 border border-gray-200"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleResetToPC(t.line_code)}
                        className="px-1.5 py-0.5 rounded text-[9px] bg-gray-100 text-[#444444] hover:bg-gray-200 border border-gray-200"
                      >
                        Reset
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
