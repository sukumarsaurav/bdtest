export const INDIA_MING_TARGET = 56.565  // ₹/km, fleet-wide blended MinG target

// Seasonality: S=5d/wk, L=6d/wk, XL=7d/wk, HS treated as L
export type SeasonType = 'S' | 'L' | 'XL' | 'HS'

export const SEASON_MULTIPLIER: Record<SeasonType, number> = {
  S:  5 / 7,   // 0.714
  L:  6 / 7,   // 0.857
  XL: 7 / 7,   // 1.000
  HS: 6 / 7,   // treat as L
}

// Season calendar: Mar 2026 – Jan 2027. Keys are 'YYYY-MM'.
// TODO: populate from "Seasonality Mar26Jan27.xlsx" if/when accessible; defaults below.
export const SEASON_CALENDAR: Record<string, SeasonType> = {
  '2026-03': 'S',
  '2026-04': 'S',
  '2026-05': 'S',
  '2026-06': 'S',
  '2026-07': 'S',
  '2026-08': 'L',
  '2026-09': 'L',
  '2026-10': 'L',
  '2026-11': 'XL',
  '2026-12': 'XL',
  '2027-01': 'XL',
}

export function getSeasonMultiplier(yearMonth: string): number {
  const season = SEASON_CALENDAR[yearMonth] ?? 'L'
  return SEASON_MULTIPLIER[season]
}

export function getSeasonType(yearMonth: string): SeasonType {
  return SEASON_CALENDAR[yearMonth] ?? 'L'
}

export function getAnnualSeasonFactor(startYearMonth: string, months: number = 12): number {
  const parts = startYearMonth.split('-').map(Number)
  const y = parts[0]
  const m = parts[1]
  if (!y || !m) return 1
  let total = 0
  for (let i = 0; i < months; i++) {
    const monthIdx = m - 1 + i
    const month = (monthIdx % 12) + 1
    const year = y + Math.floor(monthIdx / 12)
    const key = `${year}-${String(month).padStart(2, '0')}`
    total += getSeasonMultiplier(key)
  }
  return total / months
}

export function fmtINR(v: number | null | undefined, decimals = 1): string {
  if (v == null) return '—'
  return '₹' + v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtLakhs(v: number | null | undefined, decimals = 1): string {
  if (v == null) return '—'
  return '₹' + v.toFixed(decimals) + 'L'
}

export function fmtCr(v: number): string {
  return '₹' + (v / 100).toFixed(2) + 'Cr'
}

export function fmtEUR(v: number, rate: number, decimals = 2): string {
  return '€' + (v / rate).toFixed(decimals)
}

export function fmtPct(v: number | null | undefined, decimals = 1): string {
  if (v == null) return '—'
  return v.toFixed(decimals) + '%'
}

export function fmtKm(v: number): string {
  return v.toLocaleString('en-IN') + ' km'
}

export function fmtNum(v: number, decimals = 0): string {
  return v.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export const formatNumber = fmtNum
export const formatCurrency = fmtINR
export const formatPercent = fmtPct

export function formatPerKm(v: number | null | undefined, decimals = 2): string {
  if (v == null) return '—'
  return '₹' + v.toFixed(decimals) + '/km'
}

export function fmtMoney(lakhs: number, showEur: boolean, eurRate: number): string {
  if (showEur) {
    const eur = (lakhs * 100000) / eurRate
    if (Math.abs(eur) >= 1_000_000) return `€${(eur / 1_000_000).toFixed(2)}M`
    if (Math.abs(eur) >= 1_000) return `€${(eur / 1_000).toFixed(1)}K`
    return `€${eur.toFixed(0)}`
  }
  if (Math.abs(lakhs) >= 100) return `₹${(lakhs / 100).toFixed(2)}Cr`
  return `₹${lakhs.toFixed(1)}L`
}

export function fmtPerKm(rupPerKm: number, showEur: boolean, eurRate: number, decimals = 2): string {
  if (showEur) return `€${(rupPerKm / eurRate).toFixed(decimals)}/km`
  return `₹${rupPerKm.toFixed(decimals)}/km`
}

export function computeDelta(line: { minG: number; pc5: number | null; pcGst?: number | null; gst: 5 | 18 }): number | null {
  const pc = line.pc5
  if (pc == null || pc === 0) return null
  // For 18% partners, effective cost = minG × 1.13 (13% GST burden above 5% baseline)
  const effMinG = line.gst === 18 ? line.minG * 1.13 : line.minG
  // Sign convention: positive = healthy (PC above cost), negative = overpaying
  return (pc - effMinG) / pc * 100
}

export function healthStatus(delta: number | null): 'healthy' | 'marginal' | 'overpaying' | 'no_pc' {
  if (delta == null) return 'no_pc'
  // Inverted sign: positive = healthy (PC > cost)
  if (delta > 0) return 'healthy'
  if (delta >= -1) return 'marginal'
  return 'overpaying'
}

export function deltaColor(delta: number | null): string {
  if (delta == null) return 'text-[#444444]/40'
  if (delta > 0) return 'text-[#73D700]'
  if (delta >= -1) return 'text-[#FFAD00]'
  return 'text-[#FFAD00]'
}

export function deltaColorBg(delta: number | null): string {
  if (delta == null) return 'bg-gray-100'
  if (delta > 0) return 'bg-[#73D700]/10'
  if (delta >= -1) return 'bg-[#FFAD00]/10'
  return 'bg-[#FFAD00]/15'
}
