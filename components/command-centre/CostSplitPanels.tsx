'use client'

import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import type { Bl2Line } from '@/lib/cost-utils'
import { effectiveMinG, computeHealthVsPc5 } from '@/lib/cost-utils'

interface Props {
  lines: Bl2Line[]
}

/** km-weighted avg MinG with 13% impact for 18% GST partners */
function weightedMinGWithImpact(lines: Bl2Line[]): number {
  const totalKm = lines.reduce((s, l) => s + l.ow_km * l.rt * 2 * l.buses, 0)
  if (totalKm === 0) return 0
  return lines.reduce((s, l) => {
    return s + effectiveMinG(l.min_g, l.gst_slab) * l.ow_km * l.rt * 2 * l.buses
  }, 0) / totalKm
}

function getHealth(l: Bl2Line): string {
  return computeHealthVsPc5(l.min_g, l.gst_slab, l.pc5)
}

const fmtKm = (v: number) => `₹${v.toFixed(2)}/km`

export default function CostSplitPanels({ lines }: Props) {
  const fleetWtdMinG = useMemo(() => weightedMinGWithImpact(lines), [lines])

  // Region split
  const regionData = useMemo(() => {
    return (['N', 'S', 'W'] as const).map((r) => {
      const rLines = lines.filter((l) => l.region === r)
      const wtdMinG = weightedMinGWithImpact(rLines)
      return {
        region: r,
        label: r === 'N' ? 'North' : r === 'S' ? 'South' : 'West',
        lines: rLines.length,
        partners: new Set(rLines.map((l) => l.partner)).size,
        buses: rLines.reduce((s, l) => s + l.buses, 0),
        wtdMinG,
      }
    })
  }, [lines])

  // GST slab split
  const gstData = useMemo(() => {
    return [5, 18].map((slab) => {
      const sLines = lines.filter((l) => l.gst_slab === slab)
      const wtdMinG = weightedMinGWithImpact(sLines)
      return {
        slab,
        lines: sLines.length,
        partners: new Set(sLines.map((l) => l.partner)).size,
        buses: sLines.reduce((s, l) => s + l.buses, 0),
        wtdMinG,
      }
    })
  }, [lines])

  // Partner concentration
  const partnerData = useMemo(() => {
    const map: Record<string, { pLines: Bl2Line[] }> = {}
    lines.forEach((l) => {
      if (!map[l.partner]) map[l.partner] = { pLines: [] }
      map[l.partner].pLines.push(l)
    })
    return Object.entries(map)
      .map(([partner, d]) => {
        const wtdMinG = weightedMinGWithImpact(d.pLines)
        const buses = d.pLines.reduce((s, l) => s + l.buses, 0)
        const healthy = d.pLines.filter((l) => getHealth(l) === 'healthy').length
        const marginal = d.pLines.filter((l) => getHealth(l) === 'marginal').length
        const overpaying = d.pLines.filter((l) => getHealth(l) === 'overpaying').length
        return { partner, buses, lines: d.pLines.length, wtdMinG, healthy, marginal, overpaying }
      })
      .sort((a, b) => b.wtdMinG - a.wtdMinG)
  }, [lines])

  const totalBuses = lines.reduce((s, l) => s + l.buses, 0)
  const REGION_COLORS: Record<string, string> = { N: '#444444', S: '#73D700', W: '#FFAD00' }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Panel 1 — Region Cost Split */}
      <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-[#444444]/50 mb-3">Cost by region</p>
        <div className="space-y-2.5">
          {regionData.map((r) => (
            <div key={r.region} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: REGION_COLORS[r.region] }} />
                <span className="font-medium text-[#444444]">{r.label}</span>
                <span className="text-[#444444]/50">{r.lines} lines · {r.buses} buses</span>
              </div>
              <span className="font-semibold text-[#444444]">{fmtKm(r.wtdMinG)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-2 border-t border-[rgba(68,68,68,0.1)] text-[10px] text-[#444444]/50">
          Fleet avg: <span className="font-semibold text-[#444444]">{fmtKm(fleetWtdMinG)}</span> · {totalBuses} buses
        </div>
      </div>

      {/* Panel 2 — GST Slab Split */}
      <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-[#444444]/50 mb-3">GST slab breakdown</p>
        <div className="flex gap-4">
          <div className="flex-1 space-y-3">
            {gstData.map((g) => (
              <div key={g.slab} className="text-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-[#444444]">{g.slab}% GST</span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-medium"
                    style={{
                      background: g.slab === 5 ? 'rgba(115,215,0,0.15)' : 'rgba(255,173,0,0.15)',
                      color: g.slab === 5 ? '#73D700' : '#FFAD00',
                      border: `1px solid ${g.slab === 5 ? '#73D700' : '#FFAD00'}`,
                    }}
                  >
                    {g.slab === 5 ? 'ITC partial' : 'Full ITC'}
                  </span>
                </div>
                <div className="text-[#444444]/60">
                  {g.lines} lines · {g.buses} buses · <span className="font-semibold text-[#444444]">{fmtKm(g.wtdMinG)}</span>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-[#444444]/40 pt-1">
              18% lines: MinG × 1.13 impact included
            </p>
          </div>
          <div className="w-20 h-20 flex-shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={gstData.map((g) => ({ name: `${g.slab}%`, value: g.buses }))}
                  cx="50%" cy="50%" innerRadius={18} outerRadius={36}
                  dataKey="value" paddingAngle={2} strokeWidth={0}
                >
                  <Cell fill="#73D700" />
                  <Cell fill="#FFAD00" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Panel 3 — Partner Concentration */}
      <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl px-5 py-4">
        <p className="text-xs uppercase tracking-wider text-[#444444]/50 mb-1">Partner fleet</p>
        <p className="text-[10px] text-[#444444]/40 mb-3">
          {partnerData.length} partners · sorted by ₹/km
        </p>
        <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
          {partnerData.map((p, i) => {
            const total = p.healthy + p.marginal + p.overpaying
            const healthDot = p.overpaying > 0 ? '#FFAD00' : p.marginal > 0 ? 'rgba(255,173,0,0.5)' : '#73D700'
            return (
              <div key={p.partner} className="text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[#444444]/30 w-4 text-right flex-shrink-0">{i + 1}</span>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: healthDot }} />
                    <span className="font-medium text-[#444444] truncate">{p.partner}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <span className="text-[#444444]/50">{p.buses}b · {p.lines}L</span>
                    <span className="font-semibold text-[#444444] w-20 text-right">{fmtKm(p.wtdMinG)}</span>
                  </div>
                </div>
                {total > 0 && (
                  <div className="flex ml-8 mt-0.5 h-1 rounded-full overflow-hidden gap-px">
                    {p.healthy > 0 && <div style={{ flex: p.healthy, background: '#73D700' }} />}
                    {p.marginal > 0 && <div style={{ flex: p.marginal, background: 'rgba(255,173,0,0.45)' }} />}
                    {p.overpaying > 0 && <div style={{ flex: p.overpaying, background: '#FFAD00' }} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="mt-2 pt-2 border-t border-[rgba(68,68,68,0.1)] text-[10px] text-[#444444]/50">
          Fleet avg: <span className="font-semibold text-[#444444]">{fmtKm(fleetWtdMinG)}</span> · {totalBuses} buses
        </div>
      </div>
    </div>
  )
}
