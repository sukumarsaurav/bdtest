import { HubRow, SheetSnapshot } from '@/types'

const COL = {
  month: 0, period: 1, week: 2, region: 3, partner: 4, bpCode: 5,
  lineName: 6, lineId: 7, busKm: 8, busTrips: 9, perTripKms: 10,
  vanTrips: 11, buses: 12, minG: 13, busCost: 14, vanCost: 15,
  bonus: 16, cancellation: 17, adjustment: 18, penalty: 19,
  basicValue: 20, gstRate: 21, gstAmount: 22, invoiceAmount: 23,
  tdsRate: 24, tdsAmount: 25, heldGst: 26, otherAdj: 27,
  payableAmount: 28, yearWeek: 34, year: 32, monthNo: 33,
}

function n(v: unknown): number { return parseFloat(String(v ?? 0)) || 0 }
function regionCode(s: string): 'N' | 'S' | 'W' {
  const r = String(s).trim().toLowerCase()
  if (r === 'south') return 'S'
  if (r === 'west')  return 'W'
  return 'N'
}

export function transformHubRows(rawArrays: unknown[][]): HubRow[] {
  return rawArrays.slice(1)
    .filter(r => (r as unknown[])[COL.lineId] && (r as unknown[])[COL.busKm] && !String((r as unknown[])[COL.partner] ?? '').includes('Total'))
    .map(r => {
      const row = r as unknown[]
      return {
        month:        n(row[COL.month]),
        period:       String(row[COL.period] ?? ''),
        week:         n(row[COL.week]),
        region:       regionCode(String(row[COL.region] ?? '')),
        partner:      String(row[COL.partner] ?? '').trim(),
        bpCode:       n(row[COL.bpCode]),
        lineName:     String(row[COL.lineName] ?? ''),
        lineId:       String(row[COL.lineId] ?? '').trim(),
        busKm:        n(row[COL.busKm]),
        busTrips:     n(row[COL.busTrips]),
        perTripKms:   n(row[COL.perTripKms]),
        vanTrips:     n(row[COL.vanTrips]),
        buses:        n(row[COL.buses]),
        minG:         n(row[COL.minG]),
        busCost:      n(row[COL.busCost]),
        vanCost:      n(row[COL.vanCost]),
        bonus:        n(row[COL.bonus]),
        cancellation: n(row[COL.cancellation]),
        adjustment:   n(row[COL.adjustment]),
        penalty:      n(row[COL.penalty]),
        basicValue:   n(row[COL.basicValue]),
        gstRate:      n(row[COL.gstRate]),
        gstAmount:    n(row[COL.gstAmount]),
        invoiceAmount:n(row[COL.invoiceAmount]),
        tdsRate:      n(row[COL.tdsRate]),
        tdsAmount:    n(row[COL.tdsAmount]),
        heldGst:      n(row[COL.heldGst]),
        otherAdj:     n(row[COL.otherAdj]),
        payableAmount:n(row[COL.payableAmount]),
        yearWeek:     String(row[COL.yearWeek] ?? ''),
        year:         n(row[COL.year]),
        monthNo:      n(row[COL.monthNo]),
      }
    })
}

export function buildSnapshot(rows: HubRow[], source: SheetSnapshot['source']): SheetSnapshot {
  const sample = rows[0]
  return {
    yearWeek:  sample?.yearWeek ?? '',
    period:    sample?.period ?? '',
    pushedAt:  new Date().toISOString(),
    source,
    rows,
  }
}
