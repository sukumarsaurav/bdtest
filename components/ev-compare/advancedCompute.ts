import { EVModel, ModelResult, RouteConfig } from './types'

/* ============================================================
   Constants
   ============================================================ */

export const CHART_COLORS: Record<string, string> = {
  azad: '#73D700',
  'jbm-gen2': '#2563eb',
  'jbm-gen1': '#93c5fd',
  'eicher-skyline-pro-e': '#f59e0b',
  'tata-magna': '#FFAD00',
  'exponent-veera': '#7c3aed',
  'olectra-k9': '#14b8a6',
  futura: '#9ca3af',
  'diesel-ref': '#444444',
}

export const COST_STACK_COLORS = {
  energy: '#2563eb',
  financing: '#444444',
  amc: '#f59e0b',
  battery: '#FFAD00',
  driverHr: '#7c3aed',
  tyresAdmin: '#14b8a6',
  infra: '#6b7280',
} as const

export type CostStackKey = keyof typeof COST_STACK_COLORS

export const COST_STACK_LABELS: Record<CostStackKey, string> = {
  energy: 'Energy',
  financing: 'Financing (EMI)',
  amc: 'AMC / Maintenance',
  battery: 'Battery replacement',
  driverHr: 'Driver + HR',
  tyresAdmin: 'Tyres + Admin',
  infra: 'Charging infra',
}

export const SUBSIDY_DEFAULTS = {
  fameII_L: 25, // ₹ lakh
  stateSub_L: 3, // ₹ lakh
  gstEvPct: 5,
  gstIcePct: 28,
}

export const GRID_INTENSITY = 0.72 // kgCO2 / kWh (India avg)
export const DIESEL_CO2_KG_L = 2.68 // kgCO2 / litre
export const CARBON_VALUE_PER_TONNE = 500 // ₹ / tCO2

/* ============================================================
   NPV / IRR / Payback
   ============================================================ */

export interface NpvIrrResult {
  npvRs: number
  irrPct: number | null
  paybackYear: number | null
  cumulativeSavings: number[] // per year
}

export function computeNpvIrr(
  evResult: ModelResult,
  dieselResult: ModelResult,
  discountRatePct = 10
): NpvIrrResult {
  const rate = discountRatePct / 100
  const evYears = evResult.yearlyData
  const diYears = dieselResult.yearlyData
  const n = Math.min(evYears.length, diYears.length)

  // Acquisition premium (EV price - ICE price) as Year 0 outflow
  const acquisitionDelta =
    (evResult.model.vehiclePriceL - dieselResult.model.vehiclePriceL) * 100000

  let npv = -acquisitionDelta
  const cumulativeSavings: number[] = []
  let running = -acquisitionDelta
  let paybackYear: number | null = null

  for (let i = 0; i < n; i++) {
    const evCost = evYears[i].totalPerKm * evYears[i].kmThisYear
    const diCost = diYears[i].totalPerKm * diYears[i].kmThisYear
    const saving = diCost - evCost // EV cheaper → positive
    npv += saving / Math.pow(1 + rate, i + 1)
    running += saving
    cumulativeSavings.push(running)
    if (paybackYear === null && running >= 0) paybackYear = i + 1
  }

  // IRR via bisection
  const cashflows = [-acquisitionDelta]
  for (let i = 0; i < n; i++) {
    const evCost = evYears[i].totalPerKm * evYears[i].kmThisYear
    const diCost = diYears[i].totalPerKm * diYears[i].kmThisYear
    cashflows.push(diCost - evCost)
  }
  const irr = bisectIrr(cashflows)

  return {
    npvRs: npv,
    irrPct: irr,
    paybackYear,
    cumulativeSavings,
  }
}

function npvAt(cashflows: number[], rate: number): number {
  let v = 0
  for (let i = 0; i < cashflows.length; i++) v += cashflows[i] / Math.pow(1 + rate, i)
  return v
}

function bisectIrr(cashflows: number[]): number | null {
  // require sign change
  const hasPos = cashflows.some((c) => c > 0)
  const hasNeg = cashflows.some((c) => c < 0)
  if (!hasPos || !hasNeg) return null
  let lo = -0.9
  let hi = 5 // up to 500%
  let fLo = npvAt(cashflows, lo)
  let fHi = npvAt(cashflows, hi)
  if (fLo * fHi > 0) return null
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    const fMid = npvAt(cashflows, mid)
    if (Math.abs(fMid) < 1) return mid * 100
    if (fLo * fMid < 0) {
      hi = mid
      fHi = fMid
    } else {
      lo = mid
      fLo = fMid
    }
  }
  return ((lo + hi) / 2) * 100
}

/* ============================================================
   Sensitivity Tornado (±20% on 8 inputs for a baseline EV vs ICE)
   ============================================================ */

export interface SensitivityBar {
  label: string
  low: number // ₹/km at -20%
  high: number // ₹/km at +20%
  baseline: number
  spreadAbs: number
}

export function computeSensitivity(
  baselineEv: ModelResult,
  diesel: ModelResult,
  recompute: (
    modelPatch: Partial<EVModel> | null,
    dieselPatch: Partial<EVModel> | null,
    annualKmFactor: number
  ) => { evAvg: number; diAvg: number }
): SensitivityBar[] {
  const baseResult = recompute(null, null, 1)
  const baseDelta = baseResult.evAvg - baseResult.diAvg // negative = EV cheaper

  const runDelta = (
    modelPatch: Partial<EVModel> | null,
    dieselPatch: Partial<EVModel> | null,
    annualKmFactor = 1
  ) => {
    const r = recompute(modelPatch, dieselPatch, annualKmFactor)
    return r.evAvg - r.diAvg
  }

  const bars: SensitivityBar[] = []

  // 1. Diesel price ±20%
  const dieselBase = diesel.model.chargingOrFuelCostPerUnit ?? 90
  bars.push(
    makeBar(
      'Diesel price',
      runDelta(null, { chargingOrFuelCostPerUnit: dieselBase * 0.8 }),
      runDelta(null, { chargingOrFuelCostPerUnit: dieselBase * 1.2 }),
      baseDelta
    )
  )

  // 2. AMC / maintenance escalation — apply to EV maintenancePerKm
  const evMaint = baselineEv.model.maintenancePerKm
  bars.push(
    makeBar(
      'AMC escalation',
      runDelta({ maintenancePerKm: evMaint * 0.8 }, null),
      runDelta({ maintenancePerKm: evMaint * 1.2 }, null),
      baseDelta
    )
  )

  // 3. Electricity / charging cost ±20%
  const evRate = baselineEv.model.chargingOrFuelCostPerUnit ?? 8
  bars.push(
    makeBar(
      'Electricity rate',
      runDelta({ chargingOrFuelCostPerUnit: evRate * 0.8 }, null),
      runDelta({ chargingOrFuelCostPerUnit: evRate * 1.2 }, null),
      baseDelta
    )
  )

  // 4. Battery replacement cost ±20%
  const bCost = baselineEv.model.batteryReplacementCostL ?? 45
  bars.push(
    makeBar(
      'Battery cost',
      runDelta({ batteryReplacementCostL: bCost * 0.8 }, null),
      runDelta({ batteryReplacementCostL: bCost * 1.2 }, null),
      baseDelta
    )
  )

  // 5. Annual KM ±20%
  bars.push(
    makeBar('Annual KM', runDelta(null, null, 0.8), runDelta(null, null, 1.2), baseDelta)
  )

  // 6. Acquisition price ±20%
  const evPrice = baselineEv.model.vehiclePriceL
  bars.push(
    makeBar(
      'Acquisition price',
      runDelta({ vehiclePriceL: evPrice * 0.8 }, null),
      runDelta({ vehiclePriceL: evPrice * 1.2 }, null),
      baseDelta
    )
  )

  // 7. Interest rate ±20% (relative)
  const ir = baselineEv.model.interestRatePct
  bars.push(
    makeBar(
      'Interest rate',
      runDelta({ interestRatePct: ir * 0.8 }, null),
      runDelta({ interestRatePct: ir * 1.2 }, null),
      baseDelta
    )
  )

  // 8. Consumption / range ±20% (affects energy ₹/km)
  const kwh = baselineEv.model.energyConsumptionKWhPerKm ?? 1.2
  bars.push(
    makeBar(
      'Consumption (kWh/km)',
      runDelta({ energyConsumptionKWhPerKm: kwh * 0.8 }, null),
      runDelta({ energyConsumptionKWhPerKm: kwh * 1.2 }, null),
      baseDelta
    )
  )

  // sort by |spread| desc
  bars.sort((a, b) => b.spreadAbs - a.spreadAbs)
  return bars
}

function makeBar(label: string, lowDelta: number, highDelta: number, baseline: number): SensitivityBar {
  return {
    label,
    low: lowDelta,
    high: highDelta,
    baseline,
    spreadAbs: Math.abs(highDelta - lowDelta),
  }
}

/* ============================================================
   Yearly Delta % table (EV vs ICE, per year)
   ============================================================ */

export interface DeltaCell {
  year: number
  evPerKm: number
  dieselPerKm: number
  deltaPct: number // negative = EV cheaper
  isBatteryYear: boolean
}

export function computeYearlyDelta(
  evResult: ModelResult,
  dieselResult: ModelResult
): DeltaCell[] {
  const cells: DeltaCell[] = []
  const n = Math.min(evResult.yearlyData.length, dieselResult.yearlyData.length)
  const batteryYears = new Set(evResult.batteryEvents.map((e) => e.year))
  for (let i = 0; i < n; i++) {
    const ev = evResult.yearlyData[i]
    const di = dieselResult.yearlyData[i]
    const deltaPct = di.totalPerKm > 0 ? ((ev.totalPerKm - di.totalPerKm) / di.totalPerKm) * 100 : 0
    cells.push({
      year: ev.year,
      evPerKm: ev.totalPerKm,
      dieselPerKm: di.totalPerKm,
      deltaPct,
      isBatteryYear: batteryYears.has(ev.year),
    })
  }
  return cells
}

/* ============================================================
   Risk score per model
   ============================================================ */

export interface RiskBreakdown {
  score: number
  reasons: string[]
}

export function computeRisk(model: EVModel): RiskBreakdown {
  let score = 0
  const reasons: string[] = []
  if (model.type !== 'ev') return { score: 0, reasons: [] }

  if (!model.amcDurationYrs || model.amcDurationYrs === 0) {
    score += 3
    reasons.push('AMC unknown (+3)')
  }
  if (model.amcLocked === false) {
    score += 2
    reasons.push('AMC unlocked post-contract (+2)')
  }
  if (model.rangeUnknown) {
    score += 2
    reasons.push('Range claim unclear (+2)')
  }
  if (model.batteryChemistry === 'NMC') {
    score += 1
    reasons.push('NMC chemistry — thermal risk (+1)')
  }
  if (model.priceUnknown) {
    score += 1
    reasons.push('Price TBD (+1)')
  }
  if (model.warrantyNote === 'unclear') {
    score += 2
    reasons.push('Warranty terms unclear (+2)')
  }
  return { score, reasons }
}

/* ============================================================
   Range Feasibility
   ============================================================ */

export type FeasibilityStatus =
  | 'VIABLE'
  | 'VIABLE_FAST_CHARGE'
  | 'INFRA_NEEDED'
  | 'MARGINAL'
  | 'NOT_VIABLE'
  | 'UNKNOWN'

export interface FeasibilityResult {
  realRangeKm: number
  owKm: number
  stopsRequired: number
  status: FeasibilityStatus
  note: string
}

export function computeFeasibility(model: EVModel, route: RouteConfig): FeasibilityResult {
  if (model.type !== 'ev') {
    return {
      realRangeKm: 0,
      owKm: route.owKm,
      stopsRequired: 0,
      status: 'VIABLE',
      note: 'ICE — no range constraint',
    }
  }
  if (model.rangeUnknown || !model.rangeKm) {
    return {
      realRangeKm: 0,
      owKm: route.owKm,
      stopsRequired: 0,
      status: 'UNKNOWN',
      note: 'Range claim unclear',
    }
  }
  const realRange = model.rangeKm * 0.85
  const owKm = route.owKm
  const stops = Math.max(0, Math.ceil(owKm / realRange) - 1)
  let status: FeasibilityStatus
  let note = ''
  if (realRange >= owKm * 1.15) {
    status = 'VIABLE'
    note = 'Single-leg OW on full charge'
  } else if (realRange >= owKm) {
    status = 'MARGINAL'
    note = 'Real range ≈ OW km — tight margin'
  } else if (model.fastCharge) {
    status = 'VIABLE_FAST_CHARGE'
    note = `${stops} fast-charge stop(s) on RT`
  } else if (stops <= 2) {
    status = 'INFRA_NEEDED'
    note = `${stops} charging stop(s) required — infra dependent`
  } else {
    status = 'NOT_VIABLE'
    note = 'Real range far below OW km'
  }
  return { realRangeKm: realRange, owKm, stopsRequired: stops, status, note }
}

/* ============================================================
   Subsidy modelling
   ============================================================ */

export interface SubsidyInputs {
  fameII_L: number
  stateSub_L: number
  gstEvPct: number
  gstIcePct: number
}

export interface SubsidyImpact {
  baseCostL: number
  subsidyL: number
  gstL: number
  effectiveCostL: number
  deltaPerKm: number
}

export function computeSubsidy(
  model: EVModel,
  subsidy: SubsidyInputs,
  totalKm: number
): SubsidyImpact {
  const base = model.vehiclePriceL
  if (model.type === 'diesel') {
    const gst = base * (subsidy.gstIcePct / 100)
    return {
      baseCostL: base,
      subsidyL: 0,
      gstL: gst,
      effectiveCostL: base + gst,
      deltaPerKm: 0,
    }
  }
  const sub = subsidy.fameII_L + subsidy.stateSub_L
  const gst = base * (subsidy.gstEvPct / 100)
  const effective = base - sub + gst
  // deltaPerKm vs no-subsidy scenario
  const deltaPerKm =
    totalKm > 0 ? ((sub - (base * subsidy.gstEvPct) / 100) * 100000) / totalKm : 0
  return {
    baseCostL: base,
    subsidyL: sub,
    gstL: gst,
    effectiveCostL: effective,
    deltaPerKm,
  }
}

/* ============================================================
   AMC Analysis (7-year view)
   ============================================================ */

export interface AmcRow {
  year: number
  amcPerKm: number
  locked: boolean
  status: 'LOCKED' | 'VARIABLE' | 'BLOCKER'
}

export function computeAmcRows(model: EVModel, years: number): AmcRow[] {
  const rows: AmcRow[] = []
  const dur = model.amcDurationYrs ?? 0
  const base = model.amc ?? model.maintenancePerKm
  for (let y = 1; y <= years; y++) {
    let status: AmcRow['status'] = 'VARIABLE'
    let locked = false
    let amc = base
    if (dur === 0) {
      status = 'BLOCKER'
      amc = base * Math.pow(1.08, y - 1)
    } else if (y <= dur && model.amcLocked) {
      status = 'LOCKED'
      locked = true
    } else if (y <= dur && !model.amcLocked) {
      status = 'VARIABLE'
      amc = base * Math.pow(1.05, y - 1)
    } else {
      status = 'VARIABLE'
      amc = base * Math.pow(1.08, y - 1)
    }
    rows.push({ year: y, amcPerKm: amc, locked, status })
  }
  return rows
}

/* ============================================================
   Carbon / ESG
   ============================================================ */

export interface CarbonResult {
  perBusPerYearKg: number
  fleetTotalKgYear: number
  fleetTotalTonnesHorizon: number
  rupeeValueHorizon: number
  gridIntensity: number
}

export function computeCarbon(
  ev: ModelResult,
  diesel: ModelResult,
  annualKm: number,
  fleetBuses: number,
  horizonYears: number
): CarbonResult {
  const dieselLitresPerKm = 1 / (diesel.model.mileageKmPerL ?? 3.8)
  const dieselCo2PerKm = dieselLitresPerKm * DIESEL_CO2_KG_L
  const evKwhPerKm = ev.model.energyConsumptionKWhPerKm ?? 1.2
  const evCo2PerKm = evKwhPerKm * GRID_INTENSITY
  const savedPerKm = Math.max(0, dieselCo2PerKm - evCo2PerKm)
  const perBusYear = savedPerKm * annualKm
  const fleetYear = perBusYear * fleetBuses
  const fleetHorizonTonnes = (fleetYear * horizonYears) / 1000
  const rupeeValue = fleetHorizonTonnes * CARBON_VALUE_PER_TONNE
  return {
    perBusPerYearKg: perBusYear,
    fleetTotalKgYear: fleetYear,
    fleetTotalTonnesHorizon: fleetHorizonTonnes,
    rupeeValueHorizon: rupeeValue,
    gridIntensity: GRID_INTENSITY,
  }
}

/* ============================================================
   Cost Stack (grouped per model for stacked bar chart)
   ============================================================ */

export interface CostStackRow {
  modelId: string
  modelName: string
  energy: number
  financing: number
  amc: number
  battery: number
  driverHr: number
  tyresAdmin: number
  infra: number
  total: number
  amcUnknown: boolean
  priceUnknown: boolean
  chemistry?: 'LFP' | 'NMC'
}

export function computeCostStack(results: ModelResult[]): CostStackRow[] {
  return results.map((r) => {
    // Weighted average of each component across years
    const totalKm = r.totalKm || 1
    const sum = (key: string) =>
      r.yearlyData.reduce((s, y) => s + (y as any)[key] * y.kmThisYear, 0) / totalKm

    const energy = sum('fuelOrCharging')
    const financing = sum('emi')
    const amc = sum('maintenance')
    const battery = sum('batteryReplacement') + sum('refurbCost')
    const driverHr = sum('dhSalary') + sum('uniform') + sum('dashcam')
    const tyresAdmin =
      sum('tyres') +
      sum('admin') +
      sum('liasoning') +
      sum('challan') +
      sum('tolls') +
      sum('adblue') +
      sum('insurance') +
      sum('stateTax') +
      sum('aitp') +
      sum('van')
    const infra = sum('water') + sum('laundry') + sum('parking')

    const total = energy + financing + amc + battery + driverHr + tyresAdmin + infra
    return {
      modelId: r.model.id,
      modelName: r.model.name,
      energy,
      financing,
      amc,
      battery,
      driverHr,
      tyresAdmin,
      infra,
      total,
      amcUnknown: !r.model.amcDurationYrs || r.model.amcDurationYrs === 0,
      priceUnknown: !!r.model.priceUnknown,
      chemistry: r.model.batteryChemistry,
    }
  })
}

/* ============================================================
   Executive Verdict
   ============================================================ */

export interface Verdict {
  viable: boolean
  headline: string
  bestEvId: string | null
  bestEvPerKm: number | null
  dieselPerKm: number | null
  savingsPerKm: number | null
  savingsPct: number | null
  riskChips: Array<{ label: string; tone: 'red' | 'amber' | 'green' }>
}

export function computeVerdict(results: ModelResult[]): Verdict {
  const evs = results.filter((r) => r.model.type === 'ev')
  const diesel = results.find((r) => r.model.type === 'diesel')
  if (!evs.length || !diesel) {
    return {
      viable: false,
      headline: 'Add at least one EV and one diesel reference to generate a verdict.',
      bestEvId: null,
      bestEvPerKm: null,
      dieselPerKm: null,
      savingsPerKm: null,
      savingsPct: null,
      riskChips: [],
    }
  }
  const best = evs.reduce((b, r) => (r.weightedAvgPerKm < b.weightedAvgPerKm ? r : b))
  const saving = diesel.weightedAvgPerKm - best.weightedAvgPerKm
  const viable = saving > 0
  const pct = (saving / diesel.weightedAvgPerKm) * 100
  const risk = computeRisk(best.model)
  const chips: Verdict['riskChips'] = []
  if (best.model.tag === 'PREFERRED')
    chips.push({ label: 'PREFERRED OEM', tone: 'green' })
  if (risk.score === 0) chips.push({ label: 'Low risk', tone: 'green' })
  else if (risk.score <= 3) chips.push({ label: `Risk ${risk.score}`, tone: 'amber' })
  else chips.push({ label: `High risk ${risk.score}`, tone: 'red' })
  if (best.batteryRiskFlag) chips.push({ label: 'Battery warranty risk', tone: 'red' })
  if (best.model.batteryChemistry === 'LFP')
    chips.push({ label: 'LFP chemistry', tone: 'green' })

  return {
    viable,
    headline: viable
      ? `YES — ${best.model.name} saves ₹${saving.toFixed(2)}/km (${pct.toFixed(1)}%) vs diesel`
      : `NO — No EV option cheaper than diesel on current inputs`,
    bestEvId: best.model.id,
    bestEvPerKm: best.weightedAvgPerKm,
    dieselPerKm: diesel.weightedAvgPerKm,
    savingsPerKm: saving,
    savingsPct: pct,
    riskChips: chips,
  }
}
