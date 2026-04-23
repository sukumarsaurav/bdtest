'use client'

import React, { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
  LabelList,
} from 'recharts'
import { EVModel, ModelResult, RouteConfig, InflationInputs } from './types'
import { computeModel } from './evEngine'
import { fmtPerKm, fmtLakhs, fmtNum } from '@/lib/formatters'
import {
  CHART_COLORS,
  COST_STACK_COLORS,
  COST_STACK_LABELS,
  CostStackKey,
  SUBSIDY_DEFAULTS,
  GRID_INTENSITY,
  computeNpvIrr,
  computeSensitivity,
  computeYearlyDelta,
  computeRisk,
  computeFeasibility,
  computeSubsidy,
  computeAmcRows,
  computeCarbon,
  computeCostStack,
  computeVerdict,
  FeasibilityStatus,
} from './advancedCompute'

interface Props {
  models: EVModel[]
  results: ModelResult[]
  route: RouteConfig
  inflation: InflationInputs
  monthlyKm: number
  showEur: boolean
  eurRate: number
  busesPerModel: Record<string, number>
}

const COST_STACK_KEYS: CostStackKey[] = [
  'energy',
  'financing',
  'amc',
  'battery',
  'driverHr',
  'tyresAdmin',
  'infra',
]

export default function AdvancedAnalytics({
  models,
  results,
  route,
  inflation,
  monthlyKm,
  showEur,
  eurRate,
  busesPerModel,
}: Props) {
  const dieselResult = results.find((r) => r.model.type === 'diesel') ?? null
  const evResults = results.filter((r) => r.model.type === 'ev')
  const totalYears = route.contractYears + route.extensionYears
  const annualKm = monthlyKm * 12

  /* ---------- 1. Verdict ---------- */
  const verdict = useMemo(() => computeVerdict(results), [results])
  const bestEv = useMemo(
    () => evResults.find((r) => r.model.id === verdict.bestEvId) ?? null,
    [evResults, verdict.bestEvId]
  )

  /* ---------- 2. Cost stack ---------- */
  const costStack = useMemo(() => computeCostStack(results), [results])

  /* ---------- 3. NPV/IRR/Payback per EV ---------- */
  const [discountRate, setDiscountRate] = useState(10)
  const npvData = useMemo(() => {
    if (!dieselResult) return []
    return evResults.map((ev) => ({
      ev,
      ...computeNpvIrr(ev, dieselResult, discountRate),
    }))
  }, [evResults, dieselResult, discountRate])

  const cumulativeChartData = useMemo(() => {
    if (!dieselResult || !bestEv) return []
    const npv = computeNpvIrr(bestEv, dieselResult, discountRate)
    return npv.cumulativeSavings.map((s, i) => ({
      year: `Y${i + 1}`,
      savings: s,
    }))
  }, [bestEv, dieselResult, discountRate])

  /* ---------- 4. Sensitivity tornado ---------- */
  const sensitivityBars = useMemo(() => {
    if (!bestEv || !dieselResult) return []
    const baselineEv = bestEv.model
    const baselineDi = dieselResult.model
    const recompute = (
      modelPatch: Partial<EVModel> | null,
      dieselPatch: Partial<EVModel> | null,
      annualKmFactor: number
    ) => {
      const evModel = modelPatch ? { ...baselineEv, ...modelPatch } : baselineEv
      const diModel = dieselPatch ? { ...baselineDi, ...dieselPatch } : baselineDi
      const mk = monthlyKm * annualKmFactor
      const evRes = computeModel(evModel, route, inflation, mk)
      const diRes = computeModel(diModel, route, inflation, mk)
      return { evAvg: evRes.weightedAvgPerKm, diAvg: diRes.weightedAvgPerKm }
    }
    return computeSensitivity(bestEv, dieselResult, recompute)
  }, [bestEv, dieselResult, monthlyKm, route, inflation])

  /* ---------- 5. Long-term 10-year view ---------- */
  const longTermData = useMemo(() => {
    if (!evResults.length || !dieselResult) return []
    // Recompute over 10 years
    const longRoute: RouteConfig = { ...route, contractYears: 10, extensionYears: 0 }
    const evLong = evResults.map((r) => computeModel(r.model, longRoute, inflation, monthlyKm))
    const diLong = computeModel(dieselResult.model, longRoute, inflation, monthlyKm)
    const rows: any[] = []
    for (let yr = 1; yr <= 10; yr++) {
      const row: any = { year: `Y${yr}` }
      evLong.forEach((r) => {
        const y = r.yearlyData[yr - 1]
        if (y) row[r.model.id] = y.cumulativeAvgPerKm
      })
      const dy = diLong.yearlyData[yr - 1]
      if (dy) row[diLong.model.id] = dy.cumulativeAvgPerKm
      rows.push(row)
    }
    return rows
  }, [evResults, dieselResult, route, inflation, monthlyKm])

  /* ---------- 6. Yearly delta % table ---------- */
  const deltaTable = useMemo(() => {
    if (!dieselResult) return []
    return evResults.map((ev) => ({
      ev,
      cells: computeYearlyDelta(ev, dieselResult).slice(0, 7),
      risk: computeRisk(ev.model),
    }))
  }, [evResults, dieselResult])

  /* ---------- 7. Feasibility ---------- */
  const feasibility = useMemo(() => {
    return evResults.map((r) => ({
      model: r.model,
      ...computeFeasibility(r.model, route),
    }))
  }, [evResults, route])
  const feasibilityWarning = feasibility.some(
    (f) => f.status === 'NOT_VIABLE' || (f.realRangeKm > 0 && f.realRangeKm < route.owKm)
  )

  /* ---------- 8. Subsidy ---------- */
  const [subsidy, setSubsidy] = useState(SUBSIDY_DEFAULTS)
  const subsidyRows = useMemo(() => {
    return results.map((r) => ({
      model: r.model,
      ...computeSubsidy(r.model, subsidy, r.totalKm),
    }))
  }, [results, subsidy])

  /* ---------- 9. AMC analysis ---------- */
  const amcAnalysis = useMemo(() => {
    return evResults.map((r) => ({
      model: r.model,
      rows: computeAmcRows(r.model, 7),
    }))
  }, [evResults])

  /* ---------- 10. Carbon / ESG ---------- */
  const fleetBuses = useMemo(
    () =>
      Object.values(busesPerModel).reduce((s, n) => s + (n || 0), 0) || route.buses || 1,
    [busesPerModel, route.buses]
  )
  const carbon = useMemo(() => {
    if (!bestEv || !dieselResult) return null
    return computeCarbon(bestEv, dieselResult, annualKm, fleetBuses, totalYears)
  }, [bestEv, dieselResult, annualKm, fleetBuses, totalYears])

  /* ============================================================
     Render
     ============================================================ */
  return (
    <div className="space-y-6">
      {/* ====== DIVIDER ====== */}
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-300" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-4 text-[11px] font-bold text-[#444444] uppercase tracking-wider">
            Advanced Analytics
          </span>
        </div>
      </div>

      {/* ====== 1. EXECUTIVE VERDICT ====== */}
      <Section title="Executive Verdict" subtitle="Yes/no viability call backed by 4 KPIs and risk chips">
        <div
          className={`rounded-xl p-5 ${
            verdict.viable
              ? 'bg-gradient-to-br from-[#73D700]/15 to-[#73D700]/5 border-2 border-[#73D700]/40'
              : 'bg-[#FFAD00]/10 border-2 border-[#FFAD00]/30'
          }`}
        >
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                BD Verdict
              </div>
              <div
                className={`text-2xl font-bold mt-1 ${
                  verdict.viable ? 'text-[#73D700]' : 'text-[#FFAD00]'
                }`}
              >
                {verdict.headline}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {verdict.riskChips.map((c, i) => (
                <span
                  key={i}
                  className={`text-[10px] px-2 py-1 rounded-full font-bold ${
                    c.tone === 'green'
                      ? 'bg-[#73D700]/20 text-[#73D700]'
                      : c.tone === 'amber'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-[#FFAD00]/10 text-[#FFAD00]'
                  }`}
                >
                  {c.label}
                </span>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <KPI
              label="Best EV ₹/km"
              value={verdict.bestEvPerKm != null ? fmtPerKm(verdict.bestEvPerKm, showEur, eurRate) : '—'}
              sub={bestEv?.model.name}
            />
            <KPI
              label="Diesel ₹/km"
              value={verdict.dieselPerKm != null ? fmtPerKm(verdict.dieselPerKm, showEur, eurRate) : '—'}
              sub={dieselResult?.model.name}
            />
            <KPI
              label="Saving ₹/km"
              value={
                verdict.savingsPerKm != null
                  ? `${verdict.savingsPerKm > 0 ? '−' : '+'}${fmtPerKm(
                      Math.abs(verdict.savingsPerKm),
                      showEur,
                      eurRate
                    )}`
                  : '—'
              }
              tone={verdict.savingsPerKm != null && verdict.savingsPerKm > 0 ? 'green' : 'red'}
            />
            <KPI
              label="Saving %"
              value={verdict.savingsPct != null ? `${verdict.savingsPct.toFixed(1)}%` : '—'}
              tone={verdict.savingsPct != null && verdict.savingsPct > 0 ? 'green' : 'red'}
            />
          </div>
        </div>
      </Section>

      {/* ====== 2. COST COMPONENT STACKED BREAKDOWN ====== */}
      <Section
        title="Cost Component Breakdown"
        subtitle="Stacked weighted ₹/km per model · 7 cost categories · amber = AMC unknown · NMC badge = battery chemistry risk"
      >
        <ResponsiveContainer width="100%" height={420}>
          <BarChart
            data={costStack}
            margin={{ top: 20, right: 20, left: 0, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis
              dataKey="modelName"
              tick={{ fontSize: 9, fill: '#6B7280' }}
              angle={-30}
              textAnchor="end"
              height={70}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#6B7280' }}
              tickFormatter={(v) => (showEur ? `€${(v / eurRate).toFixed(1)}` : `₹${v.toFixed(0)}`)}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid #E5E7EB', fontSize: 11 }}
              formatter={(v: any, name: any) => [
                fmtPerKm(+v, showEur, eurRate),
                COST_STACK_LABELS[name as CostStackKey] ?? name,
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 10 }}
              formatter={(value) => COST_STACK_LABELS[value as CostStackKey] ?? value}
            />
            {COST_STACK_KEYS.map((k) => (
              <Bar key={k} dataKey={k} stackId="cost" fill={COST_STACK_COLORS[k]}>
                {k === 'amc' &&
                  costStack.map((d, i) => (
                    <Cell key={i} fill={d.amcUnknown ? '#fbbf24' : COST_STACK_COLORS.amc} />
                  ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-2 mt-3">
          {costStack.map((d) => (
            <div
              key={d.modelId}
              className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded border ${
                d.priceUnknown
                  ? 'bg-gray-100 border-gray-300 text-gray-500 italic'
                  : 'bg-white border-gray-200 text-[#444444]'
              }`}
            >
              <span className="font-bold">{d.modelName}</span>
              <span className="tabular-nums">{fmtPerKm(d.total, showEur, eurRate)}</span>
              {d.chemistry === 'NMC' && (
                <span className="px-1.5 py-0.5 rounded bg-[#FFAD00]/10 text-[#FFAD00] font-bold">NMC</span>
              )}
              {d.amcUnknown && (
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                  AMC ?
                </span>
              )}
              {d.priceUnknown && (
                <span className="px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-bold">
                  Price TBD
                </span>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* ====== 3. NPV / IRR / PAYBACK ====== */}
      <Section
        title="NPV / IRR / Payback"
        subtitle="Discounted lifetime cashflow EV vs ICE · battery spikes appear as dips in cumulative savings"
      >
        <div className="flex items-center gap-3 mb-3">
          <label className="text-[11px] text-gray-600">Discount rate</label>
          <input
            type="number"
            value={discountRate}
            step={0.5}
            onChange={(e) => setDiscountRate(parseFloat(e.target.value) || 0)}
            className="w-20 text-[11px] px-2 py-1 rounded border border-gray-200 bg-white text-right text-[#444444]"
          />
          <span className="text-[11px] text-gray-500">%</span>
        </div>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">EV</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">NPV</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">IRR</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Payback</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {npvData.map((row) => (
                <tr key={row.ev.model.id}>
                  <td className="px-3 py-2 font-medium text-[#444444]">{row.ev.model.name}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      row.npvRs > 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'
                    }`}
                  >
                    {fmtLakhs(row.npvRs / 100000)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {row.irrPct != null ? `${row.irrPct.toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.paybackYear ? (
                      <span className="text-[#73D700] font-semibold">Y{row.paybackYear}</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cumulativeChartData.length > 0 && (
          <div className="mt-4">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
              Cumulative savings — best EV ({bestEv?.model.name})
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={cumulativeChartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickFormatter={(v) => fmtLakhs(v / 100000, 0)}
                />
                <Tooltip formatter={(v: any) => fmtLakhs(+v / 100000)} />
                <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
                <Line
                  type="monotone"
                  dataKey="savings"
                  stroke="#73D700"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Section>

      {/* ====== 4. SENSITIVITY TORNADO ====== */}
      <Section
        title="Sensitivity Tornado"
        subtitle={`±20% on 8 key inputs · baseline = ${bestEv?.model.name ?? '—'} vs ${
          dieselResult?.model.name ?? 'diesel'
        }`}
      >
        {sensitivityBars.length === 0 ? (
          <div className="text-[11px] text-gray-400 italic py-6 text-center">
            Add at least one EV and one diesel reference.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={sensitivityBars.map((b) => ({
                label: b.label,
                lowDelta: b.low - b.baseline,
                highDelta: b.high - b.baseline,
              }))}
              layout="vertical"
              margin={{ top: 10, right: 30, left: 100, bottom: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: '#6B7280' }}
                tickFormatter={(v) => `${v.toFixed(1)}`}
              />
              <YAxis
                type="category"
                dataKey="label"
                tick={{ fontSize: 10, fill: '#6B7280' }}
                width={120}
              />
              <Tooltip
                formatter={(v: any) =>
                  `${v >= 0 ? '+' : ''}${fmtPerKm(+v, showEur, eurRate)} delta`
                }
              />
              <ReferenceLine x={0} stroke="#444444" strokeWidth={1.5} />
              <Bar dataKey="lowDelta" fill="#73D700" />
              <Bar dataKey="highDelta" fill="#FFAD00" />
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="text-[10px] text-gray-500 mt-2">
          Bars show how the EV-vs-ICE ₹/km gap shifts when each input is moved −20% (green) or +20%
          (red). Wider bars = higher leverage on the verdict.
        </div>
      </Section>

      {/* ====== 5. LONG-TERM 10-YEAR VIEW ====== */}
      <Section
        title="Long-term 10-Year View"
        subtitle="Cumulative ₹/km extended to 10 years · Y7 dotted line = typical contract end · battery cycles drive late spikes"
      >
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={longTermData} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#6B7280' }} />
            <YAxis
              tick={{ fontSize: 10, fill: '#6B7280' }}
              tickFormatter={(v) => (showEur ? `€${(v / eurRate).toFixed(1)}` : `₹${v.toFixed(0)}`)}
            />
            <Tooltip formatter={(v: any) => fmtPerKm(+v, showEur, eurRate)} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <ReferenceLine
              x="Y7"
              stroke="#FFAD00"
              strokeDasharray="4 4"
              label={{ value: 'Y7 contract', position: 'top', fill: '#FFAD00', fontSize: 9 }}
            />
            {evResults.map((r) => (
              <Line
                key={r.model.id}
                type="monotone"
                dataKey={r.model.id}
                name={r.model.name}
                stroke={CHART_COLORS[r.model.id] ?? '#2563eb'}
                strokeWidth={2}
                dot={{ r: 2 }}
              />
            ))}
            {dieselResult && (
              <Line
                type="monotone"
                dataKey={dieselResult.model.id}
                name={`${dieselResult.model.name} (fuel inflation drives curve)`}
                stroke={CHART_COLORS[dieselResult.model.id] ?? '#444444'}
                strokeWidth={2.5}
                strokeDasharray="6 3"
                dot={{ r: 2 }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {/* ====== 6. DELTA % TABLE ====== */}
      <Section
        title="Year-by-year Δ% vs Diesel"
        subtitle="Y1–Y7 · ⚡ = battery replacement year · risk score per OEM"
      >
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">EV</th>
                {[1, 2, 3, 4, 5, 6, 7].map((y) => (
                  <th key={y} className="px-2 py-2 text-center font-semibold text-gray-600">
                    Y{y}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Risk</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {deltaTable.map((row) => (
                <tr key={row.ev.model.id}>
                  <td className="px-3 py-2 font-medium text-[#444444] whitespace-nowrap">
                    {row.ev.model.name}
                    {row.ev.model.tag === 'PREFERRED' && (
                      <span className="ml-1.5 text-[8px] px-1 py-0.5 rounded bg-[#73D700] text-white font-bold">
                        PREFERRED
                      </span>
                    )}
                  </td>
                  {[1, 2, 3, 4, 5, 6, 7].map((y) => {
                    const cell = row.cells.find((c) => c.year === y)
                    if (!cell)
                      return (
                        <td key={y} className="px-2 py-2 text-center text-gray-300">
                          —
                        </td>
                      )
                    const bg =
                      cell.deltaPct < -10
                        ? 'bg-green-100 text-green-800'
                        : cell.deltaPct < 0
                        ? 'bg-green-50 text-green-700'
                        : cell.deltaPct < 10
                        ? 'bg-amber-50 text-amber-800'
                        : 'bg-[#FFAD00]/10 text-[#FFAD00]'
                    return (
                      <td
                        key={y}
                        className={`px-2 py-2 text-center tabular-nums font-semibold ${bg}`}
                      >
                        {cell.isBatteryYear && '⚡'}
                        {cell.deltaPct > 0 ? '+' : ''}
                        {cell.deltaPct.toFixed(0)}%
                      </td>
                    )
                  })}
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                        row.risk.score === 0
                          ? 'bg-[#73D700]/20 text-[#73D700]'
                          : row.risk.score <= 3
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-[#FFAD00]/10 text-[#FFAD00]'
                      }`}
                      title={row.risk.reasons.join(' · ')}
                    >
                      {row.risk.score}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ====== 7. RANGE FEASIBILITY ====== */}
      <Section
        title="Range Feasibility"
        subtitle="Real range = stated × 0.85 · stops calc on OW km · auto-warning if real range < OW km"
      >
        {feasibilityWarning && (
          <div className="mb-3 rounded-md border-l-4 border-[#FFAD00] bg-[#FFAD00]/10 p-3 text-[11px] text-[#FFAD00]">
            <span className="font-bold">⚠ Range warning:</span> at least one EV's real range falls
            below the {route.owKm} km one-way leg. Charging infra or fast-charge stops will be
            mandatory.
          </div>
        )}
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">EV</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Stated km</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Real km</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">OW km</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Stops</th>
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {feasibility.map((f) => (
                <tr key={f.model.id}>
                  <td className="px-3 py-2 font-medium text-[#444444] whitespace-nowrap">
                    {f.model.name}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.model.rangeKm ?? '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-600">
                    {f.realRangeKm ? f.realRangeKm.toFixed(0) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{f.owKm}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{f.stopsRequired}</td>
                  <td className="px-3 py-2 text-center">
                    <FeasibilityBadge status={f.status} />
                  </td>
                  <td className="px-3 py-2 text-[10px] text-gray-600">{f.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ====== 8. SUBSIDY MODELLING ====== */}
      <Section
        title="Subsidy & GST Impact"
        subtitle="FAME-II + state subsidy + GST treatment · effective acquisition cost and ₹/km impact"
      >
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
          <NumField
            label="FAME-II ₹L"
            value={subsidy.fameII_L}
            onChange={(v) => setSubsidy({ ...subsidy, fameII_L: v })}
          />
          <NumField
            label="State sub ₹L"
            value={subsidy.stateSub_L}
            onChange={(v) => setSubsidy({ ...subsidy, stateSub_L: v })}
          />
          <NumField
            label="GST EV %"
            value={subsidy.gstEvPct}
            onChange={(v) => setSubsidy({ ...subsidy, gstEvPct: v })}
          />
          <NumField
            label="GST ICE %"
            value={subsidy.gstIcePct}
            onChange={(v) => setSubsidy({ ...subsidy, gstIcePct: v })}
          />
        </div>
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">Model</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Base ₹L</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Subsidy ₹L</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">GST ₹L</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Effective ₹L</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Δ ₹/km</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {subsidyRows.map((r) => (
                <tr key={r.model.id}>
                  <td className="px-3 py-2 font-medium text-[#444444]">{r.model.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.baseCostL.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-[#73D700]">
                    {r.subsidyL.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.gstL.toFixed(1)}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-[#444444]">
                    {r.effectiveCostL.toFixed(1)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums font-semibold ${
                      r.deltaPerKm > 0 ? 'text-[#73D700]' : 'text-gray-400'
                    }`}
                  >
                    {r.deltaPerKm > 0 ? '−' : ''}
                    {fmtPerKm(Math.abs(r.deltaPerKm), showEur, eurRate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ====== 9. AMC ANALYSIS ====== */}
      <Section
        title="AMC Cost Trajectory (7 yrs)"
        subtitle="Locked vs variable AMC per OEM · BLOCKER = no AMC contract on offer"
      >
        <div className="overflow-x-auto rounded-md border border-gray-200">
          <table className="min-w-full text-[11px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-600">EV</th>
                {[1, 2, 3, 4, 5, 6, 7].map((y) => (
                  <th key={y} className="px-2 py-2 text-center font-semibold text-gray-600">
                    Y{y}
                  </th>
                ))}
                <th className="px-3 py-2 text-center font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {amcAnalysis.map(({ model, rows }) => {
                const overallStatus = rows.some((r) => r.status === 'BLOCKER')
                  ? 'BLOCKER'
                  : rows.every((r) => r.locked)
                  ? 'LOCKED'
                  : 'VARIABLE'
                return (
                  <tr key={model.id}>
                    <td className="px-3 py-2 font-medium text-[#444444] whitespace-nowrap">
                      {model.name}
                    </td>
                    {rows.map((r) => (
                      <td
                        key={r.year}
                        className={`px-2 py-2 text-center tabular-nums ${
                          r.locked
                            ? 'bg-[#73D700]/15 text-[#73D700] font-bold'
                            : r.status === 'BLOCKER'
                            ? 'bg-[#FFAD00]/10 text-[#FFAD00]'
                            : 'text-gray-700'
                        }`}
                        title={r.locked ? 'Locked' : r.status}
                      >
                        {r.locked && '🔒 '}
                        {r.amcPerKm.toFixed(2)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          overallStatus === 'LOCKED'
                            ? 'bg-[#73D700]/20 text-[#73D700]'
                            : overallStatus === 'BLOCKER'
                            ? 'bg-[#FFAD00]/10 text-[#FFAD00]'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {overallStatus}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {amcAnalysis.some((a) => a.model.tag === 'PREFERRED' && a.rows.every((r) => r.locked)) && (
          <div className="mt-3 rounded-md border-l-4 border-[#73D700] bg-[#73D700]/10 p-3 text-[11px] text-[#73D700]">
            <span className="font-bold">Azad advantage:</span> 8-year locked AMC eliminates ~₹2–3/km
            of variable maintenance escalation risk over the contract horizon.
          </div>
        )}
      </Section>

      {/* ====== 10. CARBON & ESG ====== */}
      <Section
        title="Carbon & ESG Impact"
        subtitle={`Based on grid intensity ${GRID_INTENSITY} kgCO₂/kWh and diesel ${2.68} kgCO₂/L`}
      >
        {carbon ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KPI
              label="Per bus / yr"
              value={`${(carbon.perBusPerYearKg / 1000).toFixed(1)} t CO₂`}
              tone="green"
            />
            <KPI
              label={`Fleet (${fleetBuses} bus · ${totalYears}yr)`}
              value={`${carbon.fleetTotalTonnesHorizon.toFixed(0)} t CO₂`}
              tone="green"
            />
            <KPI
              label="Carbon value @₹500/t"
              value={fmtLakhs(carbon.rupeeValueHorizon / 100000)}
              tone="green"
            />
            <KPI label="Grid intensity" value={`${carbon.gridIntensity} kgCO₂/kWh`} />
          </div>
        ) : (
          <div className="text-[11px] text-gray-400 italic">
            Add a diesel reference to compute carbon savings.
          </div>
        )}
      </Section>
    </div>
  )
}

/* ============================================================
   Sub-components
   ============================================================ */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-[#444444]">{title}</h3>
        {subtitle && <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function KPI({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'green' | 'red'
}) {
  const color =
    tone === 'green' ? 'text-[#73D700]' : tone === 'red' ? 'text-[#FFAD00]' : 'text-[#444444]'
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="text-[10px] text-gray-500 uppercase font-bold tracking-wide">{label}</div>
      <div className={`text-lg font-bold tabular-nums mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 truncate">{sub}</div>}
    </div>
  )
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[10px]">
      <span className="text-gray-500">{label}</span>
      <input
        type="number"
        value={value}
        step={0.5}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded bg-white border border-gray-200 px-2 py-1 text-[11px] text-[#444444] text-right focus:border-[#73D700] focus:outline-none"
      />
    </label>
  )
}

function FeasibilityBadge({ status }: { status: FeasibilityStatus }) {
  const map: Record<FeasibilityStatus, { label: string; cls: string }> = {
    VIABLE: { label: 'VIABLE', cls: 'bg-[#73D700]/20 text-[#73D700]' },
    VIABLE_FAST_CHARGE: { label: 'FAST-CHARGE', cls: 'bg-[#73D700]/15 text-[#73D700]' },
    INFRA_NEEDED: { label: 'INFRA NEEDED', cls: 'bg-amber-100 text-amber-800' },
    MARGINAL: { label: 'MARGINAL', cls: 'bg-amber-100 text-amber-800' },
    NOT_VIABLE: { label: 'NOT VIABLE', cls: 'bg-[#FFAD00]/10 text-[#FFAD00]' },
    UNKNOWN: { label: 'UNKNOWN', cls: 'bg-gray-200 text-gray-700' },
  }
  const m = map[status]
  return <span className={`text-[9px] px-2 py-0.5 rounded font-bold ${m.cls}`}>{m.label}</span>
}
