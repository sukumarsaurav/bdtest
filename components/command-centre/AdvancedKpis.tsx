'use client'

/**
 * AdvancedKpis — additive board-level enrichment for the Command Centre
 * Overview tab. Pulls live sheet data + baseline (PC) data and renders:
 *
 *   1. GST Apr-1 amber banner (when 18% partners present in current week)
 *   2. THIS WEEK / MONTH-TO-DATE / CONTRACTED three-section panel
 *      with the corrected cost definitions (real cost/km = weighted MinG, GST
 *      shown separately as a tax line, not folded into cost)
 *   3. Week-on-week comparison panel
 *   4. Forward projection panel (4 weeks, season-weighted)
 *   5. Top 5 board-level action items
 *   6. Cost breakdown card (placeholder when bp_cost_actuals empty)
 */

import { useEffect, useMemo, useState } from 'react'
import type { HubRow } from '@/types'
import {
  actualWtdEffectiveMinG,
  grossPayoutLakhs,
  netPayableLakhs,
  totalGstLakhs,
  totalTdsLakhs,
  weeklyGstStepUpLakhs,
  filterHighGstRows,
  isPostApr2025,
  fleetWeeklyForecastFromBl2,
  MONTH_SEASON,
  SEASON_FACTORS,
  GST_STEP_DELTA,
  formatYearWeekRange,
  type Bl2Line,
} from '@/lib/cost-utils'
import ThreeHorizonKPIs from './ThreeHorizonKPIs'
import DeltaDecomposition from './DeltaDecomposition'
import LineForecast from './LineForecast'

interface Props {
  /** Current week's HubRows (sheet data). Empty array when no sync. */
  rows: HubRow[]
  /** Selected week label, e.g. "2024_W0". */
  yearWeek: string
  year: number
  monthNo: number
  contractedMonthlyL: number
  /** Multi-week data from useMultiWeekData hook */
  mtdRows: HubRow[]
  ytdRows: HubRow[]
  mtdWeekCount: number
  ytdWeekCount: number
  multiWeekLoading: boolean
  /** Baseline lines from /api/bl-summary */
  bl2Lines: Bl2Line[]
}

interface ActionItem {
  priority: 'HIGH' | 'MED' | 'LOW'
  type: 'RENEGOTIATE' | 'GST_IMPACT' | 'UTILISATION' | 'DATA'
  title: string
  detail: string
  impactL: number
}

const fmtL = (v: number) => `₹${v.toFixed(1)}L`
const fmtCr = (vL: number) => `₹${(vL / 100).toFixed(2)}Cr`

export default function AdvancedKpis({
  rows,
  yearWeek,
  year,
  monthNo,
  contractedMonthlyL,
  mtdRows,
  ytdRows,
  mtdWeekCount,
  ytdWeekCount,
  multiWeekLoading,
  bl2Lines,
}: Props) {
  const [priorWeekRows, setPriorWeekRows] = useState<HubRow[] | null>(null)
  const [costActualsCount, setCostActualsCount] = useState<number | null>(null)
  const [allWeekTotals, setAllWeekTotals] = useState<
    { yearWeek: string; grossL: number; netL: number; weight: number }[]
  >([])

  // Pull prior-week sheet rows for WoW comparison
  useEffect(() => {
    if (!yearWeek) return
    fetch('/api/sheet-data')
      .then((r) => r.json())
      .then((meta) => {
        const weeks: { year_week: string }[] = meta.weeks || []
        if (!weeks.length) return
        const sorted = [...weeks].map((w) => w.year_week).sort()
        const idx = sorted.indexOf(yearWeek)
        const prior = idx > 0 ? sorted[idx - 1] : null
        if (!prior) return
        return fetch(`/api/sheet-data?week=${prior}`)
          .then((r) => r.json())
          .then((d) => {
            if (Array.isArray(d.rows)) setPriorWeekRows(d.rows as HubRow[])
          })
      })
      .catch(() => {})
  }, [yearWeek])

  // Pull bp_cost_actuals row count (for the "cost breakdown" card placeholder)
  useEffect(() => {
    fetch('/api/sheet-data') // also gives availableWeeks; cost actuals via own check
      .then(() =>
        fetch('/api/bd-actions')
          .then((r) => (r.ok ? r.json() : []))
          .then(() => setCostActualsCount(0)) // we don't have a dedicated endpoint
          .catch(() => setCostActualsCount(0)),
      )
      .catch(() => setCostActualsCount(0))
  }, [])

  // ---------- THIS WEEK metrics ----------
  const thisWeek = useMemo(() => {
    if (!rows.length) {
      return {
        busKm: 0,
        realCostPKm: 0,
        grossPayoutL: 0,
        netPayableL: 0,
        gstL: 0,
        tdsL: 0,
        gstPKm: 0,
        netPKm: 0,
      }
    }
    const busKm = rows.reduce((s, r) => s + (r.busKm || 0), 0)
    const realCostPKm = actualWtdEffectiveMinG(rows)
    const gpL = grossPayoutLakhs(rows)
    const npL = netPayableLakhs(rows)
    const gL = totalGstLakhs(rows)
    const tL = totalTdsLakhs(rows)
    const gstPKm = busKm > 0 ? (gL * 1e5) / busKm : 0
    const netPKm = busKm > 0 ? (npL * 1e5) / busKm : 0
    return { busKm, realCostPKm, grossPayoutL: gpL, netPayableL: npL, gstL: gL, tdsL: tL, gstPKm, netPKm }
  }, [rows])

  // ---------- Forward projection (next 4 weeks) — bl2 fleet-based ----------
  const projection = useMemo(() => {
    if (!bl2Lines.length) return [] as { week: string; season: string; payoutL: number; forecastKm: number }[]
    const out: { week: string; season: string; payoutL: number; forecastKm: number }[] = []
    const today = new Date()
    for (let k = 1; k <= 4; k++) {
      const d = new Date(today)
      d.setDate(d.getDate() + k * 7)
      const nextMonth = d.getMonth() + 1
      const fc = fleetWeeklyForecastFromBl2(bl2Lines, nextMonth)
      out.push({ week: `+${k}w`, season: fc.season, payoutL: fc.forecastPayoutL, forecastKm: fc.forecastKm })
    }
    return out
  }, [thisWeek.grossPayoutL, monthNo])

  // ---------- WoW deltas ----------
  const wow = useMemo(() => {
    if (!priorWeekRows || !rows.length) return null
    const priorGrossL = grossPayoutLakhs(priorWeekRows)
    const priorNetL = netPayableLakhs(priorWeekRows)
    const priorRealCostPKm = actualWtdEffectiveMinG(priorWeekRows)
    return {
      priorGrossL,
      priorNetL,
      priorRealCostPKm,
      deltaGrossL: thisWeek.grossPayoutL - priorGrossL,
      deltaNetL: thisWeek.netPayableL - priorNetL,
      deltaRealCostPKm: thisWeek.realCostPKm - priorRealCostPKm,
    }
  }, [priorWeekRows, rows, thisWeek])

  // ---------- GST step-up (Apr 2025+) ----------
  const sample = rows[0]
  const isApr2025Plus = sample
    ? isPostApr2025({ year: sample.year, monthNo: sample.monthNo })
    : false
  const gstStep = useMemo(() => {
    if (!isApr2025Plus) return null
    const high = filterHighGstRows(rows)
    if (high.length === 0) return null
    const weeklyL = weeklyGstStepUpLakhs(high)
    const annualCr = (weeklyL * 52) / 100
    return { weeklyL, annualCr, count: high.length }
  }, [rows, isApr2025Plus])

  // ---------- Top 5 board-level action items ----------
  const actionItems = useMemo<ActionItem[]>(() => {
    if (!bl2Lines.length) return []
    const blByCode = new Map(bl2Lines.map((l) => [l.line_id, l]))

    const items: ActionItem[] = []

    // 1. RENEGOTIATE — top 3 overpaying lines (positive delta_pct = MinG > PC)
    const overpaying = bl2Lines
      .filter((l) => l.delta_pct != null && l.delta_pct > 3 && l.pc5 != null)
      .map((l) => {
        const monthlyKm = l.monthly_lakhs > 0 && l.min_g > 0
          ? (l.monthly_lakhs * 1e5) / l.min_g
          : 0
        const targetMinG = (l.pc5 as number) * 1.02
        const monthlySavingsL = ((l.min_g - targetMinG) * monthlyKm) / 1e5
        return { l, monthlySavingsL, targetMinG }
      })
      .filter((x) => x.monthlySavingsL > 0)
      .sort((a, b) => b.monthlySavingsL - a.monthlySavingsL)
      .slice(0, 3)

    overpaying.forEach((x) =>
      items.push({
        priority: 'HIGH',
        type: 'RENEGOTIATE',
        title: `Renegotiate ${x.l.line_id} · ${x.l.line_name}`,
        detail: `${x.l.partner} — MinG ₹${x.l.min_g.toFixed(2)}/km is ${x.l.delta_pct!.toFixed(1)}% above PC. Target ₹${x.targetMinG.toFixed(2)}/km`,
        impactL: x.monthlySavingsL,
      }),
    )

    // 2. GST step-up
    if (gstStep) {
      items.push({
        priority: 'HIGH',
        type: 'GST_IMPACT',
        title: 'GST 18% partners — file ITC claims',
        detail: `${gstStep.count} lines: extra ₹${gstStep.weeklyL.toFixed(1)}L/week tax outflow vs Dec baseline. Annualised ₹${gstStep.annualCr.toFixed(1)}Cr.`,
        impactL: gstStep.weeklyL * 4.33,
      })
    }

    // 3. Low utilisation (sheet busKm vs contracted busKm from baseline)
    if (rows.length && bl2Lines.length) {
      const lowUtilLines = rows.filter((r) => {
        const bl = blByCode.get(r.lineId)
        if (!bl) return false
        const contractedWeeklyKm = (bl.ow_km ?? 0) * 2 * ((bl.rt ?? 0) / 4.33) * bl.buses
        if (contractedWeeklyKm === 0) return false
        return r.busKm / contractedWeeklyKm < 0.8
      })
      if (lowUtilLines.length > 0) {
        items.push({
          priority: 'MED',
          type: 'UTILISATION',
          title: `${lowUtilLines.length} lines below 80% utilisation`,
          detail: 'Review contracted km or reduce min guarantees on under-utilised routes.',
          impactL: 0,
        })
      }
    }

    // 4. Data flags — lines with no PC
    const dataFlags = bl2Lines.filter((l) => l.health === 'unknown')
    if (dataFlags.length > 0) {
      items.push({
        priority: 'LOW',
        type: 'DATA',
        title: `${dataFlags.length} baseline lines missing PC`,
        detail: dataFlags
          .slice(0, 3)
          .map((l) => l.line_id)
          .join(', ') + (dataFlags.length > 3 ? '…' : ''),
        impactL: 0,
      })
    }

    return items.sort((a, b) => b.impactL - a.impactL).slice(0, 5)
  }, [bl2Lines, rows, gstStep])

  // ---------- Render ----------
  const hasSheet = rows.length > 0

  return (
    <div className="space-y-6">
      {/* GST Apr 1 amber banner */}
      {gstStep && (
        <div className="bg-[#FFAD00]/12 border border-[#FFAD00]/40 rounded-xl p-4">
          <p className="font-semibold text-[#FFAD00] text-sm">
            ⚠ GST regime change: 18% partners from Apr 1 2025 (5% → 18%, {(GST_STEP_DELTA * 100).toFixed(0)}pp step-up)
          </p>
          <p className="text-xs text-[#444444]/80 mt-1 leading-relaxed">
            {gstStep.count} lines under the 18% slab. Incremental real cost to Flix (assuming ITC
            recovery at the pre-step 5% baseline) of{' '}
            <strong>₹{gstStep.weeklyL.toFixed(1)}L/week</strong> ·{' '}
            <strong>₹{gstStep.annualCr.toFixed(1)}Cr/year</strong> annualised.
            This IS included in the Real cost/km figure below — ensure ITC claims on the 5% baseline
            are filed to avoid adding further friction.
          </p>
        </div>
      )}

      {/* Three-horizon KPI stack (Week / MTD / YTD) */}
      {hasSheet && (
        <ThreeHorizonKPIs
          thisWeekRows={rows}
          mtdRows={mtdRows}
          ytdRows={ytdRows}
          yearWeek={yearWeek}
          mtdWeekCount={mtdWeekCount}
          ytdWeekCount={ytdWeekCount}
          loading={multiWeekLoading}
        />
      )}

      {/* Delta Decomposition: mix / rate / volume effects */}
      {hasSheet && bl2Lines.length > 0 && (
        <DeltaDecomposition
          rows={rows}
          blLines={bl2Lines}
          period={formatYearWeekRange(yearWeek)}
        />
      )}

      {/* WoW comparison panel */}
      {hasSheet && (
        <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">Week-on-week comparison</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#444444]/60 border-b border-[rgba(68,68,68,0.15)]">
                <th className="pb-2"></th>
                <th className="pb-2 pr-3 text-right">This week</th>
                <th className="pb-2 pr-3 text-right">Last week</th>
                <th className="pb-2 text-right">Δ</th>
              </tr>
            </thead>
            <tbody className="text-[#444444]/80">
              <tr className="border-b border-[rgba(68,68,68,0.15)]/40">
                <td className="py-2">Gross payout</td>
                <td className="py-2 pr-3 text-right">{fmtCr(thisWeek.grossPayoutL)}</td>
                <td className="py-2 pr-3 text-right">{wow ? fmtCr(wow.priorGrossL) : '—'}</td>
                <td className={`py-2 text-right ${wow ? (wow.deltaGrossL >= 0 ? 'text-[#FFAD00]' : 'text-[#73D700]') : 'text-[#444444]/50'}`}>
                  {wow ? `${wow.deltaGrossL >= 0 ? '+' : ''}${fmtL(wow.deltaGrossL)}` : '—'}
                </td>
              </tr>
              <tr className="border-b border-[rgba(68,68,68,0.15)]/40">
                <td className="py-2">Real cost/km</td>
                <td className="py-2 pr-3 text-right">₹{thisWeek.realCostPKm.toFixed(2)}</td>
                <td className="py-2 pr-3 text-right">{wow ? `₹${wow.priorRealCostPKm.toFixed(2)}` : '—'}</td>
                <td className={`py-2 text-right ${wow ? (wow.deltaRealCostPKm >= 0 ? 'text-[#FFAD00]' : 'text-[#73D700]') : 'text-[#444444]/50'}`}>
                  {wow ? `${wow.deltaRealCostPKm >= 0 ? '+' : ''}₹${wow.deltaRealCostPKm.toFixed(2)}` : '—'}
                </td>
              </tr>
              <tr>
                <td className="py-2">Net payable</td>
                <td className="py-2 pr-3 text-right">{fmtCr(thisWeek.netPayableL)}</td>
                <td className="py-2 pr-3 text-right">{wow ? fmtCr(wow.priorNetL) : '—'}</td>
                <td className={`py-2 text-right ${wow ? (wow.deltaNetL >= 0 ? 'text-[#FFAD00]' : 'text-[#73D700]') : 'text-[#444444]/50'}`}>
                  {wow ? `${wow.deltaNetL >= 0 ? '+' : ''}${fmtL(wow.deltaNetL)}` : '—'}
                </td>
              </tr>
            </tbody>
          </table>
          {!wow && (
            <p className="text-xs text-[#444444]/50 italic mt-3">
              Upload more weeks to enable trend tracking.
            </p>
          )}
        </div>
      )}

      {/* Forward projection panel */}
      {hasSheet && projection.length > 0 && (
        <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#444444]/80 mb-1">
            Forward projection · 4 weeks
          </h2>
          <p className="text-xs text-[#444444]/50 mb-3">
            Fleet forecast from bl2 contracted × season factor (S=71%, L=86%, XL=100%)
          </p>
          <div className="grid grid-cols-5 gap-3 text-center">
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
              <p className="text-[10px] uppercase tracking-wide text-[#444444]/60">This week (actual)</p>
              <p className="text-xs text-[#444444]/50">{MONTH_SEASON[monthNo]} · {(SEASON_FACTORS[MONTH_SEASON[monthNo] ?? 'L'] * 100).toFixed(0)}%</p>
              <p className="text-base font-bold text-[#444444] mt-1">{fmtCr(thisWeek.grossPayoutL)}</p>
            </div>
            {projection.map((p) => (
              <div key={p.week} className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
                <p className="text-[10px] uppercase tracking-wide text-[#444444]/60">{p.week}</p>
                <p className="text-xs text-[#444444]/50">{p.season} · {(SEASON_FACTORS[p.season as 'S' | 'L' | 'XL'] * 100).toFixed(0)}%</p>
                <p className="text-base font-bold text-[#444444] mt-1">{fmtCr(p.payoutL)}</p>
                <p className="text-[9px] text-[#444444]/40 mt-0.5">{(p.forecastKm / 1e5).toFixed(2)}L km</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#444444]/50 mt-3">
            Projected month total ≈{' '}
            <span className="text-[#444444] font-semibold">{fmtCr(projection.reduce((s, p) => s + p.payoutL, 0))}</span>{' '}
            vs Contracted <span className="text-[#444444] font-semibold">{fmtCr(contractedMonthlyL)}</span>
          </p>
        </div>
      )}

      {/* Line-level forecast vs actual */}
      {hasSheet && bl2Lines.length > 0 && (
        <LineForecast rows={rows} blLines={bl2Lines} monthNo={monthNo} />
      )}

      {/* Top 5 board-level action items */}
      {hasSheet && actionItems.length > 0 && (
        <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">
            Top 5 board-level action items
          </h2>
          <ol className="space-y-2">
            {actionItems.map((a, i) => (
              <li key={i} className="flex items-start gap-3 bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
                <span className="text-2xl font-bold text-gray-600 leading-none">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        a.priority === 'HIGH'
                          ? 'bg-[#FFAD00] text-[#444444]'
                          : a.priority === 'MED'
                          ? 'bg-amber-600 text-[#444444]'
                          : 'bg-gray-600 text-[#444444]'
                      }`}
                    >
                      {a.priority}
                    </span>
                    <span className="text-[10px] uppercase tracking-wide text-[#444444]/50">{a.type}</span>
                    {a.impactL > 0 && (
                      <span className="text-xs text-[#73D700] font-semibold ml-auto">
                        ~{fmtL(a.impactL)}/mo impact
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-[#444444]">{a.title}</p>
                  <p className="text-xs text-[#444444]/60 mt-0.5">{a.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Cost breakdown placeholder (until bp_cost_actuals is wired through) */}
      {hasSheet && (
        <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-5">
          <h2 className="text-sm font-semibold text-[#444444]/80 mb-2">
            Cost breakdown · this week
          </h2>
          {costActualsCount && costActualsCount > 0 ? (
            <p className="text-xs text-[#444444]/60">Cost actuals available — breakdown rendering coming next.</p>
          ) : (
            <p className="text-xs text-[#444444]/50 italic">
              Upload partner cost actuals via Analytics → Live Data to unlock the
              fuel/driver/maintenance/tyres/AdBlue/other waterfall.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
