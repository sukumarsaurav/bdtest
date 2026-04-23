'use client'

import { useMemo, useState } from 'react'
import type { HubRow } from '@/types'
import {
  computeDeltaDecomposition,
  decomposePayout,
  type Bl2Line,
  type DeltaDecomp,
  type PayoutDecomp,
  type LineDecompDetail,
} from '@/lib/cost-utils'

interface Props {
  rows: HubRow[]
  blLines: Bl2Line[]
  period: string
}

const fmtPKm = (v: number) => `${v >= 0 ? '+' : ''}₹${v.toFixed(2)}/km`

function EffectCard({
  title,
  icon,
  value,
  description,
  biggest,
  expanded,
  onToggle,
  children,
}: {
  title: string
  icon: string
  value: number
  description: string
  biggest?: boolean
  expanded: boolean
  onToggle: () => void
  children?: React.ReactNode
}) {
  return (
    <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-100 transition-colors"
      >
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#444444]">
            {title}
            {biggest && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-[#FFAD00]/15 text-[#444444] border border-[#FFAD00]">
                biggest driver
              </span>
            )}
          </p>
          <p className="text-[10px] text-[#444444]/60 truncate">{description}</p>
        </div>
        <span
          className={`text-base font-bold ${value > 0 ? 'text-[#FFAD00]' : value < 0 ? 'text-[#73D700]' : 'text-[#444444]/60'}`}
        >
          {fmtPKm(value)}
        </span>
        <span className="text-[#444444]/50 text-xs">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && children && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}

function RateDrilldown({ details }: { details: LineDecompDetail[] }) {
  const sorted = useMemo(
    () => [...details].filter((d) => d.rateChangeType !== 'UNCHANGED').sort((a, b) => b.rateChange - a.rateChange),
    [details],
  )
  if (!sorted.length) return <p className="text-xs text-[#444444]/50 italic">All lines at contracted rate.</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[#444444]/60 border-b border-[rgba(68,68,68,0.15)]">
            <th className="pb-1 pr-2 text-left">Line</th>
            <th className="pb-1 pr-2 text-left">Partner</th>
            <th className="pb-1 pr-2 text-right">BL MinG</th>
            <th className="pb-1 pr-2 text-right">Actual</th>
            <th className="pb-1 pr-2 text-right">Δ</th>
            <th className="pb-1 text-center">Type</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 20).map((d) => (
            <tr key={d.lineId} className="border-b border-[rgba(68,68,68,0.15)]/40">
              <td className="py-1 pr-2 font-mono">{d.lineId}</td>
              <td className="py-1 pr-2 max-w-[120px] truncate">{d.partner}</td>
              <td className="py-1 pr-2 text-right">₹{d.contractedMinG.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right">₹{d.actualMinG.toFixed(2)}</td>
              <td className={`py-1 pr-2 text-right font-semibold ${d.rateChange > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                {d.rateChange > 0 ? '+' : ''}{d.rateChange.toFixed(2)}
              </td>
              <td className="py-1 text-center">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                  d.rateChangeType === 'INCREASE' ? 'bg-[#FFAD00]/30 text-[#FFAD00]' : 'bg-green-600/30 text-green-200'
                }`}>
                  {d.rateChangeType === 'INCREASE' ? '↑ INCREASE' : '↓ RENEGOTIATED'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length > 20 && (
        <p className="text-[10px] text-[#444444]/50 mt-1">Showing top 20 of {sorted.length} lines with rate changes.</p>
      )}
    </div>
  )
}

function VolumeDrilldown({ details }: { details: LineDecompDetail[] }) {
  const sorted = useMemo(
    () => [...details].sort((a, b) => Math.abs(b.volumeChange) - Math.abs(a.volumeChange)),
    [details],
  )

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[#444444]/60 border-b border-[rgba(68,68,68,0.15)]">
            <th className="pb-1 pr-2 text-left">Line</th>
            <th className="pb-1 pr-2 text-right">Contracted km/wk</th>
            <th className="pb-1 pr-2 text-right">Actual km</th>
            <th className="pb-1 pr-2 text-right">Δ km</th>
            <th className="pb-1 pr-2 text-right">Δ%</th>
            <th className="pb-1 text-right">MinG</th>
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, 20).map((d) => {
            const pct = d.contractedKm > 0 ? ((d.actualKm - d.contractedKm) / d.contractedKm) * 100 : 0
            return (
              <tr key={d.lineId} className="border-b border-[rgba(68,68,68,0.15)]/40">
                <td className="py-1 pr-2 font-mono">{d.lineId}</td>
                <td className="py-1 pr-2 text-right">{d.contractedKm.toLocaleString()}</td>
                <td className="py-1 pr-2 text-right">{Math.round(d.actualKm).toLocaleString()}</td>
                <td className={`py-1 pr-2 text-right font-semibold ${d.volumeChange > 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
                  {d.volumeChange > 0 ? '+' : ''}{d.volumeChange.toLocaleString()}
                </td>
                <td className={`py-1 pr-2 text-right ${pct > 0 ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
                  {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
                </td>
                <td className="py-1 text-right">₹{d.actualMinG.toFixed(2)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function DeltaDecomposition({ rows, blLines, period }: Props) {
  const [expandedEffect, setExpandedEffect] = useState<string | null>(null)

  const decomp = useMemo<DeltaDecomp | null>(() => {
    if (!rows.length || !blLines.length) return null
    return computeDeltaDecomposition(rows, blLines)
  }, [rows, blLines])

  const payoutDecomp = useMemo<PayoutDecomp | null>(() => {
    if (!rows.length || !blLines.length) return null
    return decomposePayout(rows, blLines)
  }, [rows, blLines])

  if (!decomp) return null

  const toggle = (key: string) => setExpandedEffect((prev) => (prev === key ? null : key))

  const effects = [
    { key: 'mix', value: decomp.mixEffect },
    { key: 'rate', value: decomp.rateEffect },
  ]
  const biggestKey = effects.reduce((a, b) => (Math.abs(b.value) > Math.abs(a.value) ? b : a)).key

  const missingAvgMinG =
    decomp.missingLines.length > 0
      ? decomp.missingLines.reduce((s, l) => s + l.min_g, 0) / decomp.missingLines.length
      : 0

  const fmtL = (v: number) => `${v >= 0 ? '+' : ''}₹${Math.abs(v).toFixed(1)}L`

  return (
    <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-5">
      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: ₹/km variance */}
        <div>
          <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">
            ₹/km variance · {period}
          </h2>
          <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-2 text-center border border-[rgba(68,68,68,0.15)]">
              <p className="text-[9px] uppercase tracking-wide text-[#444444]/60">Contracted</p>
              <p className="text-base font-bold text-[#444444]">₹{decomp.contractedWtdMinG.toFixed(2)}</p>
              <p className="text-[9px] text-[#444444]/50">{decomp.linesContracted} lines</p>
            </div>
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-2 text-center border border-[rgba(68,68,68,0.15)]">
              <p className="text-[9px] uppercase tracking-wide text-[#444444]/60">Actual</p>
              <p className="text-base font-bold text-[#444444]">₹{decomp.actualWtdMinG.toFixed(2)}</p>
              <p className="text-[9px] text-[#444444]/50">{decomp.linesRan} lines ran</p>
            </div>
            <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-2 text-center border border-[rgba(68,68,68,0.15)]">
              <p className="text-[9px] uppercase tracking-wide text-[#444444]/60">Delta</p>
              <p className={`text-base font-bold ${decomp.totalDelta > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                {fmtPKm(decomp.totalDelta)}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <EffectCard
              title="Mix effect"
              icon="🔀"
              value={decomp.mixEffect}
              description={`${decomp.linesRan} of ${decomp.linesContracted} lines ran`}
              biggest={biggestKey === 'mix'}
              expanded={expandedEffect === 'mix'}
              onToggle={() => toggle('mix')}
            >
              <p className="text-xs text-[#444444]/60">
                {decomp.missingLines.length > 0 && (
                  <>{decomp.missingLines.length} lines did not run (avg MinG ₹{missingAvgMinG.toFixed(2)}).</>
                )}
              </p>
            </EffectCard>

            <EffectCard
              title="Rate effect"
              icon="📋"
              value={decomp.rateEffect}
              description="Actual MinG vs baseline MinG per line"
              biggest={biggestKey === 'rate'}
              expanded={expandedEffect === 'rate'}
              onToggle={() => toggle('rate')}
            >
              <RateDrilldown details={decomp.lineDetails} />
            </EffectCard>
          </div>
        </div>

        {/* RIGHT: ₹L payout variance */}
        {payoutDecomp && (
          <div>
            <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">
              ₹L payout variance · {period}
            </h2>
            <div className="grid grid-cols-3 gap-2 mb-3 text-sm">
              <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-2 text-center border border-[rgba(68,68,68,0.15)]">
                <p className="text-[9px] uppercase tracking-wide text-[#444444]/60">Contracted</p>
                <p className="text-base font-bold text-[#444444]">₹{payoutDecomp.contractedPayoutL.toFixed(1)}L</p>
              </div>
              <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-2 text-center border border-[rgba(68,68,68,0.15)]">
                <p className="text-[9px] uppercase tracking-wide text-[#444444]/60">Actual</p>
                <p className="text-base font-bold text-[#444444]">₹{payoutDecomp.actualPayoutL.toFixed(1)}L</p>
              </div>
              <div className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-2 text-center border border-[rgba(68,68,68,0.15)]">
                <p className="text-[9px] uppercase tracking-wide text-[#444444]/60">Delta</p>
                <p className={`text-base font-bold ${payoutDecomp.totalPayoutDeltaL > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                  {fmtL(payoutDecomp.totalPayoutDeltaL)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <EffectCard
                title="Volume effect"
                icon="📦"
                value={payoutDecomp.volumeEffectL}
                description="Lines ran more/less km than contracted"
                biggest={Math.abs(payoutDecomp.volumeEffectL) >= Math.abs(payoutDecomp.rateEffectL)}
                expanded={expandedEffect === 'payout_volume'}
                onToggle={() => toggle('payout_volume')}
              >
                <p className="text-xs text-[#444444]/60">
                  Computed as (actual km − contracted km) × contracted MinG per matched line.
                </p>
              </EffectCard>

              <EffectCard
                title="Missing lines"
                icon="🚫"
                value={payoutDecomp.missingLinesEffectL}
                description={`${decomp.missingLines.length} lines had 0 km this week`}
                expanded={expandedEffect === 'payout_missing'}
                onToggle={() => toggle('payout_missing')}
              >
                <p className="text-xs text-[#444444]/60">
                  {decomp.missingLines.length > 0
                    ? `If all ${decomp.missingLines.length} lines had run at contracted volume, payout would be ₹${Math.abs(payoutDecomp.missingLinesEffectL).toFixed(1)}L higher.`
                    : 'All contracted lines ran this week.'}
                </p>
              </EffectCard>

              <EffectCard
                title="Rate effect"
                icon="📋"
                value={payoutDecomp.rateEffectL}
                description="MinG rate differences × actual km"
                expanded={expandedEffect === 'payout_rate'}
                onToggle={() => toggle('payout_rate')}
              >
                <p className="text-xs text-[#444444]/60">
                  Same rate changes as left panel, but expressed in total ₹L impact.
                </p>
              </EffectCard>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
