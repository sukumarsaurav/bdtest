import * as XLSX from 'xlsx'
import { Line, SheetSnapshot } from '@/types'
import { computeLineActuals } from '@/lib/metrics'

interface ExportInput {
  lines: Line[]
  sheetData: SheetSnapshot | null
}

function classifyHealth(line: Line): 'healthy' | 'marginal' | 'overpaying' {
  const d = line.delta
  if (d == null) return 'overpaying'
  if (d > 5) return 'healthy'
  if (d >= 0) return 'marginal'
  return 'overpaying'
}

export async function exportAnalyticsExcel({ lines, sheetData }: ExportInput) {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Lines (with actuals if present)
  const actualsMap = sheetData
    ? new Map(computeLineActuals(sheetData.rows).map((a) => [a.lineId, a]))
    : new Map()

  const linesData = lines.map((l) => {
    const a = actualsMap.get(l.code)
    return {
      Code: l.code,
      Route: l.route,
      Partner: l.partner,
      Region: l.region,
      Type: l.type,
      Buses: l.buses,
      'OW km': l.owKm,
      'RT/mo': l.rt,
      MinG: l.minG,
      'PC': l.pc5,
      'Delta %': l.delta,
      'Monthly L': l.monthly,
      Health: classifyHealth(l),
      'Actual KM': a?.busKm ?? null,
      'Util %': a?.kmUtilisation ?? null,
      'Eff CPK': a?.effectiveCpk ?? null,
      'Payable': a?.payableAmount ?? null,
    }
  })
  const ws1 = XLSX.utils.json_to_sheet(linesData)
  XLSX.utils.book_append_sheet(wb, ws1, 'Lines')

  // Sheet 2: BD opportunities
  const bd = lines
    .filter((l) => {
      if (l.pc5 == null || l.pc5 === 0) return false
      const effMinG = l.gst === 18 ? l.minG * 1.13 : l.minG
      return ((effMinG - l.pc5) / l.pc5 * 100) > 0
    })
    .map((l) => {
      const effMinG = l.gst === 18 ? l.minG * 1.13 : l.minG
      const target = +((l.pc5 as number) * 1.02).toFixed(2)
      const km = l.owKm * 2 * l.rt * l.buses
      const monthlySavings = +(Math.max(0, effMinG - target) * km / 1e5).toFixed(2)
      return {
        Code: l.code,
        Route: l.route,
        Partner: l.partner,
        Region: l.region,
        'Delta %': l.delta,
        'Current MinG': l.minG,
        'Target MinG': target,
        'Monthly Savings (L)': monthlySavings,
        'Annual Savings (L)': +(monthlySavings * 12).toFixed(2),
      }
    })
    .filter((r) => r['Monthly Savings (L)'] > 0)
    .sort((a, b) => b['Monthly Savings (L)'] - a['Monthly Savings (L)'])
  const ws2 = XLSX.utils.json_to_sheet(bd)
  XLSX.utils.book_append_sheet(wb, ws2, 'BD Opportunities')

  // Sheet 3: Partners summary
  const grouped: Record<string, Line[]> = {}
  lines.forEach((l) => {
    if (!grouped[l.partner]) grouped[l.partner] = []
    grouped[l.partner].push(l)
  })
  const partnersData = Object.entries(grouped)
    .map(([partner, pLines]) => {
      const totalMonthly = pLines.reduce((s, l) => s + l.monthly, 0)
      const avgMinG = pLines.reduce((s, l) => s + l.minG, 0) / pLines.length
      const deltas = pLines.filter((l) => l.delta != null)
      const avgDelta = deltas.length > 0
        ? deltas.reduce((s, l) => s + (l.delta ?? 0), 0) / deltas.length
        : 0
      return {
        Partner: partner,
        '# Lines': pLines.length,
        '# Buses': pLines.reduce((s, l) => s + l.buses, 0),
        'Total Monthly L': +totalMonthly.toFixed(1),
        'Avg MinG': +avgMinG.toFixed(0),
        'Avg Delta %': +avgDelta.toFixed(1),
        Regions: Array.from(new Set(pLines.map((l) => l.region))).sort().join(','),
      }
    })
    .sort((a, b) => b['Total Monthly L'] - a['Total Monthly L'])
  const ws3 = XLSX.utils.json_to_sheet(partnersData)
  XLSX.utils.book_append_sheet(wb, ws3, 'Partners')

  const stamp = new Date().toISOString().slice(0, 10)
  XLSX.writeFile(wb, `flix-analytics-${stamp}.xlsx`)
}

export async function exportAnalyticsPDF({ lines, sheetData }: ExportInput) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
  ])

  const root = document.getElementById('analytics-root')
  if (!root) {
    alert('Analytics root not found')
    return
  }

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const margin = 8

  // Page 1 — Cover
  pdf.setFontSize(22)
  pdf.setTextColor(10, 24, 50)
  pdf.text('Flix India BD — Analytics Report', margin, 30)
  pdf.setFontSize(12)
  pdf.setTextColor(100)
  pdf.text(`Generated ${new Date().toLocaleString()}`, margin, 40)
  if (sheetData) {
    pdf.text(`Week: ${sheetData.yearWeek} (${sheetData.period}) — ${sheetData.rows.length} rows`, margin, 47)
  } else {
    pdf.text('No live week data — baseline metrics only', margin, 47)
  }

  const totalMonthly = lines.reduce((s, l) => s + l.monthly, 0)
  const avgMinG = lines.length === 0 ? 0 : lines.reduce((s, l) => s + l.minG, 0) / lines.length
  const healthy = lines.filter((l) => (l.delta ?? -100) > 5).length
  const healthyPct = lines.length === 0 ? 0 : (healthy / lines.length) * 100

  pdf.setFontSize(11)
  pdf.setTextColor(10, 24, 50)
  pdf.text('Headline KPIs', margin, 65)
  pdf.setFontSize(10)
  pdf.setTextColor(60)
  pdf.text(`Total monthly outlay: ₹${(totalMonthly / 100).toFixed(2)} Cr (${lines.length} lines)`, margin, 73)
  pdf.text(`Fleet avg MinG:       ₹${avgMinG.toFixed(1)}/km`, margin, 80)
  pdf.text(`Fleet health:         ${healthyPct.toFixed(0)}% healthy (${healthy} of ${lines.length})`, margin, 87)

  // Pages 2-4 — snapshot the analytics-root in chunks
  try {
    const canvas = await html2canvas(root, { scale: 1.5, backgroundColor: '#ffffff', logging: false })
    const imgW = pageW - 2 * margin
    const imgH = (canvas.height * imgW) / canvas.width
    const pageContentH = pageH - 2 * margin
    let position = 0
    const imgData = canvas.toDataURL('image/png')

    while (position < imgH) {
      pdf.addPage()
      // We render the same image positioned upward to mimic page slicing
      pdf.addImage(imgData, 'PNG', margin, margin - position, imgW, imgH)
      position += pageContentH
    }
  } catch (e) {
    pdf.addPage()
    pdf.setFontSize(11)
    pdf.setTextColor(220, 38, 38)
    pdf.text('Could not capture analytics view: ' + (e instanceof Error ? e.message : 'unknown'), margin, 30)
  }

  const stamp = new Date().toISOString().slice(0, 10)
  pdf.save(`flix-analytics-${stamp}.pdf`)
}
