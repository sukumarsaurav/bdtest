'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Line } from '@/types'
import { fmtINR, fmtPct, fmtLakhs, fmtCr } from '@/lib/formatters'
import AddRenegotiationForm from '@/components/command-centre/AddRenegotiationForm'
import type { Bl2Line } from '@/lib/cost-utils'
import { effectiveMinG } from '@/lib/cost-utils'

interface OptimisationRow {
  line: Line
  currentMinG: number
  targetMinG: number
  monthlySavings: number
  delta: number
  priority: number
}

interface BdAction {
  id?: number
  line_id: string
  status: 'open' | 'in_progress' | 'closed' | 'won' | 'lost'
  notes?: string
  owner?: string
  monthly_savings?: number
  priority_score?: number
}

const STATUS_OPTIONS: BdAction['status'][] = ['open', 'in_progress', 'won', 'lost', 'closed']
const STATUS_COLOR: Record<BdAction['status'], string> = {
  open: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
  in_progress: 'bg-[#444444]/10 dark:bg-[#444444]/40 text-[#444444] dark:text-[#444444]/60',
  won: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  lost: 'bg-[#FFAD00]/10 dark:bg-[#FFAD00]/20 text-[#FFAD00] dark:text-[#FFAD00]',
  closed: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
}

export default function BDOptimisation() {
  const allLines = useStore((s) => s.lines)
  const activeRegion = useStore((s) => s.activeRegion)
  const lines = useMemo(() => activeRegion === 'all' ? allLines : allLines.filter((l: any) => l.region === activeRegion), [allLines, activeRegion])
  const [groupBy, setGroupBy] = useState<'line' | 'partner'>('line')
  const [actions, setActions] = useState<Map<string, BdAction>>(new Map())
  const [tableMissing, setTableMissing] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [prefillLine, setPrefillLine] = useState<Bl2Line | null>(null)
  const [renegotiations, setRenegotiations] = useState<any[]>([])

  // Fetch active renegotiation pipeline to filter out lines already in pipeline
  useEffect(() => {
    fetch('/api/renegotiations')
      .then((r) => r.json())
      .then((d) => setRenegotiations(d.renegotiations || []))
      .catch(() => {})
  }, [])

  const activeRenegoLineIds = useMemo(
    () => new Set(renegotiations.filter((r: any) => r.status !== 'rejected').map((r: any) => r.line_id)),
    [renegotiations],
  )

  async function fetchActions() {
    try {
      const res = await fetch('/api/bd-actions')
      const data = await res.json()
      if (Array.isArray(data)) {
        setActions(new Map(data.map((a: BdAction) => [a.line_id, a])))
        setTableMissing(false)
      }
    } catch {
      setActions(new Map())
    }
  }

  useEffect(() => { fetchActions() }, [])

  const recommendations = useMemo<OptimisationRow[]>(() => {
    const rows: OptimisationRow[] = []
    lines.forEach((line) => {
      if (line.pc5 == null || line.pc5 === 0) return
      // Skip lines already in renegotiation pipeline
      if (activeRenegoLineIds.has(line.code)) return
      const effMinG = line.gst === 18 ? line.minG * 1.13 : line.minG
      const delta = ((effMinG - line.pc5) / line.pc5) * 100
      if (delta <= 0) return
      const targetMinG = +(line.pc5 * 1.02).toFixed(2)
      const currentMonthlyKm = line.owKm * 2 * line.rt * line.buses
      const savPerKm = Math.max(0, effMinG - targetMinG)
      const monthlySavings = +(savPerKm * currentMonthlyKm / 100000).toFixed(2)
      if (monthlySavings > 0) {
        // Line age from startDate
        const lineAge = line.startDate
          ? +((Date.now() - new Date(line.startDate).getTime()) / (365.25 * 86400000)).toFixed(1)
          : null
        const priority = +(monthlySavings * Math.min(50, delta)).toFixed(0)
        rows.push({
          line,
          currentMinG: line.minG,
          targetMinG,
          monthlySavings,
          delta,
          priority,
          lineAge,
        } as OptimisationRow & { lineAge: number | null })
      }
    })

    // Weighted priority: delta 60% + age 40% (normalized)
    if (rows.length > 0) {
      const maxDelta = Math.max(...rows.map(r => Math.abs(r.delta)))
      const maxAge = Math.max(...rows.map(r => (r as any).lineAge ?? 0))
      rows.forEach(r => {
        const deltaNorm = maxDelta > 0 ? Math.abs(r.delta) / maxDelta : 0
        const ageRaw = (r as any).lineAge ?? 0
        const ageNorm = maxAge > 0 ? Math.max(ageRaw, 0.25) / maxAge : 0
        r.priority = +(deltaNorm * 0.6 + ageNorm * 0.4).toFixed(2)
      })
    }

    return rows.sort((a, b) => b.priority - a.priority)
  }, [lines, activeRenegoLineIds])

  const totalSavings = recommendations.reduce((s, r) => s + r.monthlySavings, 0)
  const annualSavings = totalSavings * 12

  // Group by partner if requested
  const partnerRollup = useMemo(() => {
    const map = new Map<string, { partner: string; lineCount: number; totalSavings: number; rows: OptimisationRow[] }>()
    recommendations.forEach((r) => {
      const k = r.line.partner
      if (!map.has(k)) map.set(k, { partner: k, lineCount: 0, totalSavings: 0, rows: [] })
      const entry = map.get(k)!
      entry.lineCount++
      entry.totalSavings += r.monthlySavings
      entry.rows.push(r)
    })
    return Array.from(map.values()).sort((a, b) => b.totalSavings - a.totalSavings)
  }, [recommendations])

  async function updateStatus(lineId: string, newStatus: BdAction['status'], r: OptimisationRow) {
    const existing = actions.get(lineId)
    const body = {
      line_id: lineId,
      line_name: r.line.route,
      partner: r.line.partner,
      region: r.line.region,
      status: newStatus,
      priority_score: r.priority,
      monthly_savings: r.monthlySavings,
    }
    try {
      const res = await fetch('/api/bd-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.status === 503) {
        setTableMissing(true)
        return
      }
      if (res.ok) {
        const saved = await res.json()
        setActions((m) => {
          const next = new Map(m)
          next.set(lineId, saved)
          return next
        })
      }
    } catch {}
  }

  if (recommendations.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6 text-center border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-[#444444] dark:text-white mb-2">BD Optimisation</h3>
        <p className="text-gray-500 dark:text-gray-400 text-sm">
          No lines with significant overpay detected (delta &gt; -3%). All lines within margin.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Big summary banner */}
      <div className="rounded-xl bg-gradient-to-br from-[#444444] to-[#1a2a4a] text-white p-6 shadow">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-[#73D700]">BD Renegotiation Headroom</div>
            <div className="mt-1 text-3xl font-bold">{fmtCr(annualSavings)}<span className="text-base font-normal text-gray-300"> / year</span></div>
            <div className="text-sm text-gray-300 mt-1">
              {fmtLakhs(totalSavings)}/mo across <strong className="text-white">{recommendations.length}</strong> lines · <strong className="text-white">{new Set(recommendations.map(r => r.line.partner)).size}</strong> partners · target <strong className="text-white">PC + 2%</strong>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Group by:</span>
            <button
              onClick={() => setGroupBy('line')}
              className={`px-3 py-1.5 rounded-md font-medium ${groupBy === 'line' ? 'bg-[#73D700] text-[#444444]' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              Line
            </button>
            <button
              onClick={() => setGroupBy('partner')}
              className={`px-3 py-1.5 rounded-md font-medium ${groupBy === 'partner' ? 'bg-[#73D700] text-[#444444]' : 'bg-white/10 text-white hover:bg-white/20'}`}
            >
              Partner
            </button>
          </div>
        </div>
      </div>

      {tableMissing && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
          Status tracking is unavailable until <code>bd_actions</code> table is created. Run <code>supabase/migrations/002_bd_actions.sql</code> to enable.
        </div>
      )}

      {groupBy === 'partner' ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-[#444444] dark:text-white">Renegotiation by partner</h3>
          </div>
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 uppercase">Partner</th>
                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase"># Lines flagged</th>
                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">Savings/mo</th>
                <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">Savings/yr</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {partnerRollup.map((p) => (
                <tr key={p.partner} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-3 py-2 font-medium text-[#444444] dark:text-white">{p.partner}</td>
                  <td className="px-3 py-2 text-right dark:text-gray-200">{p.lineCount}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#73D700]">{fmtLakhs(p.totalSavings)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#73D700]">{fmtCr(p.totalSavings * 12)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
              <tr>
                <td className="px-3 py-2 text-right text-[#444444] dark:text-white" colSpan={2}>Total</td>
                <td className="px-3 py-2 text-right text-[#73D700]">{fmtLakhs(totalSavings)}</td>
                <td className="px-3 py-2 text-right text-[#73D700]">{fmtCr(annualSavings)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-100 dark:border-gray-800 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800">
            <h3 className="text-sm font-semibold text-[#444444] dark:text-white">
              Lines flagged for renegotiation
              <span className="ml-2 text-xs text-gray-400">(sorted by priority score)</span>
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 uppercase">Priority</th>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 uppercase">Code</th>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 uppercase">Route</th>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 uppercase">Partner</th>
                  <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">MinG</th>
                  <th className="px-3 py-2 text-right text-[#FFAD00] uppercase">MinG + Impact</th>
                  <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">Δ%</th>
                  <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">PC</th>
                  <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">Target</th>
                  <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 uppercase">Savings/mo</th>
                  <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {recommendations.map((r) => {
                  const action = actions.get(r.line.code)
                  const status = action?.status ?? 'open'
                  return (
                    <tr key={r.line.code} className="hover:bg-[#FFAD00]/10/50 dark:hover:bg-[#FFAD00]/10">
                      <td className="px-3 py-2 font-mono text-[#444444] dark:text-white">{r.priority}</td>
                      <td className="px-3 py-2 font-mono dark:text-gray-200">{r.line.code}</td>
                      <td className="px-3 py-2 max-w-[200px] truncate dark:text-gray-200">{r.line.route}</td>
                      <td className="px-3 py-2 dark:text-gray-200">{r.line.partner}</td>
                      <td className="px-3 py-2 text-right dark:text-gray-200">{fmtINR(r.currentMinG, 2)}</td>
                      <td className="px-3 py-2 text-right text-[#FFAD00] font-medium">
                        {r.line.gst === 18 ? fmtINR(+(r.currentMinG * 1.13).toFixed(2), 2) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-[#FFAD00] font-medium">{fmtPct(r.delta)}</td>
                      <td className="px-3 py-2 text-right dark:text-gray-200">{r.line.pc5 ? fmtINR(r.line.pc5, 2) : '—'}</td>
                      <td className="px-3 py-2 text-right text-[#73D700] font-medium">{fmtINR(r.targetMinG, 2)}</td>
                      <td className="px-3 py-2 text-right font-medium text-[#73D700]">{fmtLakhs(r.monthlySavings)}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => {
                            // Convert Line to Bl2Line shape for the shared form
                            const bl2: Bl2Line = {
                              line_id: r.line.code,
                              line_name: r.line.route,
                              partner: r.line.partner,
                              region: r.line.region,
                              buses: r.line.buses,
                              bus_type: r.line.type,
                              gst_slab: r.line.gst,
                              ow_km: r.line.owKm,
                              rt: r.line.rt,
                              min_g: r.line.minG,
                              pc5: r.line.pc5,
                              delta_pct: r.delta,
                              health: 'overpaying',
                              monthly_lakhs: r.line.monthly,
                              line_start_date: r.line.startDate ?? null,
                              line_end_date: null,
                            }
                            setPrefillLine(bl2)
                            setShowAddForm(true)
                          }}
                          className="px-2 py-1 rounded text-[9px] font-medium bg-[#73D700] text-white hover:bg-[#65c200]"
                        >
                          Start renego →
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-gray-50 dark:bg-gray-800 font-semibold">
                <tr>
                  <td colSpan={7} className="px-3 py-2 text-right text-[#444444] dark:text-white">Total potential savings</td>
                  <td className="px-3 py-2 text-right text-[#73D700]">{fmtLakhs(totalSavings)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {/* Add Renegotiation slide-over form (shared component) */}
      {showAddForm && prefillLine && (
        <AddRenegotiationForm
          line={prefillLine}
          onSubmit={async (formData) => {
            const l = formData.line
            const eff = effectiveMinG(l.min_g, l.gst_slab)
            const GM = (s: number) => s === 18 ? 1.13 : 1.0
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
                monthly_savings: saving,
                owner: formData.owner,
                notes: formData.notes,
              }),
            })
            if (!res.ok) {
              const err = await res.json().catch(() => ({ error: 'Unknown error' }))
              alert(`Error: ${err.error}`)
              return
            }
            // Refetch renegotiations to update the pipeline filter
            const rData = await fetch('/api/renegotiations').then(r => r.json()).catch(() => ({}))
            setRenegotiations(rData.renegotiations || [])
            setShowAddForm(false)
            setPrefillLine(null)
          }}
          onCancel={() => { setShowAddForm(false); setPrefillLine(null) }}
        />
      )}
    </div>
  )
}
