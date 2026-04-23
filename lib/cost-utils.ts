/**
 * cost-utils.ts — single source of truth for cost definitions.
 *
 * GUIDING PRINCIPLE: GST is NOT part of operational cost.
 * GST is a tax overlay that Flix pays the partner and reclaims via ITC.
 * The real operational cost is MinG only. GST/TDS show as separate tax/cash lines.
 *
 * Sign convention used here (intentionally INVERTED from lib/formatters.ts
 * computeDelta — that one is left untouched for legacy callers):
 *
 *   delta% = (minG - pc) / pc × 100
 *     positive → MinG above PC → Flix overpaying (bad)
 *     negative → MinG below PC → margin for partner (good)
 */

import type { HubRow, Line } from '@/types'

// ---------- Real cost: MinG only, ex-GST ----------

/** Real cost per km for one row = MinG (ex-GST). The ONLY figure used for
 *  cost benchmarking, delta%, health, targets. */
export const realCostPerKm = (row: HubRow): number => row.minG

/** km-weighted average MinG across a set of rows. Use for fleet ₹/km headline.
 *  Dec 2024 expected result: ~₹56.84/km. */
export const weightedRealCost = (rows: HubRow[]): number => {
  const totalKm = rows.reduce((s, r) => s + (r.busKm || 0), 0)
  if (totalKm === 0) return 0
  return rows.reduce((s, r) => s + (r.minG || 0) * (r.busKm || 0), 0) / totalKm
}

/** Contracted fleet km-weighted MinG from bl2 baseline lines.
 *  Uses raw min_g (NOT effectiveMinG) with monthly contracted km as weight.
 *  Returns ₹54.77/km for current fleet. */
export const contractedWtdMinGFromBl2 = (bl2Lines: Bl2Line[]): number => {
  const totalKm = bl2Lines.reduce((s, l) => s + l.ow_km * l.rt * 2 * l.buses, 0)
  if (totalKm === 0) return 0
  return bl2Lines.reduce(
    (s, l) => s + l.min_g * l.ow_km * l.rt * 2 * l.buses, 0,
  ) / totalKm
}

/** Actual km-weighted effective MinG from sheet rows.
 *  For 18% partners uses minG × 1.13, for 5% partners uses raw minG.
 *  This is the comparable figure against pc5 and contractedWtdMinGFromBl2. */
export const actualWtdEffectiveMinG = (rows: HubRow[]): number => {
  const totalKm = rows.reduce((s, r) => s + (r.busKm || 0), 0)
  if (totalKm === 0) return 0
  return rows.reduce(
    (s, r) => s + effectiveMinG(r.minG || 0, r.gstRate >= 0.18 ? 18 : 5) * (r.busKm || 0), 0,
  ) / totalKm
}

/** Fleet-level weekly forecast from bl2 contracted volumes × season factor.
 *  Uses monthly_lakhs (pre-computed from bl2 lines) scaled by season.
 *  March (S=0.71): ₹360.1L/wk. January (XL=1.0): ₹506.9L/wk. */
export function fleetWeeklyForecastFromBl2(bl2Lines: Bl2Line[], monthNo: number) {
  const season = MONTH_SEASON[monthNo] ?? 'L'
  const factor = SEASON_FACTORS[season]
  const forecastPayoutL = bl2Lines.reduce((s, l) => s + l.monthly_lakhs * factor, 0) / 4.33
  const forecastKm = bl2Lines.reduce(
    (s, l) => s + l.ow_km * l.rt * 2 * l.buses / 4.33 * factor, 0,
  )
  return { forecastPayoutL, forecastKm, season, factor }
}

// ---------- Cash flow lines (NOT cost) ----------

/** Net cash out per km = payable / busKm. Includes GST collected + TDS deducted.
 *  ⚠ Shows BELOW MinG because TDS is subtracted. NEVER label as "effective cost". */
export const netPayablePerKm = (row: HubRow): number =>
  row.busKm > 0 ? row.payableAmount / row.busKm : 0

/** GST amount per km — tax line, shown separately from cost. */
export const gstPerKm = (row: HubRow): number =>
  row.busKm > 0 ? row.gstAmount / row.busKm : 0

/** TDS per km — timing item, shown separately. */
export const tdsPerKm = (row: HubRow): number =>
  row.busKm > 0 ? row.tdsAmount / row.busKm : 0

/** Total GST paid (₹L) for a set of rows. */
export const totalGstLakhs = (rows: HubRow[]): number =>
  rows.reduce((s, r) => s + (r.gstAmount || 0), 0) / 1e5

/** Total TDS deducted (₹L) for a set of rows. */
export const totalTdsLakhs = (rows: HubRow[]): number =>
  rows.reduce((s, r) => s + (r.tdsAmount || 0), 0) / 1e5

/** Gross payout (₹L) before GST/TDS = MinG × km. */
export const grossPayoutLakhs = (rows: HubRow[]): number =>
  rows.reduce((s, r) => s + (r.basicValue || 0), 0) / 1e5

/** Net payable (₹L) — cash actually leaving Flix this week. */
export const netPayableLakhs = (rows: HubRow[]): number =>
  rows.reduce((s, r) => s + (r.payableAmount || 0), 0) / 1e5

// ---------- GST regime change (Apr 1 2025 — 5% → 18% for some partners) ----------

/** GST rates before and after the Apr 1 2025 step-up for affected partners. */
export const GST_PRE_STEP = 0.05
export const GST_POST_STEP = 0.18
/** The delta applied to MinG when computing the real cost impact for rows
 *  that fall under the 18% slab post-step-up. = 0.13. */
export const GST_STEP_DELTA = GST_POST_STEP - GST_PRE_STEP

/** True for rows in or after April 2025 — GST step-up regime. */
export const isPostApr2025 = (row: { year: number; monthNo: number }): boolean =>
  row.year > 2025 || (row.year === 2025 && row.monthNo >= 4)

/** Detects rows in any window where 18% GST is in force. */
export const isHighGstPartner = (row: HubRow): boolean => row.gstRate >= 0.18

/** GST step-up cost impact per km for 18% partners post-Apr-2025.
 *  Computed as MinG × (18% − 5%) = MinG × 0.13 — the ITC-recoverable
 *  baseline was 5%, so the 13-point jump is the incremental real cost
 *  to Flix, not a pure tax pass-through. Zero for 5% partners or for
 *  rows pre-Apr-2025. */
export const gstStepUpPerKm = (row: HubRow): number => {
  if (row.gstRate < GST_POST_STEP) return 0
  if (!isPostApr2025(row)) return 0
  return (row.minG || 0) * GST_STEP_DELTA
}

/** Weekly GST step-up cost impact (₹L) for affected rows. */
export const weeklyGstStepUpLakhs = (rows: HubRow[]): number =>
  rows.reduce((s, r) => s + gstStepUpPerKm(r) * (r.busKm || 0), 0) / 1e5

/** Aggregates the rows that fall under the 18% GST step-up regime. */
export const filterHighGstRows = (rows: HubRow[]): HubRow[] =>
  rows.filter(isHighGstPartner)

/** Real cost per km INCLUDING the GST step-up impact for 18% partners
 *  post-Apr-2025. This is the figure to use when the ₹56.56 leadership
 *  target is being evaluated with the GST regime change in force:
 *  weighted((MinG + gstStepUpPerKm) × km) / Σ km. */
export const weightedRealCostWithGstImpact = (rows: HubRow[]): number => {
  const totalKm = rows.reduce((s, r) => s + (r.busKm || 0), 0)
  if (totalKm === 0) return 0
  return (
    rows.reduce(
      (s, r) => s + ((r.minG || 0) + gstStepUpPerKm(r)) * (r.busKm || 0),
      0,
    ) / totalKm
  )
}

// ---------- PC UNIFICATION: Single pc5 benchmark, effectiveMinG for 18% ----------
//
// RULE: pc5 is the ONLY production cost benchmark for ALL lines.
// For 5% partners: compare minG vs pc5 directly.
// For 18% partners: compare (minG × 1.13) vs pc5 — the 13% = 18% − 5% GST burden.

/** Effective MinG — the comparable cost figure for ANY line.
 *  5% partners: raw minG (no adjustment)
 *  18% partners: minG × 1.13 (adds 13% GST burden above 5% baseline)
 *  This is what gets compared against pc5. */
export const effectiveMinG = (minG: number, gstSlab: number): number =>
  gstSlab === 18 ? minG * 1.13 : minG

/** Delta % — always effectiveMinG vs pc5.
 *  Positive = overpaying. Negative = healthy. */
export const deltaVsPc5 = (minG: number, gstSlab: number, pc5: number | null): number | null => {
  if (pc5 == null || pc5 === 0) return null
  return ((effectiveMinG(minG, gstSlab) - pc5) / pc5) * 100
}

/** Health — always based on effectiveMinG vs pc5. */
export const computeHealthVsPc5 = (
  minG: number,
  gstSlab: number,
  pc5: number | null,
): 'healthy' | 'marginal' | 'overpaying' | 'unknown' => {
  if (pc5 == null || pc5 === 0) return 'unknown'
  const delta = deltaVsPc5(minG, gstSlab, pc5)
  if (delta == null) return 'unknown'
  if (delta < 0) return 'healthy'     // any delta below 0% = healthy
  if (delta <= 1) return 'marginal'   // 0% to 1% inclusive = marginal
  return 'overpaying'                 // above 1% = overpaying
}

/** Renegotiation target — pc5 + 2% margin, for ALL lines. */
export const renegTarget = (pc5: number | null): number =>
  pc5 != null ? pc5 * 1.02 : 0

// Legacy compat — keep old function names as aliases for callers not yet migrated
/** @deprecated Use pc5 directly instead of getLinePc */
export const getLinePc = (line: Line): number | null => line.pc5

/** @deprecated Use deltaVsPc5 instead */
export const deltaPercent = (minG: number, pc: number | null): number | null => {
  if (pc == null || pc === 0) return null
  return ((minG - pc) / pc) * 100
}

/** @deprecated Use computeHealthVsPc5 instead */
export const computeLineHealth = (
  minG: number,
  pc: number | null,
): 'healthy' | 'marginal' | 'overpaying' | 'unknown' => {
  if (pc == null || pc === 0) return 'unknown'
  const delta = (minG - pc) / pc
  if (delta < 0) return 'healthy'
  if (delta <= 0.01) return 'marginal'
  return 'overpaying'
}

// ---------- Seasonality (used by forward projection) ----------

export const SEASON_FACTORS = { S: 0.71, L: 0.86, XL: 1.0 } as const

export const MONTH_SEASON: Record<number, 'S' | 'L' | 'XL'> = {
  1: 'XL', 2: 'L', 3: 'S', 4: 'S', 5: 'S', 6: 'S',
  7: 'S', 8: 'L', 9: 'L', 10: 'L', 11: 'XL', 12: 'XL',
}

/** Project a base weekly payout (₹L) from baseMonth into targetMonth using
 *  the season factor ratio. Real cost/km is unchanged — only volume scales. */
export const projectWeeklyPayoutL = (
  basePayoutL: number,
  targetMonth: number,
  baseMonth: number,
): number => {
  const baseFactor = SEASON_FACTORS[MONTH_SEASON[baseMonth] ?? 'L']
  const targetFactor = SEASON_FACTORS[MONTH_SEASON[targetMonth] ?? 'L']
  return basePayoutL * (targetFactor / baseFactor)
}

// ---------- Delta Decomposition Engine ----------

/** Bl2-style line used by the decomposition and forecast engines. Matches
 *  the shape returned by /api/bl-summary → lines[]. */
export interface Bl2Line {
  line_id: string
  line_name: string
  partner: string
  region: string
  buses: number
  bus_type: string
  gst_slab: number
  ow_km: number
  rt: number
  min_g: number
  pc5: number | null
  delta_pct: number | null
  health: string
  monthly_lakhs: number
  line_start_date: string | null
  line_end_date: string | null
  line_age_years?: number | null
  is_active?: boolean
}

/** Per-line, per-week seasonality map. Keys: line_id → yearWeek → factor. */
export type SeasonalityMap = Record<string, Record<string, number>>

/** Extended season factors including XS and HS. */
export const SEASON_FACTORS_EXT: Record<string, number> = {
  XS: 4 / 7,   // 0.5714
  S: 5 / 7,    // 0.7143
  HS: 6 / 7,   // 0.8571
  L: 6 / 7,    // 0.8571
  XL: 7 / 7,   // 1.0000
}

/**
 * Returns contracted km for a line in a given week.
 * Uses per-line week-level seasonality when available, falls back to month-bucket.
 * Applies pro-rata for launch week (line_start_date mid-week).
 * Returns 0 if line not yet launched or not operating that week.
 *
 * @param line - bl2 line object
 * @param yearWeek - e.g. "2026_W14"
 * @param weekStart - Monday of the week (Date)
 * @param seasonality - optional per-line seasonality map from bl-summary
 * @param fallbackMonthNo - month number for fallback season factor (1-12)
 */
export function getContractedKm(
  line: Bl2Line,
  yearWeek: string,
  weekStart: Date,
  seasonality?: SeasonalityMap | null,
  fallbackMonthNo?: number,
): number {
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6) // Sunday

  // Check per-line seasonality
  const lineSeason = seasonality?.[line.line_id]
  const hasWeekData = lineSeason != null && lineSeason[yearWeek] !== undefined

  // If seasonality data exists for this line but NOT for this week → line not operating
  if (lineSeason != null && !hasWeekData) {
    return 0
  }

  // Season factor: per-line-week if available, else month-bucket fallback
  let seasonFactor: number
  if (hasWeekData) {
    seasonFactor = lineSeason![yearWeek]
  } else if (fallbackMonthNo != null) {
    seasonFactor = SEASON_FACTORS[MONTH_SEASON[fallbackMonthNo] ?? 'L']
  } else {
    seasonFactor = SEASON_FACTORS['L'] // ultimate fallback
  }

  // Base weekly contracted km (rt is monthly round trips)
  const baseWeeklyKm = line.ow_km * line.rt * 2 * line.buses / 4.33

  // Pro-rata for launch week
  let proRataFactor = 1.0
  if (line.line_start_date) {
    const startDate = new Date(line.line_start_date)
    if (startDate > weekEnd) {
      return 0 // line not yet launched
    }
    if (startDate > weekStart && startDate <= weekEnd) {
      // Line launched mid-week
      const daysActive = Math.max(0,
        (weekEnd.getTime() - startDate.getTime()) / 86400000 + 1,
      )
      proRataFactor = Math.min(1, daysActive / 7)
    }
  }

  // Check end date
  if (line.line_end_date) {
    const endDate = new Date(line.line_end_date)
    if (endDate < weekStart) {
      return 0 // line retired before this week
    }
  }

  return baseWeeklyKm * seasonFactor * proRataFactor
}

export interface LineDecompDetail {
  lineId: string
  lineName: string
  partner: string
  region: string
  contractedMinG: number
  actualMinG: number
  rateChange: number
  rateChangeType: 'INCREASE' | 'DECREASE' | 'UNCHANGED'
  contractedKm: number
  actualKm: number
  volumeChange: number
  volumeChangeType: 'ABOVE' | 'BELOW' | 'ON_TARGET'
}

export interface DeltaDecomp {
  contractedWtdMinG: number
  actualWtdMinG: number
  totalDelta: number
  mixEffect: number
  rateEffect: number
  lineDetails: LineDecompDetail[]
  missingLines: Bl2Line[]
  linesRan: number
  linesContracted: number
}

export interface PayoutDecomp {
  contractedPayoutL: number
  actualPayoutL: number
  totalPayoutDeltaL: number
  volumeEffectL: number
  missingLinesEffectL: number
  rateEffectL: number
}

/** Rate change classification for drilldown. */
export type RateChangeClassification = 'RENEGOTIATED' | 'BASELINE_STALE' | 'NEW_LINE' | 'UNCHANGED'

/** Contracted weekly km for one bl2 line. */
export const contractedWeeklyKm = (l: Bl2Line): number =>
  l.ow_km * l.rt * 2 * l.buses / 4.33

/** Full three-way delta decomposition: mix + rate + volume = total Δ. */
export function computeDeltaDecomposition(
  weekRows: HubRow[],
  bl2Lines: Bl2Line[],
): DeltaDecomp {
  // Fleet contracted weighted MinG
  const allContractedKm = bl2Lines.reduce((s, l) => s + contractedWeeklyKm(l), 0)
  const contractedWtdMinG = allContractedKm > 0
    ? bl2Lines.reduce((s, l) => s + l.min_g * contractedWeeklyKm(l), 0) / allContractedKm
    : 0

  // Actual weighted MinG
  const totalActualKm = weekRows.reduce((s, r) => s + (r.busKm || 0), 0)
  const actualWtdMinG = totalActualKm > 0
    ? weekRows.reduce((s, r) => s + (r.minG || 0) * (r.busKm || 0), 0) / totalActualKm
    : 0

  const totalDelta = actualWtdMinG - contractedWtdMinG

  // Build bl2 lookup
  const bl2Map = new Map(bl2Lines.map(l => [l.line_id, l]))

  // Mix effect: what would avg MinG be if ran lines used their CONTRACTED rate?
  const mixMinG = totalActualKm > 0
    ? weekRows.reduce((s, r) => {
        const bl2 = bl2Map.get(r.lineId)
        return s + (bl2 ? bl2.min_g : r.minG) * (r.busKm || 0)
      }, 0) / totalActualKm
    : 0
  const mixEffect = mixMinG - contractedWtdMinG

  // Rate effect: Δ between actual and contracted MinG, weighted by actual km
  const rateEffect = totalActualKm > 0
    ? weekRows.reduce((s, r) => {
        const bl2 = bl2Map.get(r.lineId)
        if (!bl2) return s
        return s + (r.minG - bl2.min_g) * (r.busKm || 0)
      }, 0) / totalActualKm
    : 0

  // Per-line details
  const lineDetails: LineDecompDetail[] = weekRows
    .map((r) => {
      const bl2 = bl2Map.get(r.lineId)
      if (!bl2) return null
      const rc = r.minG - bl2.min_g
      const cKm = contractedWeeklyKm(bl2)
      const vc = (r.busKm || 0) - cKm
      return {
        lineId: r.lineId,
        lineName: r.lineName,
        partner: r.partner,
        region: r.region,
        contractedMinG: bl2.min_g,
        actualMinG: r.minG,
        rateChange: rc,
        rateChangeType: (rc > 0.5 ? 'INCREASE' : rc < -0.5 ? 'DECREASE' : 'UNCHANGED') as 'INCREASE' | 'DECREASE' | 'UNCHANGED',
        contractedKm: Math.round(cKm),
        actualKm: r.busKm,
        volumeChange: Math.round(vc),
        volumeChangeType: (vc > 0 ? 'ABOVE' : vc < 0 ? 'BELOW' : 'ON_TARGET') as 'ABOVE' | 'BELOW' | 'ON_TARGET',
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Math.abs(b.rateChange) - Math.abs(a.rateChange)) as LineDecompDetail[]

  // Missing lines
  const sheetLineIds = new Set(weekRows.map((r) => r.lineId))
  const missingLines = bl2Lines.filter((l) => !sheetLineIds.has(l.line_id))

  return {
    contractedWtdMinG,
    actualWtdMinG,
    totalDelta,
    mixEffect,
    rateEffect,
    lineDetails,
    missingLines,
    linesRan: new Set(weekRows.map(r => r.lineId)).size,
    linesContracted: bl2Lines.length,
  }
}

/** ₹L payout variance decomposition: volume + missing lines + rate.
 *  This is the PAYOUT-level equivalent of the ₹/km decomposition above.
 *  Volume effect is the dominant driver here (not relevant for ₹/km). */
export function decomposePayout(
  weekRows: HubRow[],
  bl2Lines: Bl2Line[],
): PayoutDecomp {
  const bl2Map = new Map(bl2Lines.map(l => [l.line_id, l]))

  // Contracted weekly payout (all bl2 lines at their contracted km)
  const contractedPayoutL = bl2Lines.reduce(
    (s, l) => s + l.min_g * contractedWeeklyKm(l), 0,
  ) / 1e5

  // Actual payout from sheet
  const actualPayoutL = weekRows.reduce(
    (s, r) => s + (r.minG || 0) * (r.busKm || 0), 0,
  ) / 1e5

  // Aggregate actual rows by lineId (a line can appear as multiple rows)
  const actualByLine = new Map<string, { km: number; payout: number }>()
  for (const r of weekRows) {
    const existing = actualByLine.get(r.lineId)
    if (existing) {
      existing.km += r.busKm || 0
      existing.payout += (r.minG || 0) * (r.busKm || 0)
    } else {
      actualByLine.set(r.lineId, {
        km: r.busKm || 0,
        payout: (r.minG || 0) * (r.busKm || 0),
      })
    }
  }

  // Volume effect: (actual km − contracted km) × contracted MinG, per matched line
  let volumeEffectL = 0
  let rateEffectL = 0
  actualByLine.forEach((actual, lineId) => {
    const bl2 = bl2Map.get(lineId)
    if (!bl2) return
    const cKm = contractedWeeklyKm(bl2)
    volumeEffectL += bl2.min_g * (actual.km - cKm) / 1e5
    const actualMinG = actual.km > 0 ? actual.payout / actual.km : 0
    rateEffectL += (actualMinG - bl2.min_g) * actual.km / 1e5
  })

  // Missing lines: contracted payout that didn't materialise (negative impact)
  const sheetLineIds = new Set(weekRows.map(r => r.lineId))
  const missingLinesEffectL = -bl2Lines
    .filter(l => !sheetLineIds.has(l.line_id))
    .reduce((s, l) => s + l.min_g * contractedWeeklyKm(l) / 1e5, 0)

  return {
    contractedPayoutL: +contractedPayoutL.toFixed(2),
    actualPayoutL: +actualPayoutL.toFixed(2),
    totalPayoutDeltaL: +(actualPayoutL - contractedPayoutL).toFixed(2),
    volumeEffectL: +volumeEffectL.toFixed(2),
    missingLinesEffectL: +missingLinesEffectL.toFixed(2),
    rateEffectL: +rateEffectL.toFixed(2),
  }
}

// ---------- Line-level Forecast ----------

export interface LineForecast {
  lineId: string
  lineName: string
  partner: string
  region: string
  season: string
  factor: number
  contractedWeeklyKm: number
  forecastKm: number
  forecastPayoutL: number
  minG: number
}

export interface FleetForecast {
  lineForecasts: LineForecast[]
  totalForecastKm: number
  totalForecastPayoutL: number
  forecastWtdMinG: number
  season: string
  factor: number
}

/** Forecast weekly km for one bl2 line, scaled by season factor. */
export const lineForecastWeeklyKm = (
  owKm: number,
  rt: number,
  buses: number,
  monthNo: number,
): number => {
  const factor = SEASON_FACTORS[MONTH_SEASON[monthNo] ?? 'L']
  return owKm * rt * 2 * buses / 4.33 * factor
}

/** Fleet-level weekly forecast from bl2 lines for a given month. */
export function forecastFleetWeek(bl2Lines: Bl2Line[], monthNo: number): FleetForecast {
  const season = MONTH_SEASON[monthNo] ?? 'L'
  const factor = SEASON_FACTORS[season]

  const lineForecasts: LineForecast[] = bl2Lines.map((l) => {
    const cKm = contractedWeeklyKm(l)
    const fKm = lineForecastWeeklyKm(l.ow_km, l.rt, l.buses, monthNo)
    const fPayoutL = l.min_g * fKm / 1e5
    return {
      lineId: l.line_id,
      lineName: l.line_name,
      partner: l.partner,
      region: l.region,
      season,
      factor,
      contractedWeeklyKm: Math.round(cKm),
      forecastKm: Math.round(fKm),
      forecastPayoutL: +fPayoutL.toFixed(2),
      minG: l.min_g,
    }
  })

  const totalForecastKm = lineForecasts.reduce((s, l) => s + l.forecastKm, 0)
  const totalForecastPayoutL = lineForecasts.reduce((s, l) => s + l.forecastPayoutL, 0)
  const forecastWtdMinG = totalForecastKm > 0
    ? lineForecasts.reduce((s, l) => s + l.minG * l.forecastKm, 0) / totalForecastKm
    : 0

  return {
    lineForecasts,
    totalForecastKm,
    totalForecastPayoutL,
    forecastWtdMinG,
    season,
    factor,
  }
}

// ---------- Constants ----------

/** First yearWeek of April 2025 — used to annotate trend charts at the GST step-up date. */
export const GST_CHANGE_YEAR_WEEK = '2025_W14'

// ---------- ISO week formatting ----------

/** Returns the Monday (UTC) of ISO week `week` in `year`. */
export const isoWeekStart = (year: number, week: number): Date => {
  // Per ISO 8601, Jan 4 is always in week 1. Find that week's Monday, then
  // add (week - 1) weeks.
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7 // Sun=0 → 7
  const week1Mon = new Date(jan4)
  week1Mon.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1)
  const start = new Date(week1Mon)
  start.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7)
  return start
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Formats a yearWeek string like "2026_W14" to its canonical ISO week range,
 *  e.g. "30 Mar to 5 Apr". Falls back to the input if it can't be parsed. */
export const formatYearWeekRange = (yearWeek: string): string => {
  const m = /^(\d{4})_W(\d+)$/.exec(yearWeek)
  if (!m) return yearWeek
  const year = parseInt(m[1], 10)
  const week = parseInt(m[2], 10)
  const start = isoWeekStart(year, week)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  const startStr = `${start.getUTCDate()} ${MONTH_SHORT[start.getUTCMonth()]}`
  const endStr = `${end.getUTCDate()} ${MONTH_SHORT[end.getUTCMonth()]}`
  return `${startStr} to ${endStr}`
}
