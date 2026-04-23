'use client'

import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useStore } from '@/store/useStore'
import { computePayoutWaterfall } from '@/lib/metrics'
import { fmtINR, fmtCr, fmtLakhs, fmtPct } from '@/lib/formatters'

interface CostActual {
  id?: number
  partner: string
  bp_code?: string
  region?: 'N' | 'S' | 'W'
  year_week: string
  driver_cost: number
  fuel_cost: number
  toll_cost: number
  maint_cost: number
  insurance_cost: number
  rto_cost: number
  emi_cost: number
  other_cost: number
  total_cost?: number
}

const ZERO_COSTS = {
  driver_cost: 0, fuel_cost: 0, toll_cost: 0, maint_cost: 0,
  insurance_cost: 0, rto_cost: 0, emi_cost: 0, other_cost: 0,
}

function rowTotal(r: CostActual): number {
  return (r.driver_cost ?? 0) + (r.fuel_cost ?? 0) + (r.toll_cost ?? 0) +
    (r.maint_cost ?? 0) + (r.insurance_cost ?? 0) + (r.rto_cost ?? 0) +
    (r.emi_cost ?? 0) + (r.other_cost ?? 0)
}

export default function CostActualsPanel() {
  const sheetData = useStore((s) => s.sheetData)
  const selectedWeek = useStore((s) => s.selectedWeek)
  const [actuals, setActuals] = useState<CostActual[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)
  const [uploadErr, setUploadErr] = useState<string | null>(null)

  const week = sheetData?.yearWeek ?? (selectedWeek !== 'latest' ? selectedWeek : 'latest')

  async function fetchActuals() {
    setLoading(true)
    try {
      const url = week === 'latest' ? '/api/cost-actuals' : `/api/cost-actuals?week=${week}`
      const res = await fetch(url)
      const data = await res.json()
      setActuals(Array.isArray(data) ? data : [])
    } catch {
      setActuals([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchActuals() }, [week])

  // Revenue from sheet data (basicValue), cost from cost-actuals total
  const pnl = useMemo(() => {
    const revenue = sheetData ? computePayoutWaterfall(sheetData.rows).basicValue : 0
    const cost = actuals.reduce((s, r) => s + (r.total_cost ?? rowTotal(r)), 0)
    const margin = revenue - cost
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0
    return { revenue, cost, margin, marginPct }
  }, [sheetData, actuals])

  async function handleUpload(file: File) {
    setUploadErr(null)
    setUploadStatus('Reading file…')
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: 0 })

      // Normalise column names
      const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '')
      const yearWeek = week === 'latest' ? sheetData?.yearWeek : week
      if (!yearWeek) {
        setUploadErr('No active week — push sheet data first.')
        setUploadStatus(null)
        return
      }

      const rows: CostActual[] = json.map((r) => {
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(r).find((rk) => norm(rk) === norm(k))
            if (found) return Number(r[found]) || 0
          }
          return 0
        }
        const getStr = (...keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(r).find((rk) => norm(rk) === norm(k))
            if (found) return String(r[found] ?? '')
          }
          return ''
        }
        const region = (getStr('region') || '').toUpperCase()
        const regionTyped: 'N' | 'S' | 'W' | undefined =
          region === 'N' || region === 'S' || region === 'W' ? region : undefined
        return {
          partner: getStr('partner', 'bp', 'busPartner', 'name'),
          bp_code: getStr('bpCode', 'code', 'bp_code'),
          region: regionTyped,
          year_week: yearWeek,
          driver_cost: get('driver', 'driverCost', 'driver_cost'),
          fuel_cost: get('fuel', 'fuelCost', 'fuel_cost'),
          toll_cost: get('toll', 'tollCost', 'toll_cost'),
          maint_cost: get('maint', 'maintenance', 'maint_cost'),
          insurance_cost: get('insurance', 'insuranceCost', 'insurance_cost'),
          rto_cost: get('rto', 'rtoCost', 'rto_cost'),
          emi_cost: get('emi', 'emiCost', 'emi_cost'),
          other_cost: get('other', 'otherCost', 'other_cost'),
        }
      }).filter((r) => r.partner && rowTotal(r) > 0)

      if (rows.length === 0) {
        setUploadErr('No valid rows found. Expected columns: Partner, Driver, Fuel, Toll, Maint, Insurance, RTO, EMI, Other.')
        setUploadStatus(null)
        return
      }

      setUploadStatus(`Uploading ${rows.length} rows…`)
      const res = await fetch('/api/cost-actuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setUploadErr(err.error || `HTTP ${res.status}`)
        setUploadStatus(null)
        return
      }
      setUploadStatus(`Uploaded ${rows.length} rows successfully.`)
      setTimeout(() => { setShowUpload(false); setUploadStatus(null) }, 1200)
      fetchActuals()
    } catch (e) {
      setUploadErr(e instanceof Error ? e.message : 'Upload failed')
      setUploadStatus(null)
    }
  }

  return (
    <>
      {/* Fleet P&L card */}
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5 border border-gray-100 dark:border-gray-800">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#444444] dark:text-white">Fleet P&amp;L (this week)</h3>
          <button
            onClick={() => setShowUpload(true)}
            className="text-xs px-3 py-1 rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-white"
          >
            Upload BP Cost Snapshot
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Revenue (Basic)</div>
            <div className="text-xl font-bold text-[#444444] dark:text-white">{fmtCr(pnl.revenue / 1e5)}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Cost</div>
            <div className="text-xl font-bold text-[#FFAD00]">
              {actuals.length === 0 ? '—' : fmtCr(pnl.cost / 1e5)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Margin</div>
            <div className={`text-xl font-bold ${pnl.margin >= 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
              {actuals.length === 0 ? '—' : fmtCr(pnl.margin / 1e5)}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase text-gray-500 dark:text-gray-400">Margin %</div>
            <div className={`text-xl font-bold ${pnl.marginPct >= 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
              {actuals.length === 0 ? '—' : fmtPct(pnl.marginPct)}
            </div>
          </div>
        </div>
        {actuals.length === 0 && (
          <p className="text-xs text-gray-400 italic mt-3">
            No cost actuals uploaded for this week. Upload a BP Cost Snapshot to compute margin.
          </p>
        )}
      </div>

      {/* Cost actuals breakdown panel */}
      {actuals.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-5 border border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-[#444444] dark:text-white">
              Cost actuals by partner ({week})
            </h3>
            <span className="text-xs text-gray-400">{actuals.length} partners</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-2 py-2 text-left uppercase">Partner</th>
                  <th className="px-2 py-2 text-right uppercase">Driver</th>
                  <th className="px-2 py-2 text-right uppercase">Fuel</th>
                  <th className="px-2 py-2 text-right uppercase">Toll</th>
                  <th className="px-2 py-2 text-right uppercase">Maint</th>
                  <th className="px-2 py-2 text-right uppercase">Ins</th>
                  <th className="px-2 py-2 text-right uppercase">RTO</th>
                  <th className="px-2 py-2 text-right uppercase">EMI</th>
                  <th className="px-2 py-2 text-right uppercase">Other</th>
                  <th className="px-2 py-2 text-right uppercase font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {actuals
                  .slice()
                  .sort((a, b) => (b.total_cost ?? rowTotal(b)) - (a.total_cost ?? rowTotal(a)))
                  .map((r) => (
                    <tr key={`${r.partner}-${r.year_week}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="px-2 py-1.5 font-medium dark:text-white">{r.partner}</td>
                      <td className="px-2 py-1.5 text-right">{fmtLakhs(r.driver_cost / 1e5)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtLakhs(r.fuel_cost / 1e5)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtLakhs(r.toll_cost / 1e5)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtLakhs(r.maint_cost / 1e5)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtLakhs(r.insurance_cost / 1e5)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtLakhs(r.rto_cost / 1e5)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtLakhs(r.emi_cost / 1e5)}</td>
                      <td className="px-2 py-1.5 text-right">{fmtLakhs(r.other_cost / 1e5)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">
                        {fmtLakhs((r.total_cost ?? rowTotal(r)) / 1e5)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold text-[#444444] dark:text-white">Upload BP Cost Snapshot</h3>
              <button
                onClick={() => { setShowUpload(false); setUploadStatus(null); setUploadErr(null) }}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Excel or CSV with columns: <code>Partner</code>, <code>Driver</code>, <code>Fuel</code>, <code>Toll</code>,{' '}
              <code>Maint</code>, <code>Insurance</code>, <code>RTO</code>, <code>EMI</code>, <code>Other</code>.
              Will be tagged with week <strong>{week === 'latest' ? sheetData?.yearWeek ?? '—' : week}</strong>.
            </p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
              }}
              className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-[#73D700] file:text-[#444444] hover:file:bg-[#65bf00]"
            />
            {uploadStatus && <p className="text-sm text-[#444444] dark:text-[#444444]/60">{uploadStatus}</p>}
            {uploadErr && <p className="text-sm text-[#FFAD00]">{uploadErr}</p>}
          </div>
        </div>
      )}
    </>
  )
}
