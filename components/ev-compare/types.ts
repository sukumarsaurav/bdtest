export type VehicleType = 'ev' | 'diesel'

export interface Refurbishment {
  id: string
  name: string
  costL: number
  atYear: number
  financed: boolean
  financingMonths?: number
  interestRatePct?: number
}

export interface EVModel {
  id: string
  name: string
  manufacturer: string
  type: VehicleType

  // OEM metadata (optional; used for Advanced Analytics)
  oem?: string
  tag?: 'PREFERRED' | 'BLOCKER' | 'WATCH' | ''
  subtype?: string
  chassisLength?: number
  notes?: string
  cellMfr?: string
  batteryChemistry?: 'LFP' | 'NMC'
  warrantyYrs?: number
  warrantyNote?: string
  otherWarranty?: string
  rangeKmMin?: number
  rangeKmMax?: number
  batteryKwhVariant?: string
  rangeUnknown?: boolean
  priceUnknown?: boolean
  fastCharge?: boolean
  amcRisk?: 'BLOCKER' | 'WATCH' | null

  // AMC (₹/km if locked; optional; used for Advanced Analytics)
  amc?: number
  amcLocked?: boolean
  amcDurationYrs?: number

  // Physical
  lengthM: number
  seats: number

  // Purchase & financing
  vehiclePriceL: number
  financingPct: number
  interestRatePct: number
  loanTenureMonths: number
  extensionMonths: number

  // EV-specific
  batteryKWh?: number
  rangeKm?: number
  chargingTimeHrs?: string
  energyConsumptionKWhPerKm?: number
  batteryWarrantyKm?: number
  batteryBufferKm?: number
  batteryReplacementCostL?: number

  // ICE-specific
  mileageKmPerL?: number

  // Shared opex
  chargingOrFuelCostPerUnit?: number
  maintenancePerKm: number
  dhSalaryPerKm: number
  tollsPerKm: number
  adbluePerKm?: number
  tyrePerKm: number
  adminPerKm: number
  liasoningPerKm: number
  challanPerKm: number
  waterPerRT: number
  laundryPerRT: number
  parkingPerRT: number
  dashcamPerMonth: number
  uniformPerMonth: number
  stateTaxPerMonthL: number
  vanPerKm: number
  aitpPerMonthL: number
  insurancePerMonthL: number

  // Margin
  marginPct: number

  // Refurbishments
  refurbishments: Refurbishment[]
}

export interface InflationInputs {
  fuelInflationPct: number
  adblueInflationPct: number
  tollInflationPct: number
  maintenanceInflationPct: number
  tyreInflationPct: number
  dhSalaryInflationPct: number
  adminInflationPct: number
  liasoningInflationPct: number
  challanInflationPct: number
  waterInflationPct: number
  laundryInflationPct: number
  parkingInflationPct: number
  dashcamInflationPct: number
  uniformInflationPct: number
  stateTaxInflationPct: number
  vanInflationPct: number
  aitpInflationPct: number
  insuranceInflationPct: number

  evChargingInflationPct: number
  evDhSalaryInflationPct: number
  evApplyInflationToMaintenance: boolean
  evApplyInflationToTolls: boolean
  evApplyInflationToTyres: boolean
  evApplyInflationToAdmin: boolean
  evApplyInflationToInsurance: boolean
}

export interface RouteConfig {
  owKm: number
  tripsPerMonth: number
  buses: number
  contractYears: number
  extensionYears: number
}

export interface YearlyCost {
  year: number
  kmThisYear: number
  emi: number
  fuelOrCharging: number
  maintenance: number
  dhSalary: number
  tolls: number
  adblue: number
  tyres: number
  admin: number
  liasoning: number
  challan: number
  water: number
  laundry: number
  parking: number
  dashcam: number
  uniform: number
  stateTax: number
  van: number
  aitp: number
  insurance: number
  batteryReplacement: number
  refurbCost: number
  totalPerKm: number
  totalWithMarginPerKm: number
  cumulativeCostRs: number
  cumulativeKm: number
  cumulativeAvgPerKm: number
}

export interface BatteryEvent {
  replacementNumber: number
  triggerKm: number
  year: number
  warrantyEndKm: number
  warrantyEndYear: number
  bufferStartYear: number
}

export interface ModelResult {
  model: EVModel
  yearlyData: YearlyCost[]
  totalKm: number
  totalCostRs: number
  weightedAvgPerKm: number
  weightedAvgExSpikesPerKm: number
  costPerSeatKm: number
  minViableMinG: number
  batteryEvents: BatteryEvent[]
  optimalTenureMonths: number
  batteryRiskFlag: boolean
  breakevenYear: number | null
}
