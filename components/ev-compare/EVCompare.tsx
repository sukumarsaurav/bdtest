'use client'

import React, { useMemo, useState, useEffect } from 'react'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  LabelList,
  Cell,
} from 'recharts'
import { useStore } from '@/store/useStore'
import { fmtPerKm, INDIA_MING_TARGET } from '@/lib/formatters'
import { EVModel, InflationInputs, RouteConfig, ModelResult, Refurbishment } from './types'
import {
  computeModel,
  computeBreakeven,
  computeTenureSensitivity,
} from './evEngine'
import VehicleCard from './VehicleCard'
import TCOTable from './TCOTable'
import AdvancedAnalytics from './AdvancedAnalytics'

/* -------------------- Defaults -------------------- */

const DEFAULT_INFLATION: InflationInputs = {
  fuelInflationPct: 6,
  adblueInflationPct: 5,
  tollInflationPct: 8,
  maintenanceInflationPct: 5,
  tyreInflationPct: 5,
  dhSalaryInflationPct: 7,
  adminInflationPct: 5,
  liasoningInflationPct: 5,
  challanInflationPct: 5,
  waterInflationPct: 5,
  laundryInflationPct: 5,
  parkingInflationPct: 5,
  dashcamInflationPct: 4,
  uniformInflationPct: 5,
  stateTaxInflationPct: 4,
  vanInflationPct: 5,
  aitpInflationPct: 4,
  insuranceInflationPct: 4,
  evChargingInflationPct: 3,
  evDhSalaryInflationPct: 7,
  evApplyInflationToMaintenance: false,
  evApplyInflationToTolls: true,
  evApplyInflationToTyres: true,
  evApplyInflationToAdmin: true,
  evApplyInflationToInsurance: true,
}

const DEFAULT_ROUTE: RouteConfig = {
  owKm: 400,
  tripsPerMonth: 13,
  buses: 1,
  contractYears: 5,
  extensionYears: 2,
}

const sharedOpex = {
  maintenancePerKm: 1.2,
  dhSalaryPerKm: 6.5,
  tollsPerKm: 2.5,
  tyrePerKm: 1.0,
  adminPerKm: 0.3,
  liasoningPerKm: 0.3,
  challanPerKm: 0.55,
  waterPerRT: 150,
  laundryPerRT: 200,
  parkingPerRT: 100,
  dashcamPerMonth: 500,
  uniformPerMonth: 800,
  stateTaxPerMonthL: 0.08,
  vanPerKm: 0,
  aitpPerMonthL: 0.05,
  insurancePerMonthL: 0.15,
  refurbishments: [] as Refurbishment[],
}

const DEFAULT_MODELS: EVModel[] = [
  // 1. Azad India — PREFERRED
  {
    id: 'azad',
    name: 'Azad India',
    manufacturer: 'Azad India',
    oem: 'Azad India',
    tag: 'PREFERRED',
    subtype: 'Seater/Hybrid (45 / 20+23 / 20+22+WR)',
    chassisLength: 12.4,
    type: 'ev',
    lengthM: 12.4,
    seats: 45,
    vehiclePriceL: 170,
    financingPct: 85,
    interestRatePct: 10,
    loanTenureMonths: 60,
    extensionMonths: 24,
    batteryKWh: 423,
    rangeKm: 360,
    chargingTimeHrs: '1 hr',
    energyConsumptionKWhPerKm: 1.175,
    chargingOrFuelCostPerUnit: 8,
    batteryWarrantyKm: 600000,
    warrantyYrs: 6,
    batteryBufferKm: 50000,
    batteryReplacementCostL: 45,
    cellMfr: 'Skywell',
    batteryChemistry: 'LFP',
    amc: 3.5,
    amcDurationYrs: 8,
    amcLocked: true,
    otherWarranty: 'Chassis 10yr; Axle 5yr; Motors 2L km/2yr',
    notes: 'Preferred OEM. Best AMC in market (locked 8yr). LFP Skywell cells. Fast charge 1hr. Strong warranty package.',
    fastCharge: true,
    ...sharedOpex,
    maintenancePerKm: 3.5, // AMC locked, used as maintenance proxy
    marginPct: 10,
  },
  // 2. JBM GEN 2
  {
    id: 'jbm-gen2',
    name: 'JBM GEN 2',
    manufacturer: 'JBM Eco-Life',
    oem: 'JBM',
    tag: '',
    subtype: 'Intercity Seater',
    chassisLength: 12,
    type: 'ev',
    lengthM: 12,
    seats: 43,
    vehiclePriceL: 165,
    financingPct: 85,
    interestRatePct: 10,
    loanTenureMonths: 60,
    extensionMonths: 24,
    batteryKWh: 388,
    rangeKm: 320,
    chargingTimeHrs: '1.5 hr',
    energyConsumptionKWhPerKm: 1.21,
    chargingOrFuelCostPerUnit: 8,
    batteryWarrantyKm: 500000,
    warrantyYrs: 5,
    batteryBufferKm: 50000,
    batteryReplacementCostL: 42,
    cellMfr: 'CATL',
    batteryChemistry: 'LFP',
    amc: 5.5,
    amcDurationYrs: 5,
    amcLocked: false,
    amcRisk: 'WATCH',
    otherWarranty: 'Powertrain 5yr',
    notes: 'GEN 2 platform. LFP CATL cells. AMC unlocked post Y5 — escalation risk.',
    ...sharedOpex,
    maintenancePerKm: 5.5,
    marginPct: 10,
  },
  // 3. JBM GEN 1
  {
    id: 'jbm-gen1',
    name: 'JBM GEN 1',
    manufacturer: 'JBM Eco-Life',
    oem: 'JBM',
    tag: '',
    subtype: 'Legacy Seater',
    chassisLength: 12,
    type: 'ev',
    lengthM: 12,
    seats: 41,
    vehiclePriceL: 150,
    financingPct: 85,
    interestRatePct: 10,
    loanTenureMonths: 60,
    extensionMonths: 24,
    batteryKWh: 312,
    rangeKm: 260,
    chargingTimeHrs: '2 hr',
    energyConsumptionKWhPerKm: 1.2,
    chargingOrFuelCostPerUnit: 8,
    batteryWarrantyKm: 400000,
    warrantyYrs: 5,
    batteryBufferKm: 40000,
    batteryReplacementCostL: 38,
    cellMfr: 'LG/NMC',
    batteryChemistry: 'NMC',
    amc: 6.5,
    amcDurationYrs: 5,
    amcLocked: false,
    amcRisk: 'BLOCKER',
    otherWarranty: 'Powertrain 5yr',
    notes: 'GEN 1 legacy. NMC chemistry — thermal-event risk vs LFP. Higher AMC, shorter battery life.',
    ...sharedOpex,
    maintenancePerKm: 6.5,
    marginPct: 10,
  },
  // 4. Eicher Skyline Pro E
  {
    id: 'eicher-skyline-pro-e',
    name: 'Eicher Skyline Pro E',
    manufacturer: 'Eicher',
    oem: 'Eicher',
    tag: '',
    subtype: 'Intercity Seater',
    chassisLength: 12,
    type: 'ev',
    lengthM: 12,
    seats: 41,
    vehiclePriceL: 155,
    financingPct: 85,
    interestRatePct: 10,
    loanTenureMonths: 60,
    extensionMonths: 24,
    batteryKWh: 350,
    rangeKm: 280,
    chargingTimeHrs: '1.5 hr',
    energyConsumptionKWhPerKm: 1.25,
    chargingOrFuelCostPerUnit: 8,
    batteryWarrantyKm: 500000,
    warrantyYrs: 5,
    batteryBufferKm: 50000,
    batteryReplacementCostL: 40,
    cellMfr: 'CATL',
    batteryChemistry: 'LFP',
    amc: 5.0,
    amcDurationYrs: 5,
    amcLocked: false,
    amcRisk: 'WATCH',
    otherWarranty: 'Chassis 5yr',
    notes: 'Skyline Pro E. Known diesel chassis converted to EV. AMC post Y5 unknown.',
    ...sharedOpex,
    maintenancePerKm: 5.0,
    marginPct: 10,
  },
  // 5. Tata Magna EV
  {
    id: 'tata-magna',
    name: 'Tata Magna EV',
    manufacturer: 'Tata Motors',
    oem: 'Tata',
    tag: '',
    subtype: 'Intercity Seater',
    chassisLength: 12,
    type: 'ev',
    lengthM: 12,
    seats: 41,
    vehiclePriceL: 160,
    financingPct: 85,
    interestRatePct: 10,
    loanTenureMonths: 60,
    extensionMonths: 24,
    batteryKWh: 375,
    rangeKm: 300,
    chargingTimeHrs: '1.5 hr',
    energyConsumptionKWhPerKm: 1.25,
    chargingOrFuelCostPerUnit: 8,
    batteryWarrantyKm: 500000,
    warrantyYrs: 5,
    batteryBufferKm: 50000,
    batteryReplacementCostL: 42,
    cellMfr: 'Tata AutoComp/LFP',
    batteryChemistry: 'LFP',
    amc: 5.5,
    amcDurationYrs: 5,
    amcLocked: false,
    amcRisk: 'WATCH',
    otherWarranty: 'Powertrain 5yr',
    notes: 'Tata Magna platform. LFP cells. AMC unlocked post Y5. Established service network.',
    ...sharedOpex,
    maintenancePerKm: 5.5,
    marginPct: 10,
  },
  // 6. Exponent Veera
  {
    id: 'exponent-veera',
    name: 'Exponent Veera',
    manufacturer: 'Exponent Energy',
    oem: 'Exponent',
    tag: '',
    subtype: 'Fast-charge Seater',
    chassisLength: 12,
    type: 'ev',
    lengthM: 12,
    seats: 41,
    vehiclePriceL: 175,
    financingPct: 85,
    interestRatePct: 10,
    loanTenureMonths: 60,
    extensionMonths: 24,
    batteryKWh: 300,
    rangeKm: 260,
    rangeKmMin: 220,
    rangeKmMax: 300,
    chargingTimeHrs: '15 min (e-pack)',
    energyConsumptionKWhPerKm: 1.15,
    chargingOrFuelCostPerUnit: 9,
    batteryWarrantyKm: 500000,
    warrantyYrs: 5,
    batteryBufferKm: 50000,
    batteryReplacementCostL: 40,
    cellMfr: 'Exponent',
    batteryChemistry: 'LFP',
    amc: 5.0,
    amcDurationYrs: 5,
    amcLocked: false,
    amcRisk: 'WATCH',
    otherWarranty: 'e-pack 5yr',
    fastCharge: true,
    notes: '15-min fast charge via Exponent e-pack. Requires dedicated infra — infra-dependent deployment.',
    ...sharedOpex,
    maintenancePerKm: 5.0,
    marginPct: 10,
  },
  // 7. Olectra K9
  {
    id: 'olectra-k9',
    name: 'Olectra K9',
    manufacturer: 'Olectra Greentech',
    oem: 'Olectra',
    tag: '',
    subtype: 'Intercity Seater',
    chassisLength: 12,
    type: 'ev',
    lengthM: 12,
    seats: 36,
    vehiclePriceL: 145,
    financingPct: 85,
    interestRatePct: 10,
    loanTenureMonths: 60,
    extensionMonths: 24,
    batteryKWh: 350,
    rangeKm: 300,
    chargingTimeHrs: '3-4 hrs',
    energyConsumptionKWhPerKm: 1.2,
    chargingOrFuelCostPerUnit: 8,
    batteryWarrantyKm: 500000,
    warrantyYrs: 5,
    batteryBufferKm: 50000,
    batteryReplacementCostL: 40,
    cellMfr: 'BYD',
    batteryChemistry: 'LFP',
    amc: 5.5,
    amcDurationYrs: 5,
    amcLocked: false,
    amcRisk: 'WATCH',
    otherWarranty: 'Powertrain 5yr',
    notes: 'Olectra K9 — BYD platform, LFP cells. Proven in STU tenders. AMC post Y5 unknown.',
    ...sharedOpex,
    maintenancePerKm: 5.5,
    marginPct: 10,
  },
  // 8. Futura — PRICE TBD
  {
    id: 'futura',
    name: 'Futura',
    manufacturer: 'Futura Mobility',
    oem: 'Futura',
    tag: '',
    subtype: 'Intercity Seater',
    chassisLength: 12,
    type: 'ev',
    lengthM: 12,
    seats: 41,
    vehiclePriceL: 160, // placeholder until OEM confirms
    priceUnknown: true,
    financingPct: 85,
    interestRatePct: 10,
    loanTenureMonths: 60,
    extensionMonths: 24,
    batteryKWh: 340,
    rangeKm: 280,
    rangeUnknown: true,
    chargingTimeHrs: 'TBD',
    energyConsumptionKWhPerKm: 1.2,
    chargingOrFuelCostPerUnit: 8,
    batteryWarrantyKm: 400000,
    warrantyYrs: 5,
    warrantyNote: 'unclear',
    batteryBufferKm: 50000,
    batteryReplacementCostL: 40,
    cellMfr: 'TBD',
    batteryChemistry: 'LFP',
    amcDurationYrs: 0,
    amcLocked: false,
    amcRisk: 'BLOCKER',
    otherWarranty: 'TBD',
    notes: 'Price TBD. Range claim unclear. Warranty terms not firmed up. Cannot quote without commercials.',
    ...sharedOpex,
    maintenancePerKm: 6.0,
    marginPct: 10,
  },
  // 9. Diesel ICE reference (BharatBenz 1515)
  {
    id: 'diesel-ref',
    name: 'Diesel Reference',
    manufacturer: 'BharatBenz 1515',
    oem: 'BharatBenz/Tata',
    subtype: 'Intercity Diesel',
    chassisLength: 12,
    type: 'diesel',
    lengthM: 12,
    seats: 41,
    vehiclePriceL: 40,
    financingPct: 85,
    interestRatePct: 10,
    loanTenureMonths: 48,
    extensionMonths: 0,
    mileageKmPerL: 3.8,
    chargingOrFuelCostPerUnit: 90,
    notes: 'BharatBenz 1515 — baseline diesel reference. AdBlue ₹1/km. Standard intercity opex.',
    ...sharedOpex,
    adbluePerKm: 1.0,
    maintenancePerKm: 3.0,
    marginPct: 5,
  },
]

/* -------------------- Cost colours -------------------- */

const COST_KEYS = [
  'emi',
  'fuelOrCharging',
  'maintenance',
  'dhSalary',
  'tolls',
  'adblue',
  'tyres',
  'admin',
  'liasoning',
  'challan',
  'water',
  'laundry',
  'parking',
  'dashcam',
  'uniform',
  'stateTax',
  'van',
  'aitp',
  'insurance',
  'batteryReplacement',
  'refurbCost',
] as const

type CostKey = (typeof COST_KEYS)[number]

const COST_LABELS: Record<CostKey, string> = {
  emi: 'EMI',
  fuelOrCharging: 'Fuel/Charging',
  maintenance: 'Maintenance',
  dhSalary: 'D/H Salary',
  tolls: 'Tolls',
  adblue: 'AdBlue',
  tyres: 'Tyres',
  admin: 'Admin',
  liasoning: 'Liasoning',
  challan: 'Challan',
  water: 'Water',
  laundry: 'Laundry',
  parking: 'Parking',
  dashcam: 'Dashcam',
  uniform: 'Uniform',
  stateTax: 'State Tax',
  van: 'Van',
  aitp: 'AITP',
  insurance: 'Insurance',
  batteryReplacement: 'Battery Repl.',
  refurbCost: 'Refurb',
}

const COST_COLORS: Record<CostKey, string> = {
  emi: '#1e3a5f',
  fuelOrCharging: '#FFAD00',
  maintenance: '#f59e0b',
  dhSalary: '#2563eb',
  tolls: '#7c3aed',
  adblue: '#ef4444',
  tyres: '#d97706',
  admin: '#6b7280',
  liasoning: '#9ca3af',
  challan: '#a16207',
  water: '#0ea5e9',
  laundry: '#06b6d4',
  parking: '#64748b',
  dashcam: '#4b5563',
  uniform: '#475569',
  stateTax: '#334155',
  van: '#1f2937',
  aitp: '#0f172a',
  insurance: '#14b8a6',
  batteryReplacement: '#ff0000',
  refurbCost: '#f97316',
}

const MODEL_COLORS = ['#444444', '#73D700', '#2563eb', '#FFAD00', '#f59e0b', '#7c3aed', '#14b8a6']

/* -------------------- Chart list -------------------- */

const CHARTS = [
  { id: 'annual-breakdown', label: 'Annual Cost Breakdown' },
  { id: 'waterfall', label: 'Waterfall (Year-over-year + EV vs ICE)' },
  { id: 'cumulative', label: 'Cumulative ₹/km Crossover' },
  { id: 'tenure-curve', label: 'Optimal Tenure Curve' },
] as const

type ChartId = (typeof CHARTS)[number]['id']

/* -------------------- Component -------------------- */

export default function EVCompare() {
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)
  const lines = useStore((s) => s.lines)

  const [models, setModels] = useState<EVModel[]>(DEFAULT_MODELS)
  const [inflation, setInflation] = useState<InflationInputs>(DEFAULT_INFLATION)
  const [route, setRoute] = useState<RouteConfig>(DEFAULT_ROUTE)
  const [iceInflationOpen, setIceInflationOpen] = useState(true)
  const [evInflationOpen, setEvInflationOpen] = useState(false)
  const [selectedCharts, setSelectedCharts] = useState<ChartId[]>([
    'annual-breakdown',
    'waterfall',
    'cumulative',
    'tenure-curve',
  ])
  const [waterfallTab, setWaterfallTab] = useState<'yearly' | 'delta'>('yearly')
  const [waterfallModelId, setWaterfallModelId] = useState<string>('azad')
  const [busesPerModel, setBusesPerModel] = useState<Record<string, number>>({
    'azad': 10,
    'jbm-gen2': 5,
    'jbm-gen1': 0,
    'eicher-skyline-pro-e': 0,
    'tata-magna': 0,
    'exponent-veera': 0,
    'olectra-k9': 0,
    'futura': 0,
    'diesel-ref': 20,
  })
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  /* ---------- Fleet avg MinG from store ---------- */
  const fleetAvgMinG = useMemo(() => {
    if (!lines || lines.length === 0) return INDIA_MING_TARGET
    let totalKm = 0
    let totalMingKm = 0
    for (const l of lines) {
      const km = (l.owKm || 0) * (l.rt || 0) * 2 * (l.buses || 0)
      if (km > 0 && l.minG > 0) {
        totalKm += km
        totalMingKm += l.minG * km
      }
    }
    return totalKm > 0 ? totalMingKm / totalKm : INDIA_MING_TARGET
  }, [lines])

  /* ---------- Compute results ---------- */
  const monthlyKm = route.owKm * 2 * route.tripsPerMonth * route.buses
  const annualKm = monthlyKm * 12

  const results: ModelResult[] = useMemo(() => {
    const raw = models.map((m) => computeModel(m, route, inflation, monthlyKm))
    const diesel = raw.find((r) => r.model.type === 'diesel') ?? null
    if (diesel) {
      raw.forEach((r) => {
        if (r.model.type === 'ev') {
          r.breakevenYear = computeBreakeven(r, diesel)
        }
      })
    }
    return raw
  }, [models, route, inflation, monthlyKm])

  const dieselResult = results.find((r) => r.model.type === 'diesel') ?? null
  const evResults = results.filter((r) => r.model.type === 'ev')

  const bestEvId = useMemo(() => {
    if (!evResults.length) return null
    return evResults.reduce((best, r) =>
      r.weightedAvgPerKm < best.weightedAvgPerKm ? r : best
    ).model.id
  }, [evResults])

  /* ---------- Handlers ---------- */
  const updateModel = (id: string, patch: Partial<EVModel>) => {
    setModels((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }
  const removeModel = (id: string) => {
    setModels((prev) => prev.filter((m) => m.id !== id))
  }
  const addModel = (type: 'ev' | 'diesel') => {
    const id = `${type}-${Date.now()}`
    const base =
      type === 'ev'
        ? DEFAULT_MODELS.find((m) => m.type === 'ev') ?? DEFAULT_MODELS[0]
        : DEFAULT_MODELS.find((m) => m.type === 'diesel') ?? DEFAULT_MODELS[DEFAULT_MODELS.length - 1]
    setModels((prev) => [
      ...prev,
      { ...base, id, name: `New ${type.toUpperCase()}`, refurbishments: [], tag: '' },
    ])
  }

  const toggleChart = (id: ChartId) => {
    setSelectedCharts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    )
  }

  /* ---------- Chart data: annual breakdown ---------- */
  // X = Year 1..N; one Bar per model (weighted total ₹/km), with custom tooltip showing component breakdown
  const totalYears = route.contractYears + route.extensionYears
  const annualChartData = useMemo(() => {
    const rows: any[] = []
    for (let yr = 1; yr <= totalYears; yr++) {
      const row: any = { year: `Y${yr}` }
      results.forEach((r) => {
        const y = r.yearlyData[yr - 1]
        if (y) {
          row[r.model.id] = y.totalPerKm
          const batteryEvent = r.batteryEvents.find((e) => e.year === yr)
          const isBufferZone = r.batteryEvents.some(
            (e) => yr >= e.warrantyEndYear && yr < e.year
          )
          row[`${r.model.id}_meta`] = {
            isBatterySpike: !!batteryEvent,
            isBufferZone,
            batteryLabel: batteryEvent ? `⚡#${batteryEvent.replacementNumber}` : '',
          }
        }
      })
      rows.push(row)
    }
    return rows
  }, [results, totalYears])

  /* ---------- Waterfall Type A: year-over-year delta for selected model ---------- */
  const waterfallYearlyData = useMemo(() => {
    const r = results.find((x) => x.model.id === waterfallModelId)
    if (!r) return []
    const rows: any[] = []
    let prev = 0
    r.yearlyData.forEach((y, idx) => {
      const delta = idx === 0 ? y.totalPerKm : y.totalPerKm - prev
      const base = idx === 0 ? 0 : Math.min(prev, y.totalPerKm)
      const posDelta = delta > 0 ? delta : 0
      const negDelta = delta < 0 ? -delta : 0
      const batteryEvent = r.batteryEvents.find((e) => e.year === y.year)
      const isBatterySpike = !!batteryEvent
      const isBufferZone = r.batteryEvents.some(
        (e) => y.year >= e.warrantyEndYear && y.year < e.year
      )
      const isRefurbSpike = r.model.refurbishments.some(
        (ref) => !ref.financed && ref.atYear === y.year
      )
      const isSpike = isBatterySpike || isRefurbSpike
      rows.push({
        year: `Y${y.year}`,
        base,
        posDelta,
        negDelta,
        total: y.totalPerKm,
        isSpike,
        isBatterySpike,
        isBufferZone,
        isRefurbSpike,
        batteryLabel: batteryEvent ? `⚡ #${batteryEvent.replacementNumber}` : '',
      })
      prev = y.totalPerKm
    })
    return rows
  }, [results, waterfallModelId])

  /* ---------- Waterfall Type B: EV vs ICE delta per component ---------- */
  const waterfallDeltaData = useMemo(() => {
    if (!dieselResult) return []
    const ev = results.find((r) => r.model.id === waterfallModelId && r.model.type === 'ev')
    if (!ev) return []
    const dieselAvgComponent = (k: CostKey) => {
      const total = dieselResult.yearlyData.reduce(
        (s, y) => s + (y as any)[k] * y.kmThisYear,
        0
      )
      return total / dieselResult.totalKm
    }
    const evAvgComponent = (k: CostKey) => {
      const total = ev.yearlyData.reduce((s, y) => s + (y as any)[k] * y.kmThisYear, 0)
      return total / ev.totalKm
    }
    const rows: any[] = []
    // Start bar: ICE total
    rows.push({
      label: 'ICE total',
      base: 0,
      value: dieselResult.weightedAvgPerKm,
      delta: 0,
      kind: 'start',
    })
    let running = dieselResult.weightedAvgPerKm
    for (const k of COST_KEYS) {
      const iceV = dieselAvgComponent(k)
      const evV = evAvgComponent(k)
      const delta = evV - iceV
      if (Math.abs(delta) < 0.01) continue
      const base = delta >= 0 ? running : running + delta
      rows.push({
        label: COST_LABELS[k],
        base,
        value: Math.abs(delta),
        delta,
        kind: delta > 0 ? 'premium' : 'saving',
      })
      running += delta
    }
    rows.push({
      label: 'EV total',
      base: 0,
      value: running,
      delta: 0,
      kind: 'end',
    })
    return rows
  }, [results, dieselResult, waterfallModelId])

  /* ---------- Cumulative crossover ---------- */
  const cumulativeData = useMemo(() => {
    const rows: any[] = []
    for (let yr = 1; yr <= totalYears; yr++) {
      const row: any = { year: `Y${yr}` }
      results.forEach((r) => {
        const y = r.yearlyData[yr - 1]
        if (y) row[r.model.id] = y.cumulativeAvgPerKm
      })
      rows.push(row)
    }
    return rows
  }, [results, totalYears])

  /* ---------- Tenure curve ---------- */
  const tenureOptions = [36, 48, 60, 72, 84, 96, 108, 120]
  const tenureCurveData = useMemo(() => {
    const rows: any[] = tenureOptions.map((m) => ({ months: m, label: `${m}mo` }))
    evResults.forEach((r) => {
      const sens = computeTenureSensitivity(r.model, route, inflation, monthlyKm, tenureOptions)
      sens.forEach((s, idx) => {
        rows[idx][r.model.id] = s.avgPerKm
        rows[idx][`${r.model.id}_risk`] = s.batteryRisk
      })
    })
    return rows
  }, [evResults, route, inflation, monthlyKm])

  const busesChange = (id: string, n: number) => {
    setBusesPerModel((prev) => ({ ...prev, [id]: n }))
  }

  /* ---------- Exports ---------- */
  const handleExportPDF = () => {
    document.body.classList.add('ev-print')
    setTimeout(() => {
      window.print()
      document.body.classList.remove('ev-print')
    }, 100)
  }

  const handleExportDeck = async () => {
    setIsExporting(true)
    try {
      const [{ jsPDF }, html2canvasModule] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])
      const html2canvas = html2canvasModule.default
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [1280, 720] })

      // Slide 1: exec summary
      const execEl = document.getElementById('ev-exec-summary')
      if (execEl) {
        const canvas = await html2canvas(execEl, { background: '#ffffff', scale: 2 } as any)
        const img = canvas.toDataURL('image/png')
        pdf.addImage(img, 'PNG', 40, 40, 1200, 640)
      }

      // One slide per selected chart
      for (const id of selectedCharts) {
        const el = document.getElementById(`ev-chart-${id}`)
        if (!el) continue
        pdf.addPage([1280, 720], 'landscape')
        const canvas = await html2canvas(el, { background: '#ffffff', scale: 2 } as any)
        const img = canvas.toDataURL('image/png')
        pdf.addImage(img, 'PNG', 40, 40, 1200, 640)
      }

      pdf.save(`EV-TCO-${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (e) {
      console.error('Export failed', e)
    } finally {
      setIsExporting(false)
      setExportMenuOpen(false)
    }
  }

  /* ---------- Render ---------- */

  return (
    <div className="space-y-6 p-4">
      {/* ====== TOP: Route + Inflation ====== */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden no-print-hide">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#444444]">EV vs ICE — TCO Model</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">
              All outputs in ₹/km · Weighted avg over{' '}
              {route.contractYears + route.extensionYears}y · Fleet MinG target{' '}
              {fmtPerKm(fleetAvgMinG, showEur, eurRate)}
            </p>
          </div>
          <div className="flex items-center gap-2 relative">
            <button
              onClick={handleExportPDF}
              className="text-[11px] font-semibold px-3 py-1.5 rounded border border-gray-300 text-[#444444] hover:bg-gray-50"
            >
              Export PDF
            </button>
            <button
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={isExporting}
              className="text-[11px] font-semibold px-3 py-1.5 rounded bg-[#444444] text-white hover:bg-[#1a2e52] disabled:opacity-50"
            >
              {isExporting ? 'Exporting...' : 'Export Deck ▾'}
            </button>
            {exportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-64 rounded-md border border-gray-200 bg-white shadow-lg z-10 p-2">
                <div className="text-[10px] font-bold text-gray-500 uppercase px-2 py-1">
                  Include charts
                </div>
                {CHARTS.map((c) => (
                  <label
                    key={c.id}
                    className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCharts.includes(c.id)}
                      onChange={() => toggleChart(c.id)}
                    />
                    <span className="text-[#444444]">{c.label}</span>
                  </label>
                ))}
                <button
                  onClick={handleExportDeck}
                  className="w-full mt-2 text-[11px] font-semibold px-3 py-1.5 rounded bg-[#73D700] text-white hover:bg-[#5cb000]"
                >
                  Generate Deck
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Route config */}
        <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
          <RouteField
            label="OW km"
            value={route.owKm}
            onChange={(v) => setRoute({ ...route, owKm: v })}
          />
          <RouteField
            label="Trips / mo"
            value={route.tripsPerMonth}
            onChange={(v) => setRoute({ ...route, tripsPerMonth: v })}
          />
          <RouteField
            label="Buses"
            value={route.buses}
            onChange={(v) => setRoute({ ...route, buses: v })}
          />
          <RouteField
            label="Contract yrs"
            value={route.contractYears}
            onChange={(v) => setRoute({ ...route, contractYears: v })}
          />
          <RouteField
            label="Extension yrs"
            value={route.extensionYears}
            onChange={(v) => setRoute({ ...route, extensionYears: v })}
          />
        </div>
        <div className="px-4 pb-3 text-[10px] text-gray-500 border-b border-gray-100">
          Monthly: {(monthlyKm / 1000).toFixed(1)}k km · Annual:{' '}
          {(annualKm / 100000).toFixed(2)} lakh km · Total horizon:{' '}
          {((annualKm * totalYears) / 100000).toFixed(1)} lakh km
        </div>

        {/* ICE inflation */}
        <div className="border-b border-gray-100">
          <button
            onClick={() => setIceInflationOpen((v) => !v)}
            className="w-full px-4 py-2 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wide hover:bg-gray-50 flex items-center justify-between"
          >
            <span>ICE Inflation (%/yr)</span>
            <span>{iceInflationOpen ? '▾' : '▸'}</span>
          </button>
          {iceInflationOpen && (
            <div className="px-4 pb-3 grid grid-cols-3 md:grid-cols-6 gap-2">
              <InflationField
                label="Fuel"
                value={inflation.fuelInflationPct}
                onChange={(v) => setInflation({ ...inflation, fuelInflationPct: v })}
              />
              <InflationField
                label="AdBlue"
                value={inflation.adblueInflationPct}
                onChange={(v) => setInflation({ ...inflation, adblueInflationPct: v })}
              />
              <InflationField
                label="Tolls"
                value={inflation.tollInflationPct}
                onChange={(v) => setInflation({ ...inflation, tollInflationPct: v })}
              />
              <InflationField
                label="Maintenance"
                value={inflation.maintenanceInflationPct}
                onChange={(v) => setInflation({ ...inflation, maintenanceInflationPct: v })}
              />
              <InflationField
                label="Tyres"
                value={inflation.tyreInflationPct}
                onChange={(v) => setInflation({ ...inflation, tyreInflationPct: v })}
              />
              <InflationField
                label="D/H Salary"
                value={inflation.dhSalaryInflationPct}
                onChange={(v) => setInflation({ ...inflation, dhSalaryInflationPct: v })}
              />
              <InflationField
                label="Admin"
                value={inflation.adminInflationPct}
                onChange={(v) => setInflation({ ...inflation, adminInflationPct: v })}
              />
              <InflationField
                label="Liasoning"
                value={inflation.liasoningInflationPct}
                onChange={(v) => setInflation({ ...inflation, liasoningInflationPct: v })}
              />
              <InflationField
                label="Challan"
                value={inflation.challanInflationPct}
                onChange={(v) => setInflation({ ...inflation, challanInflationPct: v })}
              />
              <InflationField
                label="Water"
                value={inflation.waterInflationPct}
                onChange={(v) => setInflation({ ...inflation, waterInflationPct: v })}
              />
              <InflationField
                label="Laundry"
                value={inflation.laundryInflationPct}
                onChange={(v) => setInflation({ ...inflation, laundryInflationPct: v })}
              />
              <InflationField
                label="Parking"
                value={inflation.parkingInflationPct}
                onChange={(v) => setInflation({ ...inflation, parkingInflationPct: v })}
              />
              <InflationField
                label="Dashcam"
                value={inflation.dashcamInflationPct}
                onChange={(v) => setInflation({ ...inflation, dashcamInflationPct: v })}
              />
              <InflationField
                label="Uniform"
                value={inflation.uniformInflationPct}
                onChange={(v) => setInflation({ ...inflation, uniformInflationPct: v })}
              />
              <InflationField
                label="State Tax"
                value={inflation.stateTaxInflationPct}
                onChange={(v) => setInflation({ ...inflation, stateTaxInflationPct: v })}
              />
              <InflationField
                label="Van"
                value={inflation.vanInflationPct}
                onChange={(v) => setInflation({ ...inflation, vanInflationPct: v })}
              />
              <InflationField
                label="AITP"
                value={inflation.aitpInflationPct}
                onChange={(v) => setInflation({ ...inflation, aitpInflationPct: v })}
              />
              <InflationField
                label="Insurance"
                value={inflation.insuranceInflationPct}
                onChange={(v) => setInflation({ ...inflation, insuranceInflationPct: v })}
              />
            </div>
          )}
        </div>

        {/* EV inflation */}
        <div>
          <button
            onClick={() => setEvInflationOpen((v) => !v)}
            className="w-full px-4 py-2 text-left text-[11px] font-bold text-gray-600 uppercase tracking-wide hover:bg-gray-50 flex items-center justify-between"
          >
            <span>EV Inflation (only two meaningful; toggle the rest)</span>
            <span>{evInflationOpen ? '▾' : '▸'}</span>
          </button>
          {evInflationOpen && (
            <div className="px-4 pb-3">
              <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-3">
                <InflationField
                  label="Charging"
                  value={inflation.evChargingInflationPct}
                  onChange={(v) =>
                    setInflation({ ...inflation, evChargingInflationPct: v })
                  }
                />
                <InflationField
                  label="D/H Salary"
                  value={inflation.evDhSalaryInflationPct}
                  onChange={(v) =>
                    setInflation({ ...inflation, evDhSalaryInflationPct: v })
                  }
                />
              </div>
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1.5">
                Apply ICE inflation to EV opex lines?
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                <ToggleField
                  label="Maintenance"
                  checked={inflation.evApplyInflationToMaintenance}
                  onChange={(v) =>
                    setInflation({ ...inflation, evApplyInflationToMaintenance: v })
                  }
                />
                <ToggleField
                  label="Tolls"
                  checked={inflation.evApplyInflationToTolls}
                  onChange={(v) => setInflation({ ...inflation, evApplyInflationToTolls: v })}
                />
                <ToggleField
                  label="Tyres"
                  checked={inflation.evApplyInflationToTyres}
                  onChange={(v) => setInflation({ ...inflation, evApplyInflationToTyres: v })}
                />
                <ToggleField
                  label="Admin"
                  checked={inflation.evApplyInflationToAdmin}
                  onChange={(v) => setInflation({ ...inflation, evApplyInflationToAdmin: v })}
                />
                <ToggleField
                  label="Insurance"
                  checked={inflation.evApplyInflationToInsurance}
                  onChange={(v) =>
                    setInflation({ ...inflation, evApplyInflationToInsurance: v })
                  }
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====== MODEL CARDS ====== */}
      <div className="no-print-hide">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-[#444444]">Vehicle Models</h3>
          <div className="flex gap-2">
            <button
              onClick={() => addModel('ev')}
              className="text-[11px] font-semibold px-3 py-1.5 rounded bg-[#73D700] text-white hover:bg-[#5cb000]"
            >
              + Add EV
            </button>
            <button
              onClick={() => addModel('diesel')}
              className="text-[11px] font-semibold px-3 py-1.5 rounded bg-gray-600 text-white hover:bg-gray-700"
            >
              + Add ICE
            </button>
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {results.map((r) => (
            <VehicleCard
              key={r.model.id}
              model={r.model}
              result={r}
              annualKm={annualKm}
              showEur={showEur}
              eurRate={eurRate}
              isBest={r.model.id === bestEvId}
              onChange={(patch) => updateModel(r.model.id, patch)}
              onRemove={() => removeModel(r.model.id)}
            />
          ))}
        </div>
      </div>

      {/* ====== EXECUTIVE SUMMARY (for deck slide 1) ====== */}
      <div id="ev-exec-summary" className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-bold text-[#444444] mb-1">Executive Summary</h3>
        <p className="text-[11px] text-gray-500 mb-4">
          Flix BD · EV Compare · {new Date().toISOString().slice(0, 10)}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          {results.slice(0, 4).map((r) => (
            <div
              key={r.model.id}
              className="rounded-lg border border-gray-200 p-3 bg-gradient-to-br from-gray-50 to-white"
            >
              <div className="text-[10px] text-gray-500 uppercase font-bold">{r.model.name}</div>
              <div className="text-lg font-bold text-[#444444] tabular-nums mt-1">
                {fmtPerKm(r.weightedAvgPerKm, showEur, eurRate)}
              </div>
              <div className="text-[10px] text-gray-500">
                Min MinG: {fmtPerKm(r.minViableMinG, showEur, eurRate)}
              </div>
              {r.breakevenYear && (
                <div className="text-[10px] text-[#73D700] font-semibold">
                  Breakeven: Y{r.breakevenYear}
                </div>
              )}
              {r.model.type === 'ev' && (
                <div className="text-[10px] text-gray-500">
                  Opt tenure: {Math.floor(r.optimalTenureMonths / 12)}y
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ====== CHART SELECTOR ====== */}
      <div className="no-print-hide flex items-center gap-3 text-[11px] px-1">
        <span className="font-bold text-gray-600 uppercase tracking-wide">Charts:</span>
        {CHARTS.map((c) => (
          <label key={c.id} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedCharts.includes(c.id)}
              onChange={() => toggleChart(c.id)}
            />
            <span className="text-[#444444]">{c.label}</span>
          </label>
        ))}
      </div>

      {/* ====== CHARTS ====== */}
      <div className="space-y-6">
        {/* Chart 1: Annual Breakdown */}
        {selectedCharts.includes('annual-breakdown') && (
          <ChartFrame
            id="ev-chart-annual-breakdown"
            title="Annual ₹/km Cost Breakdown"
            subtitle={`Per year · one bar per model · 🟡 amber outline = buffer/risk zone · 🔴 red = battery replacement spike`}
          >
            <ResponsiveContainer width="100%" height={380}>
              <BarChart data={annualChartData} margin={{ top: 25, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickFormatter={(v) =>
                    showEur ? `€${(v / eurRate).toFixed(1)}` : `₹${v.toFixed(0)}`
                  }
                />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #E5E7EB', fontSize: 11 }}
                  content={(props: any) => {
                    if (!props.active || !props.payload?.length) return null
                    const yrLabel = props.label
                    const yrNum = parseInt(yrLabel.replace('Y', ''))
                    return (
                      <div className="bg-white border border-gray-200 rounded-md p-2 shadow-lg text-[10px]">
                        <div className="font-bold text-[#444444] mb-1">{yrLabel}</div>
                        <table className="min-w-[180px]">
                          <tbody>
                            {results.map((r) => {
                              const y = r.yearlyData[yrNum - 1]
                              if (!y) return null
                              const battery = r.batteryEvents.find((e) => e.year === yrNum)
                              const inBuffer = r.batteryEvents.some(
                                (e) => yrNum >= e.warrantyEndYear && yrNum < e.year
                              )
                              const tag = battery
                                ? ` ⚡#${battery.replacementNumber} replacement`
                                : inBuffer
                                ? ' 🟡 buffer zone'
                                : ''
                              const tagColor = battery
                                ? 'text-[#FFAD00]'
                                : inBuffer
                                ? 'text-[#FFAD00]'
                                : ''
                              return (
                                <tr key={r.model.id}>
                                  <td className="text-gray-600 pr-2">
                                    {r.model.name}
                                    {tag && (
                                      <span className={`ml-1 font-bold ${tagColor}`}>
                                        {tag}
                                      </span>
                                    )}
                                  </td>
                                  <td className="text-right font-semibold text-[#444444] tabular-nums">
                                    {fmtPerKm(y.totalPerKm, showEur, eurRate)}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {results.map((r, idx) => {
                  const baseColor = MODEL_COLORS[idx % MODEL_COLORS.length]
                  return (
                    <Bar
                      key={r.model.id}
                      dataKey={r.model.id}
                      name={r.model.name}
                      fill={baseColor}
                      radius={[3, 3, 0, 0]}
                    >
                      {annualChartData.map((d, i) => {
                        const meta = d[`${r.model.id}_meta`]
                        const fill = meta?.isBatterySpike ? '#ff0000' : baseColor
                        const stroke = meta?.isBufferZone ? '#f59e0b' : undefined
                        const strokeWidth = meta?.isBufferZone ? 2.5 : 0
                        return (
                          <Cell
                            key={i}
                            fill={fill}
                            stroke={stroke}
                            strokeWidth={strokeWidth}
                          />
                        )
                      })}
                      <LabelList
                        dataKey={r.model.id}
                        position="top"
                        formatter={(v: any) =>
                          typeof v === 'number' ? v.toFixed(0) : ''
                        }
                        style={{ fontSize: 9, fill: '#374151' }}
                      />
                      <LabelList
                        dataKey={`${r.model.id}_meta`}
                        position="insideTop"
                        content={(props: any) => {
                          const { x, y, width, value } = props
                          if (!value?.batteryLabel) return null
                          return (
                            <text
                              x={x + width / 2}
                              y={y + 10}
                              textAnchor="middle"
                              fill="#fff"
                              fontSize={8}
                              fontWeight="bold"
                            >
                              {value.batteryLabel}
                            </text>
                          )
                        }}
                      />
                    </Bar>
                  )
                })}
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}

        {/* Chart 2: Waterfall */}
        {selectedCharts.includes('waterfall') && (
          <ChartFrame
            id="ev-chart-waterfall"
            title="Waterfall Analysis"
            subtitle={
              waterfallTab === 'yearly'
                ? 'Year-over-year ₹/km delta for selected model'
                : 'EV vs ICE ₹/km delta per cost component (weighted avg over tenure)'
            }
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="flex rounded border border-gray-200 overflow-hidden">
                <button
                  onClick={() => setWaterfallTab('yearly')}
                  className={`px-3 py-1 text-[11px] font-semibold ${
                    waterfallTab === 'yearly' ? 'bg-[#444444] text-white' : 'text-gray-600'
                  }`}
                >
                  Year-over-year
                </button>
                <button
                  onClick={() => setWaterfallTab('delta')}
                  className={`px-3 py-1 text-[11px] font-semibold ${
                    waterfallTab === 'delta' ? 'bg-[#444444] text-white' : 'text-gray-600'
                  }`}
                >
                  EV vs ICE delta
                </button>
              </div>
              <select
                value={waterfallModelId}
                onChange={(e) => setWaterfallModelId(e.target.value)}
                className="text-[11px] border border-gray-200 rounded px-2 py-1 bg-white text-[#444444]"
              >
                {(waterfallTab === 'delta' ? evResults : results).map((r) => (
                  <option key={r.model.id} value={r.model.id}>
                    {r.model.name}
                  </option>
                ))}
              </select>
            </div>
            <ResponsiveContainer width="100%" height={380}>
              {waterfallTab === 'yearly' ? (
                <BarChart
                  data={waterfallYearlyData}
                  margin={{ top: 25, right: 20, left: 0, bottom: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#6B7280' }} />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6B7280' }}
                    tickFormatter={(v) =>
                      showEur ? `€${(v / eurRate).toFixed(1)}` : `₹${v.toFixed(0)}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #E5E7EB',
                      fontSize: 11,
                    }}
                    formatter={(v: any, name: any, p: any) => {
                      if (name === 'total') return [fmtPerKm(+v, showEur, eurRate), 'Total']
                      return [fmtPerKm(+v, showEur, eurRate), name]
                    }}
                  />
                  <Bar dataKey="base" stackId="wf" fill="transparent" />
                  <Bar dataKey="posDelta" stackId="wf" name="Cost up">
                    {waterfallYearlyData.map((d, i) => {
                      let fill = '#FFAD00'
                      let stroke: string | undefined
                      let strokeWidth = 0
                      if (d.isBatterySpike) {
                        fill = '#ff0000'
                      } else if (d.isBufferZone) {
                        fill = '#FFAD00'
                        stroke = '#f59e0b'
                        strokeWidth = 2
                      } else if (d.isRefurbSpike) {
                        fill = '#ff0000'
                      }
                      return (
                        <Cell
                          key={i}
                          fill={fill}
                          stroke={stroke}
                          strokeWidth={strokeWidth}
                        />
                      )
                    })}
                    <LabelList
                      dataKey="total"
                      position="top"
                      formatter={(v: any) =>
                        typeof v === 'number' ? v.toFixed(1) : ''
                      }
                      style={{ fontSize: 9, fill: '#374151' }}
                    />
                    <LabelList
                      dataKey="batteryLabel"
                      position="insideTop"
                      style={{ fontSize: 9, fill: '#fff', fontWeight: 'bold' }}
                    />
                  </Bar>
                  <Bar dataKey="negDelta" stackId="wf" fill="#73D700" name="Cost down" />
                </BarChart>
              ) : (
                <BarChart
                  data={waterfallDeltaData}
                  margin={{ top: 25, right: 20, left: 0, bottom: 60 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: '#6B7280' }}
                    angle={-40}
                    textAnchor="end"
                    height={70}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#6B7280' }}
                    tickFormatter={(v) =>
                      showEur ? `€${(v / eurRate).toFixed(1)}` : `₹${v.toFixed(0)}`
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #E5E7EB',
                      fontSize: 11,
                    }}
                    formatter={(v: any) => fmtPerKm(+v, showEur, eurRate)}
                  />
                  <Bar dataKey="base" stackId="wf" fill="transparent" />
                  <Bar dataKey="value" stackId="wf">
                    {waterfallDeltaData.map((d, i) => {
                      let color = '#1e3a5f'
                      if (d.kind === 'saving') color = '#73D700'
                      else if (d.kind === 'premium') color = '#FFAD00'
                      else if (d.kind === 'end') color = '#444444'
                      return <Cell key={i} fill={color} />
                    })}
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={(v: any) =>
                        typeof v === 'number' ? v.toFixed(1) : ''
                      }
                      style={{ fontSize: 9, fill: '#374151' }}
                    />
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </ChartFrame>
        )}

        {/* Chart 3: Cumulative crossover */}
        {selectedCharts.includes('cumulative') && (
          <ChartFrame
            id="ev-chart-cumulative"
            title="Cumulative ₹/km Crossover"
            subtitle="cumulativeCostRs ÷ cumulativeKm per year · crossover = breakeven year"
          >
            <ResponsiveContainer width="100%" height={380}>
              <LineChart
                data={cumulativeData}
                margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickFormatter={(v) =>
                    showEur ? `€${(v / eurRate).toFixed(1)}` : `₹${v.toFixed(0)}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    fontSize: 11,
                  }}
                  formatter={(v: any) => fmtPerKm(+v, showEur, eurRate)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* Buffer zone shading (amber) for each EV battery event */}
                {evResults.flatMap((r) =>
                  r.batteryEvents.map((e) => (
                    <ReferenceArea
                      key={`buf-${r.model.id}-${e.replacementNumber}`}
                      x1={`Y${e.warrantyEndYear}`}
                      x2={`Y${e.year}`}
                      fill="#fef3c7"
                      fillOpacity={0.5}
                      stroke="#f59e0b"
                      strokeOpacity={0.3}
                      strokeDasharray="2 2"
                    />
                  ))
                )}
                {/* Warranty-end lines (amber dashed) */}
                {evResults.flatMap((r) =>
                  r.batteryEvents.map((e) => (
                    <ReferenceLine
                      key={`warr-${r.model.id}-${e.replacementNumber}`}
                      x={`Y${e.warrantyEndYear}`}
                      stroke="#f59e0b"
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                    />
                  ))
                )}
                {/* Replacement lines (red solid) */}
                {evResults.flatMap((r) =>
                  r.batteryEvents.map((e) => (
                    <ReferenceLine
                      key={`rep-${r.model.id}-${e.replacementNumber}`}
                      x={`Y${e.year}`}
                      stroke="#ff0000"
                      strokeWidth={1.5}
                      label={{
                        value: `⚡#${e.replacementNumber}`,
                        position: 'top',
                        fill: '#ff0000',
                        fontSize: 9,
                      }}
                    />
                  ))
                )}
                <ReferenceLine
                  y={fleetAvgMinG}
                  stroke="#FFAD00"
                  strokeDasharray="4 4"
                  label={{
                    value: `Fleet MinG ${fmtPerKm(fleetAvgMinG, showEur, eurRate)}`,
                    position: 'insideTopRight',
                    fill: '#FFAD00',
                    fontSize: 10,
                  }}
                />
                {results.map((r, idx) => (
                  <Line
                    key={r.model.id}
                    type="monotone"
                    dataKey={r.model.id}
                    name={r.model.name}
                    stroke={MODEL_COLORS[idx % MODEL_COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}

        {/* Chart 4: Tenure curve */}
        {selectedCharts.includes('tenure-curve') && (
          <ChartFrame
            id="ev-chart-tenure-curve"
            title="Optimal Tenure Curve"
            subtitle="Weighted avg ₹/km across loan tenures 36–120 months · minimum = optimal"
          >
            <ResponsiveContainer width="100%" height={380}>
              <LineChart
                data={tenureCurveData}
                margin={{ top: 20, right: 30, left: 0, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6B7280' }} />
                <YAxis
                  tick={{ fontSize: 10, fill: '#6B7280' }}
                  tickFormatter={(v) =>
                    showEur ? `€${(v / eurRate).toFixed(1)}` : `₹${v.toFixed(0)}`
                  }
                />
                <Tooltip
                  contentStyle={{
                    background: '#fff',
                    border: '1px solid #E5E7EB',
                    fontSize: 11,
                  }}
                  formatter={(v: any) => fmtPerKm(+v, showEur, eurRate)}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {/* Optimal tenure marker (green dashed) per EV model */}
                {evResults.map((r, idx) => {
                  const optMonths = r.optimalTenureMonths
                  const closest = tenureOptions.reduce((best, m) =>
                    Math.abs(m - optMonths) < Math.abs(best - optMonths) ? m : best
                  )
                  return (
                    <ReferenceLine
                      key={`opt-${r.model.id}`}
                      x={`${closest}mo`}
                      stroke={MODEL_COLORS[(idx + 1) % MODEL_COLORS.length]}
                      strokeDasharray="3 3"
                      strokeWidth={1.2}
                      label={{
                        value: '★',
                        position: 'top',
                        fill: MODEL_COLORS[(idx + 1) % MODEL_COLORS.length],
                        fontSize: 11,
                      }}
                    />
                  )
                })}
                {evResults.map((r, idx) => (
                  <Line
                    key={r.model.id}
                    type="monotone"
                    dataKey={r.model.id}
                    name={r.model.name}
                    stroke={MODEL_COLORS[(idx + 1) % MODEL_COLORS.length]}
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
              {evResults.map((r) => (
                <div
                  key={r.model.id}
                  className="rounded-md bg-gray-50 border border-gray-200 p-2 text-[10px]"
                >
                  <div className="font-bold text-[#444444]">{r.model.name}</div>
                  <div className="text-gray-600">
                    ★ Optimal: {Math.floor(r.optimalTenureMonths / 12)}y ({r.optimalTenureMonths}
                    mo)
                  </div>
                  <div className="text-gray-500">
                    Battery limit:{' '}
                    {(((r.model.batteryWarrantyKm ?? 0) + (r.model.batteryBufferKm ?? 0)) /
                      100000).toFixed(1)}{' '}
                    lakh km · Annual: {(annualKm / 100000).toFixed(2)} lakh km
                  </div>
                </div>
              ))}
            </div>
          </ChartFrame>
        )}
      </div>

      {/* ====== TCO TABLE + FLEET BLEND ====== */}
      <TCOTable
        results={results}
        dieselResult={dieselResult}
        showEur={showEur}
        eurRate={eurRate}
        busesPerModel={busesPerModel}
        onBusesChange={busesChange}
        fleetAvgMinG={fleetAvgMinG}
        owKm={route.owKm}
      />

      {/* ====== ADVANCED ANALYTICS (Phase 3) ====== */}
      <AdvancedAnalytics
        models={models}
        results={results}
        route={route}
        inflation={inflation}
        monthlyKm={monthlyKm}
        showEur={showEur}
        eurRate={eurRate}
        busesPerModel={busesPerModel}
      />

      {/* Print CSS */}
      <style jsx global>{`
        @media print {
          body.ev-print .no-print-hide {
            display: none !important;
          }
          body.ev-print #ev-exec-summary,
          body.ev-print [id^='ev-chart-'] {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>
    </div>
  )
}

/* -------------------- Helpers -------------------- */

function RouteField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px]">
      <span className="text-gray-500">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded bg-white border border-gray-200 px-2 py-1.5 text-xs text-[#444444] text-right focus:border-[#73D700] focus:outline-none"
      />
    </label>
  )
}

function InflationField({
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
      <span className="text-gray-500 truncate">{label}</span>
      <input
        type="number"
        value={value}
        step={0.5}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded bg-white border border-gray-200 px-1.5 py-1 text-[11px] text-[#444444] text-right focus:border-[#73D700] focus:outline-none"
      />
    </label>
  )
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-[#444444]">{label}</span>
    </label>
  )
}

function ChartFrame({
  id,
  title,
  subtitle,
  children,
}: {
  id: string
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div id={id} className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3">
        <h3 className="text-sm font-bold text-[#444444]">{title}</h3>
        <p className="text-[11px] text-gray-500 mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  )
}
