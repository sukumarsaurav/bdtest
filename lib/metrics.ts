import { HubRow, LineActual, Line } from '@/types'
import { BASE_LINES } from './baseline'

const baseByCode = Object.fromEntries(BASE_LINES.map(l => [l.code, l]))

export function computeLineActuals(rows: HubRow[]): LineActual[] {
  const byLine: Record<string, HubRow[]> = {}
  rows.forEach(r => {
    if (!byLine[r.lineId]) byLine[r.lineId] = []
    byLine[r.lineId].push(r)
  })

  return Object.entries(byLine).map(([lineId, lineRows]) => {
    const baseLine: Line | undefined = baseByCode[lineId]
    const busKm       = lineRows.reduce((s, r) => s + r.busKm, 0)
    const payable     = lineRows.reduce((s, r) => s + r.payableAmount, 0)
    const bonus       = lineRows.reduce((s, r) => s + r.bonus, 0)
    const penalty     = lineRows.reduce((s, r) => s + r.penalty, 0)
    const cancellation= lineRows.reduce((s, r) => s + r.cancellation, 0)
    const heldGst     = lineRows.reduce((s, r) => s + r.heldGst, 0)
    const sheetMinG   = lineRows[0].minG

    const contractedMonthlyKm = baseLine
      ? baseLine.owKm * 2 * baseLine.rt * baseLine.buses
      : 0
    const contractedWeeklyKm = contractedMonthlyKm / 4.33

    return {
      lineId,
      lineName:          lineRows[0].lineName,
      partner:           lineRows[0].partner,
      region:            lineRows[0].region,
      busKm,
      contractedWeeklyKm:+contractedWeeklyKm.toFixed(0),
      kmUtilisation:     contractedWeeklyKm > 0
                           ? +(busKm / contractedWeeklyKm * 100).toFixed(1)
                           : 0,
      contractedMinG:    baseLine?.minG ?? 0,
      sheetMinG,
      minGVariance:      +(sheetMinG - (baseLine?.minG ?? sheetMinG)).toFixed(2),
      payableAmount:     payable,
      effectiveCpk:      busKm > 0 ? +(payable / busKm).toFixed(2) : 0,
      bonus, penalty, cancellation, heldGst,
    }
  })
}

export function computePayoutWaterfall(rows: HubRow[]) {
  return {
    basicValue:    rows.reduce((s, r) => s + r.basicValue, 0),
    gstAmount:     rows.reduce((s, r) => s + r.gstAmount, 0),
    tdsAmount:     rows.reduce((s, r) => s + r.tdsAmount, 0),
    heldGst:       rows.reduce((s, r) => s + r.heldGst, 0),
    otherAdj:      rows.reduce((s, r) => s + r.otherAdj, 0),
    payableAmount: rows.reduce((s, r) => s + r.payableAmount, 0),
    bonus:         rows.reduce((s, r) => s + r.bonus, 0),
    penalty:       rows.reduce((s, r) => s + r.penalty, 0),
    cancellation:  rows.reduce((s, r) => s + r.cancellation, 0),
  }
}
