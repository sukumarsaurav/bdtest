'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { useStore } from '@/store/useStore'
import { Line, LineActual, SheetSnapshot } from '@/types'
import { computeLineActuals } from '@/lib/metrics'
import { fmtINR, fmtPct, fmtLakhs, fmtNum, deltaColor } from '@/lib/formatters'

type SortKey =
  | 'code' | 'route' | 'partner' | 'region' | 'type' | 'buses'
  | 'owKm' | 'rt' | 'minG' | 'pc5' | 'delta' | 'monthly'
  | 'busKm' | 'kmUtilisation' | 'effectiveCpk' | 'payableAmount' | 'wowDelta'

type SortDir = 'asc' | 'desc'

function headerClass(active: boolean) {
  return `px-2 py-2 text-left text-xs font-medium uppercase tracking-wider cursor-pointer select-none whitespace-nowrap ${
    active ? 'text-[#73D700]' : 'text-gray-500'
  } hover:text-[#444444] dark:hover:text-white`
}

export default function LinesTable() {
  const allLines = useStore((s) => s.lines)
  const activeRegion = useStore((s) => s.activeRegion)
  const lines = useMemo(() => activeRegion === 'all' ? allLines : allLines.filter((l: any) => l.region === activeRegion), [allLines, activeRegion])
  const sheetData = useStore((s) => s.sheetData)
  const availableWeeks = useStore((s) => s.availableWeeks)
  const [sortKey, setSortKey] = useState<SortKey>('code')
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [search, setSearch] = useState('')
  const [regionFilter, setRegionFilter] = useState<'all' | 'N' | 'S' | 'W'>('all')
  const [healthFilter, setHealthFilter] = useState<'all' | 'healthy' | 'marginal' | 'overpaying'>('all')
  const [expandedCode, setExpandedCode] = useState<string | null>(null)
  const [priorActuals, setPriorActuals] = useState<Map<string, LineActual>>(new Map())

  const hasActuals = sheetData !== null

  // Find prior week relative to current sheetData.yearWeek
  useEffect(() => {
    if (!sheetData || availableWeeks.length < 2) {
      setPriorActuals(new Map())
      return
    }
    const sorted = [...availableWeeks].sort()
    const idx = sorted.indexOf(sheetData.yearWeek)
    const priorWeek = idx > 0 ? sorted[idx - 1] : null
    if (!priorWeek) {
      setPriorActuals(new Map())
      return
    }
    const ctrl = new AbortController()
    fetch(`/api/sheet-data?week=${priorWeek}`, { signal: ctrl.signal })
      .then((r) => r.json() as Promise<SheetSnapshot>)
      .then((snap) => {
        if (snap?.rows) {
          const a = computeLineActuals(snap.rows)
          setPriorActuals(new Map(a.map((x) => [x.lineId, x])))
        }
      })
      .catch(() => {})
    return () => ctrl.abort()
  }, [sheetData, availableWeeks])

  const actualsMap = useMemo(() => {
    if (!sheetData) return new Map<string, LineActual>()
    const actuals = computeLineActuals(sheetData.rows)
    return new Map(actuals.map((a) => [a.lineId, a]))
  }, [sheetData])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sortIndicator = (key: SortKey) =>
    sortKey === key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''

  function classifyHealth(line: Line): 'healthy' | 'marginal' | 'overpaying' {
    const d = line.delta
    if (d == null) return 'overpaying'
    if (d > 5) return 'healthy'
    if (d >= 0) return 'marginal'
    return 'overpaying'
  }

  function wowDelta(code: string): number | null {
    const cur = actualsMap.get(code)
    const prev = priorActuals.get(code)
    if (!cur || !prev || prev.payableAmount === 0) return null
    return ((cur.payableAmount - prev.payableAmount) / prev.payableAmount) * 100
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let result = lines.filter((l) => {
      if (q && !(
        l.code.toLowerCase().includes(q) ||
        l.route.toLowerCase().includes(q) ||
        l.partner.toLowerCase().includes(q)
      )) return false
      if (regionFilter !== 'all' && l.region !== regionFilter) return false
      if (healthFilter !== 'all' && classifyHealth(l) !== healthFilter) return false
      return true
    })

    result = [...result].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      const aActual = actualsMap.get(a.code)
      const bActual = actualsMap.get(b.code)

      let aVal: number | string = 0
      let bVal: number | string = 0

      switch (sortKey) {
        case 'code': aVal = a.code; bVal = b.code; break
        case 'route': aVal = a.route; bVal = b.route; break
        case 'partner': aVal = a.partner; bVal = b.partner; break
        case 'region': aVal = a.region; bVal = b.region; break
        case 'type': aVal = a.type; bVal = b.type; break
        case 'buses': aVal = a.buses; bVal = b.buses; break
        case 'owKm': aVal = a.owKm; bVal = b.owKm; break
        case 'rt': aVal = a.rt; bVal = b.rt; break
        case 'minG': aVal = a.minG; bVal = b.minG; break
        case 'pc5': aVal = a.pc5 ?? 0; bVal = b.pc5 ?? 0; break
        case 'delta': aVal = a.delta ?? 0; bVal = b.delta ?? 0; break
        case 'monthly': aVal = a.monthly; bVal = b.monthly; break
        case 'busKm': aVal = aActual?.busKm ?? 0; bVal = bActual?.busKm ?? 0; break
        case 'kmUtilisation': aVal = aActual?.kmUtilisation ?? 0; bVal = bActual?.kmUtilisation ?? 0; break
        case 'effectiveCpk': aVal = aActual?.effectiveCpk ?? 0; bVal = bActual?.effectiveCpk ?? 0; break
        case 'payableAmount': aVal = aActual?.payableAmount ?? 0; bVal = bActual?.payableAmount ?? 0; break
        case 'wowDelta': aVal = wowDelta(a.code) ?? 0; bVal = wowDelta(b.code) ?? 0; break
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal) * dir
      }
      return ((aVal as number) - (bVal as number)) * dir
    })

    return result
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, search, sortKey, sortDir, actualsMap, regionFilter, healthFilter, priorActuals])

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden border border-gray-100 dark:border-gray-800">
      <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-[#444444] dark:text-white">
          Lines {hasActuals && '+ Actuals'} {priorActuals.size > 0 && '· Δ vs prior week'}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value as 'all' | 'N' | 'S' | 'W')}
            className="rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1 text-xs"
          >
            <option value="all">All regions</option>
            <option value="N">N</option>
            <option value="S">S</option>
            <option value="W">W</option>
          </select>
          <select
            value={healthFilter}
            onChange={(e) => setHealthFilter(e.target.value as 'all' | 'healthy' | 'marginal' | 'overpaying')}
            className="rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-2 py-1 text-xs"
          >
            <option value="all">All health</option>
            <option value="healthy">Healthy</option>
            <option value="marginal">Marginal</option>
            <option value="overpaying">Overpaying</option>
          </select>
          <input
            type="text"
            placeholder="Search route, partner, code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white px-3 py-1 text-xs w-56 focus:border-[#73D700]"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-2 py-2 w-6"></th>
              <th className={headerClass(sortKey === 'code')} onClick={() => toggleSort('code')}>Code{sortIndicator('code')}</th>
              <th className={headerClass(sortKey === 'route')} onClick={() => toggleSort('route')}>Route{sortIndicator('route')}</th>
              <th className={headerClass(sortKey === 'partner')} onClick={() => toggleSort('partner')}>Partner{sortIndicator('partner')}</th>
              <th className={headerClass(sortKey === 'region')} onClick={() => toggleSort('region')}>Region{sortIndicator('region')}</th>
              <th className={headerClass(sortKey === 'type')} onClick={() => toggleSort('type')}>Type{sortIndicator('type')}</th>
              <th className={headerClass(sortKey === 'buses')} onClick={() => toggleSort('buses')}>Buses{sortIndicator('buses')}</th>
              <th className={headerClass(sortKey === 'owKm')} onClick={() => toggleSort('owKm')}>OW km{sortIndicator('owKm')}</th>
              <th className={headerClass(sortKey === 'rt')} onClick={() => toggleSort('rt')}>RT{sortIndicator('rt')}</th>
              <th className={headerClass(sortKey === 'minG')} onClick={() => toggleSort('minG')}>MinG{sortIndicator('minG')}</th>
              <th className={headerClass(sortKey === 'pc5')} onClick={() => toggleSort('pc5')}>PC{sortIndicator('pc5')}</th>
              <th className={headerClass(sortKey === 'delta')} onClick={() => toggleSort('delta')}>Delta%{sortIndicator('delta')}</th>
              <th className={headerClass(sortKey === 'monthly')} onClick={() => toggleSort('monthly')}>Monthly L{sortIndicator('monthly')}</th>
              {hasActuals && (
                <>
                  <th className={headerClass(sortKey === 'busKm')} onClick={() => toggleSort('busKm')}>Actual KM{sortIndicator('busKm')}</th>
                  <th className={headerClass(sortKey === 'kmUtilisation')} onClick={() => toggleSort('kmUtilisation')}>Util%{sortIndicator('kmUtilisation')}</th>
                  <th className={headerClass(sortKey === 'effectiveCpk')} onClick={() => toggleSort('effectiveCpk')}>Eff CPK{sortIndicator('effectiveCpk')}</th>
                  <th className={headerClass(sortKey === 'payableAmount')} onClick={() => toggleSort('payableAmount')}>Payable{sortIndicator('payableAmount')}</th>
                  {priorActuals.size > 0 && (
                    <th className={headerClass(sortKey === 'wowDelta')} onClick={() => toggleSort('wowDelta')}>Δ WoW{sortIndicator('wowDelta')}</th>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {filtered.map((line) => {
              const actual = actualsMap.get(line.code)
              const wow = wowDelta(line.code)
              const expanded = expandedCode === line.code
              return (
                <Fragment key={line.code}>
                  <tr
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer"
                    onClick={() => setExpandedCode(expanded ? null : line.code)}
                  >
                    <td className="px-2 py-1.5 text-gray-400 text-center">{expanded ? '▼' : '▶'}</td>
                    <td className="px-2 py-1.5 font-mono text-[#444444] dark:text-white">{line.code}</td>
                    <td className="px-2 py-1.5 max-w-[180px] truncate dark:text-gray-200">{line.route}</td>
                    <td className="px-2 py-1.5 dark:text-gray-200">{line.partner}</td>
                    <td className="px-2 py-1.5 text-center dark:text-gray-200">{line.region}</td>
                    <td className="px-2 py-1.5 dark:text-gray-200">{line.type}</td>
                    <td className="px-2 py-1.5 text-right dark:text-gray-200">{line.buses}</td>
                    <td className="px-2 py-1.5 text-right dark:text-gray-200">{fmtNum(line.owKm)}</td>
                    <td className="px-2 py-1.5 text-right dark:text-gray-200">{line.rt}</td>
                    <td className="px-2 py-1.5 text-right dark:text-gray-200">{fmtINR(line.minG, 0)}</td>
                    <td className="px-2 py-1.5 text-right dark:text-gray-200">{line.pc5 != null ? fmtINR(line.pc5, 0) : '--'}</td>
                    <td className={`px-2 py-1.5 text-right font-medium ${deltaColor(line.delta)}`}>
                      {line.delta != null ? fmtPct(line.delta) : '--'}
                    </td>
                    <td className="px-2 py-1.5 text-right dark:text-gray-200">{fmtLakhs(line.monthly)}</td>
                    {hasActuals && (
                      <>
                        <td className="px-2 py-1.5 text-right dark:text-gray-200">{actual ? fmtNum(actual.busKm) : '--'}</td>
                        <td className={`px-2 py-1.5 text-right font-medium ${
                          actual
                            ? actual.kmUtilisation >= 80 ? 'text-[#73D700]'
                              : actual.kmUtilisation >= 60 ? 'text-[#FFAD00]'
                              : 'text-[#FFAD00]'
                            : 'text-gray-400'
                        }`}>
                          {actual ? fmtPct(actual.kmUtilisation) : '--'}
                        </td>
                        <td className="px-2 py-1.5 text-right dark:text-gray-200">{actual ? fmtINR(actual.effectiveCpk, 2) : '--'}</td>
                        <td className="px-2 py-1.5 text-right dark:text-gray-200">{actual ? fmtINR(actual.payableAmount, 0) : '--'}</td>
                        {priorActuals.size > 0 && (
                          <td className={`px-2 py-1.5 text-right font-medium ${
                            wow == null ? 'text-gray-400' : wow >= 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'
                          }`}>
                            {wow == null ? '--' : (wow >= 0 ? '+' : '') + wow.toFixed(1) + '%'}
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={hasActuals ? (priorActuals.size > 0 ? 18 : 17) : 13} className="px-6 py-3 bg-gray-50 dark:bg-gray-800/30">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                          <div>
                            <div className="text-gray-500 uppercase">Code / Route</div>
                            <div className="font-medium dark:text-white">{line.code} — {line.route}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 uppercase">Diesel @ commission</div>
                            <div className="font-medium dark:text-white">
                              {line.dieselAtCommission ? fmtINR(line.dieselAtCommission, 2) : '—'}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500 uppercase">Start date</div>
                            <div className="font-medium dark:text-white">{line.startDate ?? '—'}</div>
                          </div>
                          <div>
                            <div className="text-gray-500 uppercase">GST slab</div>
                            <div className="font-medium dark:text-white">{line.gst}%</div>
                          </div>
                          {actual && (
                            <>
                              <div>
                                <div className="text-gray-500 uppercase">Bonus</div>
                                <div className="font-medium dark:text-white">{fmtINR(actual.bonus, 0)}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 uppercase">Penalty</div>
                                <div className="font-medium dark:text-white">{fmtINR(actual.penalty, 0)}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 uppercase">Cancellation</div>
                                <div className="font-medium dark:text-white">{fmtINR(actual.cancellation, 0)}</div>
                              </div>
                              <div>
                                <div className="text-gray-500 uppercase">Held GST</div>
                                <div className="font-medium dark:text-white">{fmtINR(actual.heldGst, 0)}</div>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="px-5 py-2 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-400">
        {filtered.length} of {lines.length} lines
      </div>
    </div>
  )
}
