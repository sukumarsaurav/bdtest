'use client'

import { useEffect, useState, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { BASE_LINES } from '@/lib/baseline'
import { computeLineActuals } from '@/lib/metrics'
import { INDIA_MING_TARGET, fmtINR, fmtPct, fmtLakhs } from '@/lib/formatters'

type TargetType = 'MinG' | 'Utilisation' | 'Savings'
type TargetScope = 'Fleet' | 'Region' | 'Partner' | 'Line'

interface Target {
  id?: string
  type: TargetType
  scope: TargetScope
  scope_value?: string
  target_value: number
  target_date: string
  note: string
  created_at?: string
}

const baseByCode = Object.fromEntries(BASE_LINES.map((l) => [l.code, l]))

function ragColor(progress: number): { bg: string; text: string; bar: string } {
  if (progress >= 90) return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', bar: 'bg-[#73D700]' }
  if (progress >= 60) return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-[#FFAD00]', bar: 'bg-[#FFAD00]' }
  return { bg: 'bg-[#FFAD00]/10 dark:bg-[#FFAD00]/20', text: 'text-[#FFAD00]', bar: 'bg-[#FFAD00]' }
}

function ragLabel(progress: number): string {
  if (progress >= 90) return 'Green'
  if (progress >= 60) return 'Amber'
  return 'Red'
}

export default function Targets() {
  const allLines = useStore((s) => s.lines)
  const activeRegion = useStore((s) => s.activeRegion)
  const lines = useMemo(() => activeRegion === 'all' ? allLines : allLines.filter((l: any) => l.region === activeRegion), [allLines, activeRegion])
  const sheetData = useStore((s) => s.sheetData)

  const [targets, setTargets] = useState<Target[]>([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)

  // Form state
  const [formType, setFormType] = useState<TargetType>('MinG')
  const [formScope, setFormScope] = useState<TargetScope>('Fleet')
  const [formScopeValue, setFormScopeValue] = useState('')
  const [formTargetValue, setFormTargetValue] = useState('')
  const [formTargetDate, setFormTargetDate] = useState('')
  const [formNote, setFormNote] = useState('')
  const [saving, setSaving] = useState(false)

  const lineActuals = useMemo(() => {
    if (!sheetData) return []
    return computeLineActuals(sheetData.rows)
  }, [sheetData])

  // Scope value options
  const regions = ['N', 'S', 'W']
  const partners = useMemo(() => Array.from(new Set(lines.map((l) => l.partner))).sort(), [lines])
  const lineCodes = useMemo(() => lines.map((l) => l.code).sort(), [lines])

  async function fetchTargets() {
    try {
      const res = await fetch('/api/targets')
      if (!res.ok) throw new Error('fetch failed')
      const data = await res.json()
      if (data.error && data.error.includes('relation') && data.error.includes('does not exist')) {
        setTableError(true)
        setTargets([])
      } else if (Array.isArray(data)) {
        setTargets(data)
        setTableError(false)
      }
    } catch {
      setTableError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTargets()
  }, [])

  function resetForm() {
    setFormType('MinG')
    setFormScope('Fleet')
    setFormScopeValue('')
    setFormTargetValue('')
    setFormTargetDate('')
    setFormNote('')
    setEditId(null)
    setShowForm(false)
  }

  async function handleSave() {
    setSaving(true)
    const body: Record<string, unknown> = {
      type: formType,
      scope: formScope,
      scope_value: formScope === 'Fleet' ? null : formScopeValue,
      target_value: parseFloat(formTargetValue),
      target_date: formTargetDate || null,
      note: formNote || null,
    }

    try {
      if (editId) {
        await fetch(`/api/targets?id=${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      } else {
        await fetch('/api/targets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      }
      await fetchTargets()
      resetForm()
    } catch (err) {
      console.error('Save target error:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/targets?id=${id}`, { method: 'DELETE' })
    await fetchTargets()
  }

  function handleEdit(t: Target) {
    setFormType(t.type)
    setFormScope(t.scope)
    setFormScopeValue(t.scope_value ?? '')
    setFormTargetValue(String(t.target_value))
    setFormTargetDate(t.target_date ?? '')
    setFormNote(t.note ?? '')
    setEditId(t.id ?? null)
    setShowForm(true)
  }

  function computeCurrent(t: Target): number | null {
    if (t.type === 'MinG') {
      if (t.scope === 'Fleet') {
        if (lines.length === 0) return null
        return +(lines.reduce((s, l) => s + l.minG, 0) / lines.length).toFixed(2)
      }
      if (t.scope === 'Region') {
        const filtered = lines.filter((l) => l.region === t.scope_value)
        if (filtered.length === 0) return null
        return +(filtered.reduce((s, l) => s + l.minG, 0) / filtered.length).toFixed(2)
      }
      if (t.scope === 'Partner') {
        const filtered = lines.filter((l) => l.partner === t.scope_value)
        if (filtered.length === 0) return null
        return +(filtered.reduce((s, l) => s + l.minG, 0) / filtered.length).toFixed(2)
      }
      if (t.scope === 'Line') {
        const line = lines.find((l) => l.code === t.scope_value)
        return line?.minG ?? null
      }
    }
    if (t.type === 'Utilisation') {
      if (!sheetData || lineActuals.length === 0) return null
      if (t.scope === 'Fleet') {
        const totalActual = lineActuals.reduce((s, l) => s + l.busKm, 0)
        const totalContracted = lineActuals.reduce((s, l) => s + l.contractedWeeklyKm, 0)
        return totalContracted > 0 ? +((totalActual / totalContracted) * 100).toFixed(1) : null
      }
      const filtered = lineActuals.filter((l) => {
        if (t.scope === 'Region') return l.region === t.scope_value
        if (t.scope === 'Partner') return l.partner === t.scope_value
        if (t.scope === 'Line') return l.lineId === t.scope_value
        return false
      })
      if (filtered.length === 0) return null
      const totalActual = filtered.reduce((s, l) => s + l.busKm, 0)
      const totalContracted = filtered.reduce((s, l) => s + l.contractedWeeklyKm, 0)
      return totalContracted > 0 ? +((totalActual / totalContracted) * 100).toFixed(1) : null
    }
    if (t.type === 'Savings') {
      // Savings: sum deltaKm * minG for scope
      if (!sheetData || lineActuals.length === 0) return null
      let filtered = lineActuals
      if (t.scope === 'Region') filtered = filtered.filter((l) => l.region === t.scope_value)
      if (t.scope === 'Partner') filtered = filtered.filter((l) => l.partner === t.scope_value)
      if (t.scope === 'Line') filtered = filtered.filter((l) => l.lineId === t.scope_value)
      const savings = filtered.reduce((s, l) => {
        const base = baseByCode[l.lineId]
        if (!base) return s
        const contractedMonthlyKm = base.owKm * 2 * base.rt * base.buses
        const contractedWeeklyKm = contractedMonthlyKm / 4.33
        const delta = l.busKm - contractedWeeklyKm
        return s + (delta * base.minG) / 100000
      }, 0)
      return +(-savings).toFixed(1) // positive = Flix saves
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-4 border-[#73D700] border-t-transparent rounded-full" />
      </div>
    )
  }


  // Default fleet KPI targets (always shown, computed from current state)
  const defaultTargets = (() => {
    // 1. Fleet MinG vs INDIA_MING_TARGET (lower is better)
    const fleetMinG = lines.length === 0
      ? null
      : lines.reduce((s, l) => s + l.minG, 0) / lines.length

    // 2. Fleet utilisation vs 80%
    let fleetUtil: number | null = null
    if (lineActuals.length > 0) {
      const totA = lineActuals.reduce((s, l) => s + l.busKm, 0)
      const totC = lineActuals.reduce((s, l) => s + l.contractedWeeklyKm, 0)
      fleetUtil = totC > 0 ? (totA / totC) * 100 : null
    }

    // 3. Healthy share vs 60%
    const healthy = lines.filter((l) => (l.delta ?? -100) > 5).length
    const healthyPct = lines.length === 0 ? null : (healthy / lines.length) * 100

    // 4. BD opportunity (lower is better — target is 0)
    const bdSavings = lines.reduce((s, l) => {
      if (l.delta == null || l.delta >= -3 || l.pc5 == null) return s
      const target = (l.pc5 as number) * 1.02
      const km = l.owKm * 2 * l.rt * l.buses
      return s + Math.max(0, (l.minG - target) * km / 1e5)
    }, 0)

    return [
      {
        label: 'Fleet avg MinG',
        current: fleetMinG,
        target: INDIA_MING_TARGET,
        format: (v: number) => fmtINR(v, 1) + '/km',
        lowerBetter: true,
      },
      {
        label: 'Fleet utilisation',
        current: fleetUtil,
        target: 80,
        format: (v: number) => fmtPct(v),
        lowerBetter: false,
      },
      {
        label: 'Healthy lines share',
        current: healthyPct,
        target: 60,
        format: (v: number) => fmtPct(v),
        lowerBetter: false,
      },
      {
        label: 'BD opportunity',
        current: bdSavings,
        target: 0,
        format: (v: number) => fmtLakhs(v) + '/mo',
        lowerBetter: true,
      },
    ]
  })()

  return (
    <div className="space-y-6">
      {/* Default fleet KPI targets — always visible */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5 border border-gray-100 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-[#444444] dark:text-white mb-3">Default fleet KPI targets</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {defaultTargets.map((dt) => {
            let progress = 0
            let rag: 'red' | 'amber' | 'green' = 'red'
            if (dt.current != null) {
              if (dt.lowerBetter) {
                if (dt.target === 0) {
                  progress = dt.current <= 0 ? 100 : Math.max(0, 100 - dt.current * 2)
                  rag = dt.current <= 0 ? 'green' : dt.current < 25 ? 'amber' : 'red'
                } else {
                  progress = dt.current <= dt.target
                    ? 100
                    : Math.max(0, 100 - ((dt.current - dt.target) / dt.target) * 100)
                  rag = dt.current <= dt.target ? 'green'
                    : dt.current <= dt.target * 1.05 ? 'amber'
                    : 'red'
                }
              } else {
                progress = Math.min(100, (dt.current / dt.target) * 100)
                rag = dt.current >= dt.target ? 'green'
                  : dt.current >= dt.target * 0.9 ? 'amber'
                  : 'red'
              }
            }
            const barColor = rag === 'green' ? '#73D700' : rag === 'amber' ? '#FFAD00' : '#FFAD00'
            const ragLabel = rag === 'green' ? 'On track' : rag === 'amber' ? 'At risk' : 'Off track'
            return (
              <div key={dt.label} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="text-xs uppercase text-gray-500 dark:text-gray-400">{dt.label}</div>
                <div className="mt-1 flex items-baseline justify-between">
                  <div className="text-lg font-bold text-[#444444] dark:text-white">
                    {dt.current != null ? dt.format(dt.current) : '—'}
                  </div>
                  <div className="text-xs text-gray-400">target {dt.format(dt.target)}</div>
                </div>
                <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div className="h-1.5 rounded-full" style={{ width: `${progress}%`, backgroundColor: barColor }} />
                </div>
                <div className="mt-1 text-[10px] uppercase font-medium" style={{ color: barColor }}>{ragLabel}</div>
              </div>
            )
          })}
        </div>
      </div>

      {tableError && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 text-xs text-amber-800 dark:text-amber-200">
          Custom targets are unavailable until the Supabase <code>targets</code> table is created. Default fleet KPIs above are still computed locally.
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-[#444444] dark:text-white">Custom targets</h3>
        <button
          onClick={() => {
            if (showForm) resetForm()
            else setShowForm(true)
          }}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-[#73D700] text-[#444444] hover:bg-[#65bf00] transition-colors"
        >
          {showForm ? 'Cancel' : 'Add Target'}
        </button>
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-4 bg-white dark:bg-gray-900">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Type</label>
              <div className="flex gap-2">
                {(['MinG', 'Utilisation', 'Savings'] as TargetType[]).map((t) => (
                  <label key={t} className="flex items-center gap-1 text-sm">
                    <input
                      type="radio"
                      name="targetType"
                      value={t}
                      checked={formType === t}
                      onChange={() => setFormType(t)}
                      className="accent-[#73D700]"
                    />
                    {t}
                  </label>
                ))}
              </div>
            </div>

            {/* Scope */}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Scope</label>
              <select
                value={formScope}
                onChange={(e) => {
                  setFormScope(e.target.value as TargetScope)
                  setFormScopeValue('')
                }}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm"
              >
                <option value="Fleet">Fleet</option>
                <option value="Region">Region</option>
                <option value="Partner">Partner</option>
                <option value="Line">Line</option>
              </select>
            </div>

            {/* Scope value */}
            {formScope !== 'Fleet' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                  {formScope === 'Region' ? 'Region' : formScope === 'Partner' ? 'Partner' : 'Line'}
                </label>
                <select
                  value={formScopeValue}
                  onChange={(e) => setFormScopeValue(e.target.value)}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm"
                >
                  <option value="">Select...</option>
                  {formScope === 'Region' && regions.map((r) => <option key={r} value={r}>{r}</option>)}
                  {formScope === 'Partner' && partners.map((p) => <option key={p} value={p}>{p}</option>)}
                  {formScope === 'Line' && lineCodes.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target Value</label>
              <input
                type="number"
                value={formTargetValue}
                onChange={(e) => setFormTargetValue(e.target.value)}
                placeholder={formType === 'MinG' ? 'e.g. 55' : formType === 'Utilisation' ? 'e.g. 90' : 'e.g. 5'}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Target Date</label>
              <input
                type="date"
                value={formTargetDate}
                onChange={(e) => setFormTargetDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Note</label>
              <input
                type="text"
                value={formNote}
                onChange={(e) => setFormNote(e.target.value)}
                placeholder="Optional note"
                className="w-full rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !formTargetValue}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#444444] text-white hover:bg-[#444444]/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : editId ? 'Update Target' : 'Save Target'}
            </button>
          </div>
        </div>
      )}

      {/* Targets table */}
      {targets.length === 0 && !showForm ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-gray-500 text-sm">No targets set. Click &quot;Add Target&quot; to create one.</p>
        </div>
      ) : targets.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Type</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Scope</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Current</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Target</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Gap</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300 min-w-[120px]">Progress</th>
                <th className="px-3 py-2 text-left font-medium text-gray-600 dark:text-gray-300">Status</th>
                <th className="px-3 py-2 text-right font-medium text-gray-600 dark:text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {targets.map((t) => {
                const current = computeCurrent(t)
                const progress = current !== null && t.target_value > 0 ? Math.min(100, (current / t.target_value) * 100) : 0
                const gap = current !== null ? +(t.target_value - current).toFixed(2) : null
                const rag = ragColor(progress)

                return (
                  <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-3 py-2 font-medium">{t.type}</td>
                    <td className="px-3 py-2">
                      {t.scope}
                      {t.scope_value ? `: ${t.scope_value}` : ''}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{current !== null ? current : '-'}</td>
                    <td className="px-3 py-2 text-right font-mono">{t.target_value}</td>
                    <td className={`px-3 py-2 text-right font-mono ${gap !== null && gap > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                      {gap !== null ? (gap > 0 ? `-${gap}` : `+${Math.abs(gap)}`) : '-'}
                    </td>
                    <td className="px-3 py-2">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${rag.bar}`}
                          style={{ width: `${Math.min(100, progress)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 mt-0.5 block">{progress.toFixed(0)}%</span>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rag.bg} ${rag.text}`}>
                        {ragLabel(progress)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleEdit(t)}
                        className="text-xs text-[#444444] dark:text-[#444444]/60 hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => t.id && handleDelete(t.id)}
                        className="text-xs text-[#FFAD00] hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
