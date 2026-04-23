import type { SeasonType } from '@/lib/formatters'

export interface Line {
  code: string
  route: string
  partner: string
  region: 'N' | 'S' | 'W'
  buses: number
  type: 'Sleeper' | 'Hybrid' | 'Seater'
  gst: 5 | 18
  owKm: number
  rt: number
  minG: number
  pc5: number | null
  pcGst?: number | null  // deprecated — use pc5 as single benchmark for all lines
  delta: number | null
  monthly: number
  dieselAtCommission?: number
  startDate?: string
  seasonality?: Record<string, SeasonType>  // optional per-line overrides, key = 'YYYY-MM'
}

export interface HubRow {
  month: number
  period: string
  week: number
  region: 'N' | 'S' | 'W'
  partner: string
  bpCode: number
  lineName: string
  lineId: string
  busKm: number
  busTrips: number
  perTripKms: number
  vanTrips: number
  buses: number
  minG: number
  busCost: number
  vanCost: number
  bonus: number
  cancellation: number
  adjustment: number
  penalty: number
  basicValue: number
  gstRate: number
  gstAmount: number
  invoiceAmount: number
  tdsRate: number
  tdsAmount: number
  heldGst: number
  otherAdj: number
  payableAmount: number
  yearWeek: string
  year: number
  monthNo: number
}

export interface SheetSnapshot {
  yearWeek: string
  period: string
  pushedAt: string
  source: 'bookmarklet' | 'power_automate'
  rows: HubRow[]
}

export interface LineActual {
  lineId: string
  lineName: string
  partner: string
  region: 'N' | 'S' | 'W'
  busKm: number
  contractedWeeklyKm: number
  kmUtilisation: number
  contractedMinG: number
  sheetMinG: number
  minGVariance: number
  payableAmount: number
  effectiveCpk: number
  bonus: number
  penalty: number
  cancellation: number
  heldGst: number
}

export type ChangeType =
  | 'fuel_change' | 'expansion' | 'repurposing' | 'removal'
  | 'rest_stop' | 'cargo_deduction' | 'toll_change'
  | 'payout_revision' | 'contract_tenure' | 'custom'

export interface Change {
  cid: number
  type: ChangeType
  note?: string
  // fuel_change
  fuelRegion?: 'all' | 'N' | 'S' | 'W'
  fuelCity?: string
  currentDieselPrice?: number
  newDieselPrice?: number
  currentMileage?: number
  _fuelResult?: FuelResult
  // expansion (new route only)
  expRouteName?: string
  expPartner?: string
  expRegion?: 'N' | 'S' | 'W'
  expBusType?: 'Sleeper' | 'Hybrid' | 'Seater'
  expGstSlab?: 5 | 18
  expBuses?: number
  expOwKms?: number
  expRtPerMonth?: number
  expMinG?: number
  // repurposing
  repFromLineId?: string
  repBuses?: number
  repToLineId?: string
  repToOwKms?: number
  repToRtPerMonth?: number
  repNewMinG?: number
  // removal, rest_stop, cargo_deduction, toll_change (line-scoped)
  baselineLineId?: string
  buses?: number
  kmDelta?: number
  restStopsAdded?: number
  restStopCost?: number
  cargoPerTrip?: number
  // payout_revision
  payoutDelta?: number
  payoutGstNew?: number
  payoutMingPct?: number
  payoutScope?: 'all' | 'region' | 'partner' | 'line'
  payoutMode?: 'pct' | 'flat' | 'perKm'
  payoutRegion?: 'N' | 'S' | 'W'
  payoutBpId?: string
  payoutSelectedLines?: Record<string, boolean>
  payoutBpRevisions?: Record<string, number>
  payoutLineRevisions?: Record<string, number>
  payoutGstSwitch?: null | '5to18' | '18to5'
  payoutInputMode?: 'delta' | 'absolute' | 'pct'  // default: 'pct' (existing behavior)
  payoutLineBuses?: Record<string, number>          // partial bus count per line
  // contract_tenure
  fleetRevisions?: Array<{
    lineId: string
    newMinG: number
    newTenure: number
    vehicleCost?: number
    interestRate?: number
    financing?: number
  }>
  // custom
  customAmount?: number
  customPerKm?: number
  customPct?: number
  customMode?: 'fixed' | 'per_km' | 'pct'
  customScope?: 'all' | 'region' | 'partner' | 'line'
  customRegion?: 'N' | 'S' | 'W'
  customBpId?: string
  customLineId?: string
}

export interface FuelResult {
  curCpk: number
  fcstCpk: number
  deltaCpk: number
  lineImpacts: Array<{
    lineName: string; partner: string; region: string; busType: string
    moKm: number; closingFuelCpk: number; closingDieselPPL: number
    curCpk: number; fcstCpk: number; deltaVsClose: number
    deltaAlready: number; deltaIncremental: number
    moImpact: number; moAlready: number; oldPcKm: number; newPcKm: number; pctInc: number
  }>
}

export interface Scenario {
  uid: number
  name: string
  changes: Change[]
}

export interface AppState {
  lines: Line[]
  scenarios: Scenario[]
  sheetData: SheetSnapshot | null
  availableWeeks: string[]
  selectedWeek: string
  activeTab: 'command-centre' | 'fleet-analytics' | 'analytics' | 'baseline' | 'calculator' | 'scenarios' | 'ev-compare'
  activeRegion: 'all' | 'N' | 'S' | 'W'
  theme: 'light' | 'dark'
  eurRate: number
  showEur: boolean
  blSearch: string
  blSelectedBPs: string[]
  blTypeFilter: 'all' | 'Sleeper' | 'Hybrid' | 'Seater'
  setLines: (lines: Line[]) => void
  addLine: (l: Line) => void
  updateLine: (code: string, u: Partial<Line>) => void
  deleteLine: (code: string) => void
  importLines: (lines: Line[], mode: 'replace' | 'append') => void
  addScenario: () => void
  updateScenario: (uid: number, u: Partial<Scenario>) => void
  deleteScenario: (uid: number) => void
  addChange: (uid: number, type: ChangeType) => void
  updateChange: (uid: number, cid: number, u: Partial<Change>) => void
  deleteChange: (uid: number, cid: number) => void
  setSheetData: (d: SheetSnapshot) => void
  setAvailableWeeks: (w: string[]) => void
  setSelectedWeek: (w: string) => void
  setTheme: (t: 'light' | 'dark') => void
  setEurRate: (r: number) => void
  setShowEur: (v: boolean) => void
  setActiveRegion: (r: AppState['activeRegion']) => void
  setActiveTab: (t: AppState['activeTab']) => void
  setBlSearch: (s: string) => void
  setBlTypeFilter: (f: AppState['blTypeFilter']) => void
  setBlSelectedBPs: (bps: string[]) => void
}
