import {
  EVModel,
  InflationInputs,
  RouteConfig,
  YearlyCost,
  ModelResult,
  Refurbishment,
  BatteryEvent,
} from './types'

function inflate(base: number, pct: number, year: number): number {
  if (pct === 0) return base
  return base * Math.pow(1 + pct / 100, year - 1)
}

function computeEMIPerKm(model: EVModel, year: number, annualKm: number): number {
  const principal = model.vehiclePriceL * 100000 * (model.financingPct / 100)
  const months = model.loanTenureMonths
  if (principal <= 0 || months <= 0 || annualKm <= 0) return 0
  const r = model.interestRatePct / 100 / 12
  const emi =
    r > 0
      ? (principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1)
      : principal / months
  const endYear = Math.ceil(months / 12)
  if (year > endYear) return 0
  if (year < endYear) return (emi * 12) / annualKm
  // Final partial year
  const monthsInFinalYear = months - (endYear - 1) * 12
  return (emi * monthsInFinalYear) / annualKm
}

function computeRefurbPerKm(
  refurbs: Refurbishment[],
  year: number,
  annualKm: number,
  totalYears: number
): number {
  let cost = 0
  for (const r of refurbs) {
    if (!r.financed) {
      if (r.atYear === year) cost += (r.costL * 100000) / annualKm
    } else {
      if (year >= r.atYear) {
        const remainingYears = Math.max(1, totalYears - r.atYear + 1)
        const principal = r.costL * 100000
        const months = r.financingMonths ?? remainingYears * 12
        const rRate = (r.interestRatePct ?? 10) / 100 / 12
        const emi =
          rRate > 0
            ? (principal * rRate * Math.pow(1 + rRate, months)) /
              (Math.pow(1 + rRate, months) - 1)
            : principal / months
        const endYear = r.atYear + Math.ceil(months / 12) - 1
        if (year <= endYear) cost += (emi * 12) / annualKm
      }
    }
  }
  return cost
}

export function computeModel(
  model: EVModel,
  route: RouteConfig,
  inflation: InflationInputs,
  monthlyKm: number
): ModelResult {
  const totalYears = route.contractYears + route.extensionYears
  const annualKm = monthlyKm * 12
  const totalKm = annualKm * totalYears

  // Battery replacement events — multi-cycle, based on KMs (not calendar years)
  const batteryEvents: BatteryEvent[] = []
  if (
    model.type === 'ev' &&
    model.batteryWarrantyKm &&
    model.batteryBufferKm !== undefined &&
    annualKm > 0
  ) {
    const warrantyKm = model.batteryWarrantyKm
    const bufferKm = model.batteryBufferKm
    const triggerKmPerCycle = warrantyKm + bufferKm
    if (triggerKmPerCycle > 0) {
      let replacementNumber = 1
      let cumulativeTrigger = triggerKmPerCycle
      while (cumulativeTrigger <= totalKm) {
        const replacementYear = Math.ceil(cumulativeTrigger / annualKm)
        const warrantyEndKm = cumulativeTrigger - bufferKm
        const warrantyEndYear = Math.ceil(warrantyEndKm / annualKm)
        if (replacementYear <= totalYears) {
          batteryEvents.push({
            replacementNumber,
            triggerKm: cumulativeTrigger,
            year: replacementYear,
            warrantyEndKm,
            warrantyEndYear,
            bufferStartYear: warrantyEndYear,
          })
        }
        replacementNumber++
        cumulativeTrigger += triggerKmPerCycle
      }
    }
  }

  const batteryReplacementYears = new Set(batteryEvents.map((e) => e.year))
  const optimalTenureMonths =
    batteryEvents.length > 0
      ? Math.max(12, (batteryEvents[0].year - 1) * 12)
      : model.loanTenureMonths
  const batteryRiskFlag = model.loanTenureMonths > optimalTenureMonths

  const spikeYears = new Set<number>()
  batteryEvents.forEach((e) => spikeYears.add(e.year))
  model.refurbishments.filter((r) => !r.financed).forEach((r) => spikeYears.add(r.atYear))

  let cumulativeCostRs = 0
  let cumulativeKm = 0
  const yearlyData: YearlyCost[] = []

  for (let yr = 1; yr <= totalYears; yr++) {
    const isEV = model.type === 'ev'
    const inf = inflation

    const ev = (base: number, pct: number) => (pct > 0 ? inflate(base, pct, yr) : base)
    const ic = (base: number, pct: number) => inflate(base, pct, yr)

    const emi = computeEMIPerKm(model, yr, annualKm)

    // Fuel / Charging
    let fuelOrCharging = 0
    if (isEV) {
      const kWhPerKm = model.energyConsumptionKWhPerKm ?? 1.0
      const rate = ev(model.chargingOrFuelCostPerUnit ?? 8, inf.evChargingInflationPct)
      fuelOrCharging = kWhPerKm * rate
    } else {
      const dieselPriceYr = ic(model.chargingOrFuelCostPerUnit ?? 90, inf.fuelInflationPct)
      fuelOrCharging = dieselPriceYr / (model.mileageKmPerL ?? 3.8)
    }

    // For EV: only inflate if toggle is on; for ICE: always inflate
    const applyOpex = (base: number, icePct: number, evToggle: boolean) =>
      isEV ? (evToggle ? inflate(base, icePct, yr) : base) : ic(base, icePct)

    const maintenance = applyOpex(
      model.maintenancePerKm,
      inf.maintenanceInflationPct,
      inf.evApplyInflationToMaintenance
    )
    const dhSalary = isEV
      ? ev(model.dhSalaryPerKm, inf.evDhSalaryInflationPct)
      : ic(model.dhSalaryPerKm, inf.dhSalaryInflationPct)
    const tolls = applyOpex(model.tollsPerKm, inf.tollInflationPct, inf.evApplyInflationToTolls)
    const adblue = isEV ? 0 : ic(model.adbluePerKm ?? 0, inf.adblueInflationPct)
    const tyres = applyOpex(model.tyrePerKm, inf.tyreInflationPct, inf.evApplyInflationToTyres)
    const admin = applyOpex(model.adminPerKm, inf.adminInflationPct, inf.evApplyInflationToAdmin)
    const liasoning = ic(model.liasoningPerKm, inf.liasoningInflationPct)
    const challan = ic(model.challanPerKm, inf.challanInflationPct)

    const rtKm = route.owKm * 2
    const water = rtKm > 0 ? ic(model.waterPerRT, inf.waterInflationPct) / rtKm : 0
    const laundry = rtKm > 0 ? ic(model.laundryPerRT, inf.laundryInflationPct) / rtKm : 0
    const parking = rtKm > 0 ? ic(model.parkingPerRT, inf.parkingInflationPct) / rtKm : 0

    const monthlyKmDivisor = annualKm / 12
    const dashcam =
      monthlyKmDivisor > 0 ? ic(model.dashcamPerMonth, inf.dashcamInflationPct) / monthlyKmDivisor : 0
    const uniform =
      monthlyKmDivisor > 0 ? ic(model.uniformPerMonth, inf.uniformInflationPct) / monthlyKmDivisor : 0
    const stateTax =
      monthlyKmDivisor > 0
        ? (ic(model.stateTaxPerMonthL, inf.stateTaxInflationPct) * 100000) / monthlyKmDivisor
        : 0
    const van = applyOpex(model.vanPerKm, inf.vanInflationPct, false)
    const aitp =
      monthlyKmDivisor > 0
        ? (ic(model.aitpPerMonthL, inf.aitpInflationPct) * 100000) / monthlyKmDivisor
        : 0
    const insurance =
      annualKm > 0
        ? applyOpex(
            model.insurancePerMonthL * 100000 * 12,
            inf.insuranceInflationPct,
            inf.evApplyInflationToInsurance
          ) / annualKm
        : 0

    const batteryReplacement =
      model.type === 'ev' &&
      batteryReplacementYears.has(yr) &&
      model.batteryReplacementCostL &&
      annualKm > 0
        ? (model.batteryReplacementCostL * 100000) / annualKm
        : 0

    const refurbCost = computeRefurbPerKm(model.refurbishments, yr, annualKm, totalYears)

    const totalPerKm =
      emi +
      fuelOrCharging +
      maintenance +
      dhSalary +
      tolls +
      adblue +
      tyres +
      admin +
      liasoning +
      challan +
      water +
      laundry +
      parking +
      dashcam +
      uniform +
      stateTax +
      van +
      aitp +
      insurance +
      batteryReplacement +
      refurbCost

    const totalWithMarginPerKm = totalPerKm * (1 + model.marginPct / 100)

    cumulativeCostRs += totalPerKm * annualKm
    cumulativeKm += annualKm

    yearlyData.push({
      year: yr,
      kmThisYear: annualKm,
      emi,
      fuelOrCharging,
      maintenance,
      dhSalary,
      tolls,
      adblue,
      tyres,
      admin,
      liasoning,
      challan,
      water,
      laundry,
      parking,
      dashcam,
      uniform,
      stateTax,
      van,
      aitp,
      insurance,
      batteryReplacement,
      refurbCost,
      totalPerKm,
      totalWithMarginPerKm,
      cumulativeCostRs,
      cumulativeKm,
      cumulativeAvgPerKm: cumulativeKm > 0 ? cumulativeCostRs / cumulativeKm : 0,
    })
  }

  const weightedAvgPerKm = totalKm > 0 ? cumulativeCostRs / totalKm : 0

  const nonSpikeYears = yearlyData.filter((y) => !spikeYears.has(y.year))
  const nonSpikeKm = nonSpikeYears.reduce((s, y) => s + y.kmThisYear, 0)
  const nonSpikeCost = nonSpikeYears.reduce((s, y) => s + y.totalPerKm * y.kmThisYear, 0)
  const weightedAvgExSpikesPerKm =
    nonSpikeKm > 0 ? nonSpikeCost / nonSpikeKm : weightedAvgPerKm

  return {
    model,
    yearlyData,
    totalKm,
    totalCostRs: cumulativeCostRs,
    weightedAvgPerKm,
    weightedAvgExSpikesPerKm,
    costPerSeatKm: weightedAvgPerKm / Math.max(1, model.seats),
    minViableMinG: weightedAvgPerKm * (1 + model.marginPct / 100),
    batteryEvents,
    optimalTenureMonths,
    batteryRiskFlag,
    breakevenYear: null,
  }
}

export function computeBreakeven(
  evResult: ModelResult,
  dieselResult: ModelResult
): number | null {
  for (const yr of evResult.yearlyData) {
    const dieselYr = dieselResult.yearlyData.find((y) => y.year === yr.year)
    if (!dieselYr) continue
    if (yr.cumulativeAvgPerKm < dieselYr.cumulativeAvgPerKm) return yr.year
  }
  return null
}

export function computeTenureSensitivity(
  model: EVModel,
  route: RouteConfig,
  inflation: InflationInputs,
  monthlyKm: number,
  tenureOptions: number[]
): Array<{ months: number; avgPerKm: number; batteryRisk: boolean }> {
  return tenureOptions.map((months) => {
    const modifiedModel: EVModel = { ...model, loanTenureMonths: months }
    const modifiedRoute: RouteConfig = {
      ...route,
      contractYears: Math.ceil(months / 12),
      extensionYears: 0,
    }
    const result = computeModel(modifiedModel, modifiedRoute, inflation, monthlyKm)
    return {
      months,
      avgPerKm: result.weightedAvgPerKm,
      batteryRisk: result.batteryRiskFlag,
    }
  })
}

export function computeFleetBlended(
  results: ModelResult[],
  busesPerModel: Record<string, number>
): { blendedPerKm: number; totalBuses: number; totalKm: number } {
  let totalWeightedCost = 0
  let totalKm = 0
  let totalBuses = 0
  results.forEach((r) => {
    const buses = busesPerModel[r.model.id] ?? 0
    if (buses <= 0) return
    totalWeightedCost += r.weightedAvgPerKm * r.totalKm * buses
    totalKm += r.totalKm * buses
    totalBuses += buses
  })
  return {
    blendedPerKm: totalKm > 0 ? totalWeightedCost / totalKm : 0,
    totalBuses,
    totalKm,
  }
}
