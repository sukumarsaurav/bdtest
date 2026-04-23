'use client';

import { useState, useMemo, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { computeDelta, healthStatus, deltaColor, fmtMoney, fmtPerKm, INDIA_MING_TARGET } from '@/lib/formatters';
import { actualWtdEffectiveMinG, getLinePc, formatYearWeekRange, contractedWtdMinGFromBl2, type Bl2Line } from '@/lib/cost-utils';
import type { HubRow } from '@/types';
import AdvancedKpis from './AdvancedKpis';
import AnalyticsTargets from './AnalyticsTargets';
import RenegotiationModal from './RenegotiationModal';
import RenegotiationPipeline from './RenegotiationPipeline';
import CostSplitPanels from './CostSplitPanels';
import { useMultiWeekData } from '@/hooks/useMultiWeekData';

type Tab = 'Overview' | 'Renegotiation' | 'Data Flags' | 'Leadership';

type TargetSubTab = 'MinG' | 'Utilisation' | 'Savings';

interface Target {
  id: string;
  category: 'MinG' | 'Utilisation' | 'Savings';
  scope: string;
  current: number;
  target: number;
  unit: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CommandCentre() {
  const { lines, activeRegion } = useStore();
  const showEur = useStore((s) => s.showEur);
  const eurRate = useStore((s) => s.eurRate);
  const sheetData = useStore((s) => s.sheetData);
  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [targetsError, setTargetsError] = useState(false);
  const [targetSubTab, setTargetSubTab] = useState<TargetSubTab>('MinG');
  const [renegotiateLine, setRenegotiateLine] = useState<any | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied'>('idle');
  const [renegotiations, setRenegotiations] = useState<any[]>([]);
  const [availableWeeks, setAvailableWeeks] = useState<{ year_week: string; period: string; pushed_at: string; source: string }[]>([]);
  const [bl2Lines, setBl2Lines] = useState<Bl2Line[]>([]);

  // Auto-fetch sheet data on mount.
  // /api/sheet-data orders by pushed_at desc, which can return an old week
  // when a historical snapshot was backfilled. We prefer the temporally
  // latest year_week from the weeks list.
  useEffect(() => {
    const yearWeekKey = (yw: string): number => {
      const m = /^(\d{4})_W(\d+)$/.exec(yw);
      if (!m) return 0;
      return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
    };
    fetch('/api/sheet-data')
      .then((r) => r.json())
      .then((data) => {
        const weeks: { year_week: string; period: string; pushed_at: string; source: string }[] = Array.isArray(data?.weeks) ? data.weeks : [];
        setAvailableWeeks(weeks);
        const latestByYearWeek = weeks
          .map((w) => w.year_week)
          .filter(Boolean)
          .sort((a, b) => yearWeekKey(b) - yearWeekKey(a))[0];

        // If the latest temporal week differs from what was returned, refetch it
        if (latestByYearWeek && latestByYearWeek !== data?.year_week) {
          return fetch(`/api/sheet-data?week=${latestByYearWeek}`)
            .then((r) => r.json())
            .then((d) => d);
        }
        return data;
      })
      .then((d) => {
        if (d && !d.noData && d.rows) {
          useStore.getState().setSheetData({
            yearWeek: d.year_week,
            period: d.period,
            pushedAt: d.pushed_at,
            source: d.source,
            rows: d.rows,
          });
        }
      })
      .catch(() => {});
  }, []);

  // Fetch targets on mount
  useEffect(() => {
    fetch('/api/targets')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setTargets(data);
        } else if (data.targets && Array.isArray(data.targets) && data.targets.length > 0) {
          setTargets(data.targets);
        } else {
          setTargets([]);
        }
      })
      .catch(() => {
        setTargetsError(true);
        setTargets([]);
      })
  }, [])

  // Fetch renegotiation pipeline
  useEffect(() => {
    fetch('/api/renegotiations')
      .then((r) => r.json())
      .then((d) => setRenegotiations(Array.isArray(d) ? d : []))
      .catch(() => setRenegotiations([]))
  }, [])

  // Fetch bl2 baseline lines
  useEffect(() => {
    fetch('/api/bl-summary')
      .then((r) => r.json())
      .then((d) => setBl2Lines(d.lines || []))
      .catch(() => setBl2Lines([]))
  }, [])

  // Multi-week data for MTD/YTD
  const multiWeek = useMultiWeekData(
    availableWeeks,
    sheetData?.yearWeek ?? '',
    (sheetData?.rows as HubRow[]) ?? [],
  )

  const filtered = useMemo(() => {
    if (!lines) return [];
    if (activeRegion === 'all') return lines;
    return lines.filter((l: any) => l.region === activeRegion);
  }, [lines, activeRegion]);

  const totalLines = filtered.length;
  const totalBuses = useMemo(() => filtered.reduce((s: number, l: any) => s + (l.buses || 0), 0), [filtered]);
  const avgMinG = useMemo(() => {
    if (!filtered.length) return 0;
    const totalKm = filtered.reduce((s: number, l: any) => s + (l.owKm || 0) * (l.rt || 0) * 2 * (l.buses || 1), 0);
    if (totalKm === 0) return filtered.reduce((s: number, l: any) => s + (l.minG || 0), 0) / filtered.length;
    return filtered.reduce((s: number, l: any) => s + (l.minG || 0) * (l.owKm || 0) * (l.rt || 0) * 2 * (l.buses || 1), 0) / totalKm;
  }, [filtered]);

  const healthy = useMemo(() => filtered.filter((l: any) => healthStatus(computeDelta(l)) === 'healthy'), [filtered]);
  const marginal = useMemo(() => filtered.filter((l: any) => healthStatus(computeDelta(l)) === 'marginal'), [filtered]);
  const overpaying = useMemo(() => filtered.filter((l: any) => healthStatus(computeDelta(l)) === 'overpaying'), [filtered]);

  const totalMonthly = useMemo(() => filtered.reduce((s: number, l: any) => s + (l.monthly || 0), 0), [filtered]);

  // Baseline PC summary — fleet-wide MinG-vs-PC tracking, separate from
  // user-defined custom targets. PC comes from lib/baseline.ts via cost-utils.
  const baselinePcSummary = useMemo(() => {
    const linesWithPc = filtered
      .filter((l: any) => l.pc5 != null && l.pc5 > 0);
    if (!linesWithPc.length) return null;
    const totalKnown = linesWithPc.length;
    const avgPc = linesWithPc.reduce((s: number, l: any) => s + l.pc5, 0) / totalKnown;
    const totalKmKnown = linesWithPc.reduce((s: number, l: any) => s + (l.owKm || 0) * (l.rt || 0) * 2 * (l.buses || 1), 0);
    const avgMinGKnown = totalKmKnown > 0
      ? linesWithPc.reduce((s: number, l: any) => s + l.minG * (l.owKm || 0) * (l.rt || 0) * 2 * (l.buses || 1), 0) / totalKmKnown
      : linesWithPc.reduce((s: number, l: any) => s + l.minG, 0) / totalKnown;
    // Use effectiveMinG vs pc5 with unified thresholds
    const healthyCount = linesWithPc.filter((l: any) => {
      const eff = l.gst === 18 ? l.minG * 1.13 : l.minG;
      const d = ((eff - l.pc5) / l.pc5) * 100;
      return d < 0;
    }).length;
    const marginalCount = linesWithPc.filter((l: any) => {
      const eff = l.gst === 18 ? l.minG * 1.13 : l.minG;
      const d = ((eff - l.pc5) / l.pc5) * 100;
      return d >= 0 && d <= 1;
    }).length;
    const overpayingCount = totalKnown - healthyCount - marginalCount;
    return { totalKnown, avgPc, avgMinGKnown, overpayingCount, healthyCount, marginalCount };
  }, [filtered]);

  // Sheet-based actuals — units in ₹L (lakhs) for fmtMoney compatibility
  const contractedTotalL = totalMonthly; // already in ₹L

  // Gross payout this week (₹L) = MinG × km, the real operational cost.
  // basicValue is exactly that — pre-GST/TDS, no tax overlay.
  const actualGrossPayoutL = useMemo(() => {
    if (!sheetData?.rows) return 0;
    return sheetData.rows.reduce((s: number, r: any) => s + (r.basicValue || 0), 0) / 1e5;
  }, [sheetData]);

  // Actual ₹/km with GST impact = minG × 1.13 for 18% partners.
  const realCostPerKm = useMemo(() => {
    if (!sheetData?.rows) return 0;
    return actualWtdEffectiveMinG(sheetData.rows as HubRow[]);
  }, [sheetData]);

  // Contracted km-weighted MinG from bl2 baseline (₹54.85, not simple avg ₹55.15)
  const contractedMinGPKm = useMemo(() => {
    if (!bl2Lines.length) return avgMinG; // fallback to simple avg if bl2 not loaded
    return contractedWtdMinGFromBl2(bl2Lines);
  }, [bl2Lines, avgMinG]);


  const top10Overpaying = useMemo(
    () => [...overpaying].sort((a: any, b: any) => (computeDelta(a) ?? 0) - (computeDelta(b) ?? 0)).slice(0, 10),
    [overpaying],
  );

  const renegotiationLines = useMemo(
    () => [...filtered].filter((l: any) => computeDelta(l) != null && computeDelta(l)! < 0).sort((a: any, b: any) => (computeDelta(a) ?? 0) - (computeDelta(b) ?? 0)),
    [filtered],
  );

  const totalOverpayExposure = useMemo(
    () => renegotiationLines.reduce((s: number, l: any) => s + (l.monthly || 0), 0),
    [renegotiationLines],
  );

  const missingData = useMemo(
    () => filtered.filter((l: any) => l.pc5 == null || l.pc5 == null || l.delta == null),
    [filtered],
  );

  const anomalies = useMemo(
    () =>
      filtered.filter((l: any) => {
        if (l.monthly != null && (l.monthly > 5000000 || l.monthly < 0)) return true;
        if (l.minG != null && (l.minG > 200 || l.minG < 5)) return true;
        return false;
      }),
    [filtered],
  );

  function getPriority(delta: number): { label: string; color: string } {
    if (delta < -5) return { label: 'High', color: 'bg-[#FFAD00] text-[#444444]' };
    if (delta < -2) return { label: 'Medium', color: 'bg-amber-600 text-[#444444]' };
    return { label: 'Low', color: 'bg-gray-500 text-[#444444]' };
  }

  const healthTotal = healthy.length + marginal.length + overpaying.length;
  const healthyPct = healthTotal ? (healthy.length / healthTotal) * 100 : 0;
  const marginalPct = healthTotal ? (marginal.length / healthTotal) * 100 : 0;
  const overpayingPct = healthTotal ? (overpaying.length / healthTotal) * 100 : 0;

  const tabs: Tab[] = ['Overview', 'Renegotiation', 'Data Flags', 'Leadership'];

  return (
    <div className="min-h-screen bg-white text-[#444444]">
      {/* Header */}
      <header className="bg-[#444444] border-b border-[rgba(68,68,68,0.15)] px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-[#73D700] rounded-lg flex items-center justify-center font-bold text-white text-xl">
              F
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">
                Flix BD &middot; Command Centre
              </h1>
              <p className="text-sm text-white/60">
                {totalLines} line{totalLines !== 1 ? 's' : ''} loaded
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-sm text-white/60">Total Monthly Outlay</p>
              <p className="text-2xl font-bold text-[#73D700]">
                {fmtMoney(totalMonthly, showEur, eurRate)}
              </p>
              {/* Sync status badge */}
              {sheetData ? (
                <div className="flex items-center gap-1.5 justify-end mt-1">
                  <div className="w-2 h-2 rounded-full bg-[#73D700] animate-pulse" />
                  <span className="text-xs text-white/60">
                    Live — {sheetData.yearWeek} &middot; {formatYearWeekRange(sheetData.yearWeek)} &middot; synced {timeAgo(sheetData.pushedAt)} &middot; {sheetData.rows.length} lines
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 justify-end mt-1">
                  <div className="w-2 h-2 rounded-full bg-white/30" />
                  <span className="text-xs text-white/60">
                    Baseline only — no sheet data{' '}
                    <a href="/sync" className="text-[#73D700] underline hover:text-[#73D700]/80">sync</a>
                  </span>
                </div>
              )}
            </div>
            {/* Export buttons */}
            <div className="flex flex-col gap-1.5 no-print">
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                Export PDF
              </button>
              <button
                onClick={() => alert('Deck export coming soon')}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                Export Deck
              </button>
            </div>
          </div>
        </div>

        {/* Nav pills */}
        <div className="flex gap-2 mt-4">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-[#73D700] text-[#444444]'
                  : 'bg-white/10 text-white hover:bg-white/20'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {/* ── Overview ── */}
        {activeTab === 'Overview' && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* This Week Snapshot */}
              <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
                <p className="text-xs text-[#444444]/60 uppercase tracking-wide mb-1">This Week</p>
                {sheetData ? (
                  <>
                    <p className="text-lg font-bold text-[#444444]">
                      <span className="text-xs text-[#444444]/60 font-normal">Gross payout: </span>
                      {fmtMoney(actualGrossPayoutL, showEur, eurRate)}
                    </p>
                    <p className="text-sm text-[#444444] mt-1">
                      <span className="text-xs text-[#444444]/60 font-normal">km run: </span>
                      {(sheetData.rows as HubRow[]).reduce((s, r) => s + (r.busKm || 0), 0).toLocaleString('en-IN')} km
                    </p>
                    <p className="text-[10px] text-[#444444]/50 mt-1">
                      Baseline contracted: {fmtMoney(contractedTotalL, showEur, eurRate)}/mo
                    </p>
                  </>
                ) : (
                  <p className="text-lg font-bold text-[#444444]">
                    <span className="text-xs text-[#444444]/60 font-normal">Contracted: </span>
                    {fmtMoney(contractedTotalL, showEur, eurRate)}/mo
                  </p>
                )}
              </div>

              {/* Real cost/km — w/ GST impact on 18% lines */}
              <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
                <p className="text-xs text-[#444444]/60 uppercase tracking-wide mb-1">Real cost/km</p>
                <p className="text-lg font-bold text-[#444444]">
                  <span className="text-xs text-[#444444]/60 font-normal">Contracted (fleet avg): </span>
                  {fmtPerKm(contractedMinGPKm, showEur, eurRate)}
                </p>
                <p className="text-[10px] text-[#444444]/40">km-weighted, {bl2Lines.length || totalLines} lines</p>
                {sheetData && (
                  <>
                    <p className="text-lg font-bold text-[#444444] mt-1">
                      <span className="text-xs text-[#444444]/60 font-normal">Actual MinG/km (w/ GST impact): </span>
                      {fmtPerKm(realCostPerKm, showEur, eurRate)}
                    </p>
                    <p className={`text-xs font-semibold mt-1 ${realCostPerKm - contractedMinGPKm > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                      {realCostPerKm - contractedMinGPKm > 0 ? '+' : ''}
                      {(realCostPerKm - contractedMinGPKm).toFixed(2)}/km vs contracted
                    </p>
                  </>
                )}
                <p className="text-xs text-[#444444]/60 mt-1">
                  Target: {fmtPerKm(INDIA_MING_TARGET, showEur, eurRate)}
                  <span className={`ml-1 ${realCostPerKm <= INDIA_MING_TARGET ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
                    {realCostPerKm > 0 ? (realCostPerKm <= INDIA_MING_TARGET ? '\u2713 at/below target' : '\u2191 above target') : ''}
                  </span>
                </p>
              </div>

              <KPICard label="Total Lines" value={String(totalLines)} />
              <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
                <p className="text-xs text-[#444444]/60 uppercase tracking-wide mb-1">Fleet Health</p>
                <div className="flex gap-3 text-sm">
                  <span className="text-[#73D700] font-semibold">{healthy.length} healthy</span>
                  <span className="text-[#FFAD00] font-semibold">{marginal.length} marginal</span>
                  <span className="text-[#FFAD00] font-semibold">{overpaying.length} overpaying</span>
                </div>
              </div>
            </div>

            {/* Health distribution bar */}
            {healthTotal > 0 && (
              <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
                <p className="text-xs text-[#444444]/60 uppercase tracking-wide mb-2">Health Distribution</p>
                <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
                  {healthyPct > 0 && (
                    <div style={{ flex: healthyPct, background: '#73D700', minWidth: 4 }} title={`Healthy ${healthyPct.toFixed(1)}%`} />
                  )}
                  {marginalPct > 0 && (
                    <div style={{ flex: marginalPct, background: 'repeating-linear-gradient(45deg, rgba(255,173,0,0.3), rgba(255,173,0,0.3) 3px, rgba(255,173,0,0.08) 3px, rgba(255,173,0,0.08) 6px)', outline: '1.5px solid #FFAD00', minWidth: 4 }} title={`Marginal ${marginalPct.toFixed(1)}%`} />
                  )}
                  {overpayingPct > 0 && (
                    <div style={{ flex: overpayingPct, background: '#FFAD00', minWidth: 4 }} title={`Overpaying ${overpayingPct.toFixed(1)}%`} />
                  )}
                </div>
                <div className="flex justify-between text-xs mt-1">
                  <span style={{ color: '#73D700' }}>{healthyPct.toFixed(1)}% healthy</span>
                  <span style={{ color: '#FFAD00' }}>{marginalPct.toFixed(1)}% marginal</span>
                  <span style={{ color: '#FFAD00', fontWeight: 500 }}>{overpayingPct.toFixed(1)}% overpaying</span>
                </div>
              </div>
            )}

            {/* Cost Split Panels — Region / GST / Partner */}
            {bl2Lines.length > 0 && <CostSplitPanels lines={bl2Lines as any} />}

            {/* Targets Tracker */}
            <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
              <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">Targets Tracker</h2>

              {/* Additive: baseline-PC tracking — fleet MinG vs PC from lib/baseline */}
              {baselinePcSummary && (
                <div className="mb-4 pb-4 border-b border-[rgba(68,68,68,0.15)] space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-[#73D700] font-semibold">
                    Baseline PC tracker · {baselinePcSummary.totalKnown} lines with PC
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-[#444444]/60">Avg MinG</p>
                      <p className="text-base font-semibold text-[#444444]">
                        {fmtPerKm(baselinePcSummary.avgMinGKnown, showEur, eurRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#444444]/60">Avg PC (ex-GST)</p>
                      <p className="text-base font-semibold text-[#444444]">
                        {fmtPerKm(baselinePcSummary.avgPc, showEur, eurRate)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#444444]/60">Δ MinG − PC</p>
                      <p className={`text-base font-semibold ${baselinePcSummary.avgMinGKnown - baselinePcSummary.avgPc > 0 ? 'text-[#FFAD00]' : 'text-[#73D700]'}`}>
                        {baselinePcSummary.avgMinGKnown - baselinePcSummary.avgPc > 0 ? '+' : ''}
                        {(baselinePcSummary.avgMinGKnown - baselinePcSummary.avgPc).toFixed(2)}/km
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#444444]/60">Leadership target</p>
                      <p className="text-base font-semibold text-[#444444]">
                        {fmtPerKm(INDIA_MING_TARGET, showEur, eurRate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs pt-1">
                    <span className="text-[#73D700] font-semibold">{baselinePcSummary.healthyCount} healthy</span>
                    <span className="text-[#FFAD00] font-semibold">{baselinePcSummary.marginalCount} marginal</span>
                    <span className="text-[#FFAD00] font-semibold">{baselinePcSummary.overpayingCount} overpaying</span>
                  </div>
                </div>
              )}

              {targetsError || (targets !== null && targets.length === 0) ? (
                <p className="text-[#444444]/50 text-sm">
                  No targets set. Add targets in Analytics &rarr; Targets tab.
                </p>
              ) : targets === null ? (
                <p className="text-[#444444]/50 text-sm">Loading targets...</p>
              ) : (
                <>
                  {/* Sub-tabs */}
                  <div className="flex gap-2 mb-3">
                    {(['MinG', 'Utilisation', 'Savings'] as TargetSubTab[]).map((st) => (
                      <button
                        key={st}
                        onClick={() => setTargetSubTab(st)}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                          targetSubTab === st
                            ? 'bg-[#73D700] text-[#444444]'
                            : 'bg-gray-100 text-[#444444] hover:bg-gray-200'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  {/* Summary */}
                  {(() => {
                    const catTargets = targets.filter((t) => t.category === targetSubTab);
                    const onTrack = catTargets.filter((t) => t.target !== 0 && (t.current / t.target) * 100 >= 90);
                    return (
                      <>
                        <p className="text-xs text-[#444444]/60 mb-2">
                          {onTrack.length} of {catTargets.length} targets on track
                        </p>
                        {catTargets.length === 0 ? (
                          <p className="text-[#444444]/50 text-sm">No {targetSubTab} targets.</p>
                        ) : (
                          <div className="space-y-2">
                            {catTargets.map((t) => {
                              const pct = t.target !== 0 ? (t.current / t.target) * 100 : 0;
                              const clampedPct = Math.min(100, Math.max(0, pct));
                              const ragColor = pct >= 90 ? '#73D700' : pct >= 60 ? '#FFAD00' : '#FFAD00';
                              const delta = t.target - t.current;
                              return (
                                <div key={t.id} className="flex items-center gap-3 text-xs">
                                  <span className="text-[#444444]/80 w-32 truncate">{t.scope}</span>
                                  <span className="text-[#444444]/60 w-36 truncate">
                                    {t.current.toFixed(1)} &rarr; {t.target.toFixed(1)} {t.unit}
                                  </span>
                                  <div className="flex-1 bg-gray-200 rounded-full h-2 min-w-[80px]">
                                    <div
                                      className="h-2 rounded-full transition-all"
                                      style={{ width: `${clampedPct}%`, backgroundColor: ragColor }}
                                    />
                                  </div>
                                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ragColor }} />
                                  <span className="text-[#444444]/60 w-20 text-right">
                                    {delta > 0 ? `${delta.toFixed(1)} to go` : 'Met'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}
            </div>

            {/* Analytics Targets — auto-seeded 125 line targets from bl2 */}
            {bl2Lines.length > 0 && <AnalyticsTargets blLines={bl2Lines} />}

            {/* Advanced KPIs (additive, board-level) — GST banner, real cost, WoW, projection, Top-5 actions */}
            {sheetData && (
              <AdvancedKpis
                rows={sheetData.rows as HubRow[]}
                yearWeek={sheetData.yearWeek}
                year={(sheetData.rows[0] as HubRow | undefined)?.year ?? 0}
                monthNo={(sheetData.rows[0] as HubRow | undefined)?.monthNo ?? 0}
                contractedMonthlyL={contractedTotalL}
                mtdRows={multiWeek.mtdRows}
                ytdRows={multiWeek.ytdRows}
                mtdWeekCount={multiWeek.mtdWeekCount}
                ytdWeekCount={multiWeek.ytdWeekCount}
                multiWeekLoading={multiWeek.loading}
                bl2Lines={bl2Lines}
              />
            )}

            {/* Top 10 Overpaying Lines */}
            <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4 overflow-x-auto">
              <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">Top 10 Overpaying Lines</h2>
              {top10Overpaying.length === 0 ? (
                <p className="text-[#444444]/50 text-sm">No overpaying lines found.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#444444]/60 border-b border-[rgba(68,68,68,0.15)]">
                      <th className="pb-2 pr-3">Code</th>
                      <th className="pb-2 pr-3">Route</th>
                      <th className="pb-2 pr-3">Partner</th>
                      <th className="pb-2 pr-3 text-right">MinG</th>
                      <th className="pb-2 pr-3 text-right text-[#FFAD00]">MinG + Impact</th>
                      <th className="pb-2 pr-3 text-right">PC</th>
                      <th className="pb-2 pr-3 text-right">Delta%</th>
                      <th className="pb-2 text-right">Monthly ₹L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top10Overpaying.map((l: any, i: number) => (
                      <tr key={l.code || i} className="border-b border-[rgba(68,68,68,0.15)]/50 hover:bg-gray-100">
                        <td className="py-2 pr-3 font-mono text-xs">{l.code}</td>
                        <td className="py-2 pr-3 max-w-[200px] truncate">{l.route}</td>
                        <td className="py-2 pr-3">{l.partner}</td>
                        <td className="py-2 pr-3 text-right">{fmtPerKm(l.minG ?? 0, showEur, eurRate)}</td>
                        <td className="py-2 pr-3 text-right" style={{ color: l.gst === 18 ? '#FFAD00' : 'rgba(68,68,68,0.3)' }}>
                          {l.gst === 18 ? fmtPerKm(+(l.minG * 1.13).toFixed(2), showEur, eurRate) : '—'}
                        </td>
                        <td className="py-2 pr-3 text-right">{l.pc5 != null ? fmtPerKm(l.pc5, showEur, eurRate) : '—'}</td>
                        <td className="py-2 pr-3 text-right text-[#FFAD00] font-semibold">
                          {computeDelta(l)?.toFixed(1) ?? '—'}%
                        </td>
                        <td className="py-2 text-right">{fmtMoney(l.monthly ?? 0, showEur, eurRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Regional Breakdown */}
            <RegionalBreakdown lines={filtered} />

            {/* Cost Mix Donut */}
            <CostMixDonut lines={filtered} />

            {/* GST Slab Panel */}
            <GSTSlabPanel lines={filtered} />

            {/* Savings Waterfall */}
            <SavingsWaterfall lines={filtered} />
          </div>
        )}

        {/* ── Renegotiation ── */}
        {activeTab === 'Renegotiation' && (
          <RenegotiationPipeline
            bl2Lines={bl2Lines}
            onBl2Refresh={() => {
              fetch('/api/bl-summary').then(r => r.json()).then(d => setBl2Lines(d.lines || [])).catch(() => {})
            }}
          />
        )}

        {/* ── Data Flags ── */}
        {activeTab === 'Data Flags' && (
          <div className="space-y-6">
            {/* Missing Production Cost Data */}
            <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4 overflow-x-auto">
              <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">
                Missing Production Cost Data ({missingData.length})
              </h2>
              {missingData.length === 0 ? (
                <p className="text-[#444444]/50 text-sm">All lines have production cost data.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#444444]/60 border-b border-[rgba(68,68,68,0.15)]">
                      <th className="pb-2 pr-3">Code</th>
                      <th className="pb-2 pr-3">Route</th>
                      <th className="pb-2 pr-3">Partner</th>
                      <th className="pb-2">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missingData.map((l: any, i: number) => {
                      const issues: string[] = [];
                      if (l.pc5 == null) issues.push('PC missing');
                      if (l.pc5 == null) issues.push('PC missing');
                      if (l.delta == null) issues.push('delta missing');
                      return (
                        <tr key={l.code || i} className="border-b border-[rgba(68,68,68,0.15)]/50 hover:bg-gray-100">
                          <td className="py-2 pr-3 font-mono text-xs">{l.code}</td>
                          <td className="py-2 pr-3 max-w-[200px] truncate">{l.route}</td>
                          <td className="py-2 pr-3">{l.partner}</td>
                          <td className="py-2 text-[#FFAD00]">{issues.join(', ')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Anomalies */}
            <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4 overflow-x-auto">
              <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">
                Anomalies ({anomalies.length})
              </h2>
              {anomalies.length === 0 ? (
                <p className="text-[#444444]/50 text-sm">No anomalies detected.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#444444]/60 border-b border-[rgba(68,68,68,0.15)]">
                      <th className="pb-2 pr-3">Code</th>
                      <th className="pb-2 pr-3">Route</th>
                      <th className="pb-2 pr-3">Partner</th>
                      <th className="pb-2">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((l: any, i: number) => {
                      const issues: string[] = [];
                      if (l.monthly != null && l.monthly > 5000000) issues.push(`Monthly value unusually high: ${fmtMoney(l.monthly, showEur, eurRate)}`);
                      if (l.monthly != null && l.monthly < 0) issues.push(`Negative monthly value: ${fmtMoney(l.monthly, showEur, eurRate)}`);
                      if (l.minG != null && l.minG > 200) issues.push(`MinG unusually high: ${fmtPerKm(l.minG, showEur, eurRate)}`);
                      if (l.minG != null && l.minG < 5) issues.push(`MinG unusually low: ${fmtPerKm(l.minG, showEur, eurRate)}`);
                      return (
                        <tr key={l.code || i} className="border-b border-[rgba(68,68,68,0.15)]/50 hover:bg-gray-100">
                          <td className="py-2 pr-3 font-mono text-xs">{l.code}</td>
                          <td className="py-2 pr-3 max-w-[200px] truncate">{l.route}</td>
                          <td className="py-2 pr-3">{l.partner}</td>
                          <td className="py-2 text-[#FFAD00]">{issues.join('; ')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ── Leadership View ── */}
        {activeTab === 'Leadership' && (
          <LeadershipView lines={filtered} healthy={healthy} marginal={marginal} overpaying={overpaying} totalMonthly={totalMonthly} avgMinG={avgMinG} />
        )}
      </main>

      {/* Renegotiation modal (5-stage stepper) */}
      {renegotiateLine && (() => {
        const line = renegotiateLine;
        const benchmarkPc = line.pc5;
        const targetMinG = benchmarkPc != null ? benchmarkPc * 1.02 : line.minG;
        const monthlyKm = line.minG > 0 && line.monthly > 0 ? (line.monthly * 1e5) / line.minG : 0;
        const monthlySavingsL = ((line.minG - targetMinG) * monthlyKm) / 1e5;
        const existingRenego = renegotiations.find((r: any) => r.line_id === line.code);

        return (
          <RenegotiationModal
            line={{
              lineId: line.code,
              lineName: line.route,
              partner: line.partner,
              region: line.region,
              currentMinG: line.minG,
              suggestedTarget: targetMinG,
              monthlySavingsL,
            }}
            existingRenego={existingRenego}
            onClose={() => setRenegotiateLine(null)}
            onSaved={() => {
              // Refresh renegotiations list
              fetch('/api/renegotiations')
                .then((r) => r.json())
                .then((d) => setRenegotiations(Array.isArray(d) ? d : []))
                .catch(() => {});
            }}
          />
        );
      })()}

      {/* Print CSS */}
      <style jsx global>{`
        @media print {
          nav, header .flex.items-center.gap-6, button, .no-print { display: none !important; }
          .bg-\\[\\#444444\\] { background: white !important; color: black !important; }
          .bg-\\[\\#444444\\] { background: #f3f4f6 !important; border: 1px solid #e5e7eb !important; }
          .text-[#444444] { color: black !important; }
          .text-[#444444]/60, .text-[#444444]/80 { color: #6b7280 !important; }
          .text-\\[\\#73D700\\] { color: #059669 !important; }
          .text-\\[\\#FFAD00\\] { color: #FFAD00 !important; }
        }
      `}</style>
    </div>
  );
}

function KPICard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
      <p className="text-xs text-[#444444]/60 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold text-[#444444]">{value}</p>
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const PIE_COLORS = ['#73D700', '#444444', '#FFAD00', '#73D700', '#FFAD00', '#FFAD00', '#444444']

function RegionalBreakdown({ lines }: { lines: any[] }) {
  const showEur = useStore((s) => s.showEur);
  const eurRate = useStore((s) => s.eurRate);
  const regions = (['N', 'S', 'W'] as const).map((r) => {
    const rLines = lines.filter((l) => l.region === r)
    const total = rLines.reduce((s: number, l: any) => s + (l.monthly || 0), 0)
    return { region: r, label: r === 'N' ? 'North' : r === 'S' ? 'South' : 'West', lines: rLines.length, buses: rLines.reduce((s: number, l: any) => s + (l.buses || 0), 0), monthly: total }
  })
  const grandTotal = regions.reduce((s, r) => s + r.monthly, 0)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {regions.map((r) => {
        const pct = grandTotal > 0 ? (r.monthly / grandTotal) * 100 : 0
        return (
          <div key={r.region} className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-sm font-semibold text-[#444444]">{r.label}</p>
                <p className="text-xs text-[#444444]/60">{r.lines} lines &middot; {r.buses} buses</p>
              </div>
              <p className="text-lg font-bold text-[#73D700]">{fmtMoney(r.monthly, showEur, eurRate)}</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-[#73D700] h-2 rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-[#444444]/60 mt-1">{pct.toFixed(1)}% of total spend</p>
          </div>
        )
      })}
    </div>
  )
}

function CostMixDonut({ lines }: { lines: any[] }) {
  const showEur = useStore((s) => s.showEur);
  const eurRate = useStore((s) => s.eurRate);
  const slices = [
    { name: 'Fuel', pct: 35 },
    { name: 'Driver & Crew', pct: 22 },
    { name: 'Maintenance', pct: 12 },
    { name: 'Tolls', pct: 10 },
    { name: 'Insurance', pct: 8 },
    { name: 'Depreciation', pct: 7 },
    { name: 'Other', pct: 6 },
  ]
  const totalMonthly = lines.reduce((s: number, l: any) => s + (l.monthly || 0), 0)
  const data = slices.map((s) => ({ ...s, value: +(totalMonthly * s.pct / 100).toFixed(1) }))

  return (
    <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">Cost Mix (Estimated)</h2>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width={220} height={220}>
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={95} dataKey="value" paddingAngle={2}>
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => fmtMoney(Number(v), showEur, eurRate)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-1.5">
          {data.map((s, i) => (
            <div key={s.name} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
              <span className="text-[#444444]/80 flex-1">{s.name}</span>
              <span className="text-[#444444]/60">{s.pct}%</span>
              <span className="text-[#444444] font-medium">{fmtMoney(s.value, showEur, eurRate)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GSTSlabPanel({ lines }: { lines: any[] }) {
  const showEur = useStore((s) => s.showEur);
  const eurRate = useStore((s) => s.eurRate);
  const gst5 = lines.filter((l) => l.gst === 5)
  const gst18 = lines.filter((l) => l.gst === 18)
  const mixed = [
    { label: '5% GST', lines: gst5, color: '#73D700' },
    { label: '18% GST', lines: gst18, color: '#444444' },
    { label: 'Total', lines, color: '#444444' },
  ]

  return (
    <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">GST Slab Distribution</h2>
      <div className="grid grid-cols-3 gap-4">
        {mixed.map((g) => {
          const total = g.lines.reduce((s: number, l: any) => s + (l.monthly || 0), 0)
          const gKm = g.lines.reduce((s: number, l: any) => s + (l.owKm || 0) * (l.rt || 0) * 2 * (l.buses || 1), 0)
          const avgMinG = gKm > 0 ? g.lines.reduce((s: number, l: any) => s + (l.minG || 0) * (l.owKm || 0) * (l.rt || 0) * 2 * (l.buses || 1), 0) / gKm : 0
          return (
            <div key={g.label} className="bg-gray-50 border border-[rgba(68,68,68,0.15)] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                <p className="text-sm font-medium text-[#444444]">{g.label}</p>
              </div>
              <p className="text-xl font-bold text-[#444444]">{g.lines.length} <span className="text-xs text-[#444444]/60 font-normal">lines</span></p>
              <p className="text-xs text-[#444444]/60 mt-1">{fmtMoney(total, showEur, eurRate)} monthly</p>
              <p className="text-xs text-[#444444]/60">Avg MinG: {fmtPerKm(avgMinG, showEur, eurRate)}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SavingsWaterfall({ lines }: { lines: any[] }) {
  const showEur = useStore((s) => s.showEur);
  const eurRate = useStore((s) => s.eurRate);
  const overpayingLines = lines.filter((l: any) => { const d = computeDelta(l); return d != null && d < 0; })
  const currentOverpay = overpayingLines.reduce((s: number, l: any) => s + (l.monthly || 0), 0)
  const targetPayout = overpayingLines.reduce((s: number, l: any) => {
    const targetMinG = (l.pc5 || l.minG) * 1.02
    const monthlyKm = l.owKm * 2 * l.rt * l.buses
    return s + (targetMinG * monthlyKm / 100000)
  }, 0)
  const potentialSavings = currentOverpay - targetPayout
  const healthySpend = lines.filter((l: any) => { const d = computeDelta(l); return d != null && d >= 0; }).reduce((s: number, l: any) => s + (l.monthly || 0), 0)
  const totalSpend = lines.reduce((s: number, l: any) => s + (l.monthly || 0), 0)

  const data = [
    { name: 'Total Spend', value: totalSpend, fill: '#444444' },
    { name: 'Healthy Lines', value: healthySpend, fill: '#73D700' },
    { name: 'Overpaying Lines', value: currentOverpay, fill: '#FFAD00' },
    { name: 'Potential Savings', value: potentialSavings > 0 ? potentialSavings : 0, fill: '#FFAD00' },
  ]

  return (
    <div className="bg-white border border-[rgba(68,68,68,0.15)] rounded-xl p-4">
      <h2 className="text-sm font-semibold text-[#444444]/80 mb-3">Savings Opportunity</h2>
      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={data} margin={{ left: 10, right: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#444444" />
          <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
          <YAxis tickFormatter={(v) => fmtMoney(v, showEur, eurRate)} tick={{ fill: '#9CA3AF', fontSize: 11 }} />
          <Tooltip formatter={(v) => fmtMoney(Number(v), showEur, eurRate)} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {potentialSavings > 0 && (
        <p className="text-xs text-[#73D700] mt-2">
          Renegotiating {overpayingLines.length} overpaying lines to PC+2% margin could save ~{fmtMoney(potentialSavings, showEur, eurRate)}/month
        </p>
      )}
    </div>
  )
}

const HEALTH_COLORS = { healthy: '#73D700', marginal: '#FFAD00', overpaying: '#FFAD00' };

function LeadershipView({ lines, healthy, marginal, overpaying, totalMonthly, avgMinG }: {
  lines: any[]; healthy: any[]; marginal: any[]; overpaying: any[]; totalMonthly: number; avgMinG: number;
}) {
  const showEur = useStore((s) => s.showEur);
  const eurRate = useStore((s) => s.eurRate);
  // Savings opportunity: sum of monthly exposure for overpaying lines
  const savingsOpportunity = useMemo(() => {
    return overpaying.reduce((s: number, l: any) => {
      const correctPC = l.pc5;
      if (correctPC == null || l.minG == null) return s;
      const monthlyKm = (l.owKm || 0) * 2 * (l.rt || 0) * (l.buses || 0);
      const exposure = (l.minG - correctPC) * monthlyKm / 100000;
      return s + (exposure > 0 ? exposure : 0);
    }, 0);
  }, [overpaying]);

  // Fleet health by region
  const regionHealthData = useMemo(() => {
    return (['N', 'S', 'W'] as const).map((r) => {
      const rLines = lines.filter((l: any) => l.region === r);
      return {
        region: r === 'N' ? 'North' : r === 'S' ? 'South' : 'West',
        healthy: rLines.filter((l: any) => healthStatus(computeDelta(l)) === 'healthy').length,
        marginal: rLines.filter((l: any) => healthStatus(computeDelta(l)) === 'marginal').length,
        overpaying: rLines.filter((l: any) => healthStatus(computeDelta(l)) === 'overpaying').length,
      };
    });
  }, [lines]);

  // Cost mix data
  const costMixData = useMemo(() => {
    const total = lines.reduce((s: number, l: any) => s + (l.monthly || 0), 0);
    return [
      { name: 'Fuel', value: +(total * 0.35).toFixed(1) },
      { name: 'Driver & Crew', value: +(total * 0.22).toFixed(1) },
      { name: 'Maintenance', value: +(total * 0.12).toFixed(1) },
      { name: 'Tolls', value: +(total * 0.10).toFixed(1) },
      { name: 'Insurance', value: +(total * 0.08).toFixed(1) },
      { name: 'Depreciation', value: +(total * 0.07).toFixed(1) },
      { name: 'Other', value: +(total * 0.06).toFixed(1) },
    ];
  }, [lines]);

  // Partner renegotiation priority (top 8)
  const partnerPriority = useMemo(() => {
    const partnerMap: Record<string, { partner: string; lines: any[] }> = {};
    overpaying.forEach((l: any) => {
      const key = l.partner || 'Unknown';
      if (!partnerMap[key]) partnerMap[key] = { partner: key, lines: [] };
      partnerMap[key].lines.push(l);
    });
    return Object.values(partnerMap)
      .map((p) => {
        const totalM = p.lines.reduce((s: number, l: any) => s + (l.monthly || 0), 0);
        const pKm = p.lines.reduce((s: number, l: any) => s + (l.owKm || 0) * (l.rt || 0) * 2 * (l.buses || 1), 0);
        const avgMG = pKm > 0 ? p.lines.reduce((s: number, l: any) => s + (l.minG || 0) * (l.owKm || 0) * (l.rt || 0) * 2 * (l.buses || 1), 0) / pKm : 0;
        const avgPC = p.lines.reduce((s: number, l: any) => {
          const pc = l.pc5;
          return s + (pc || 0);
        }, 0) / p.lines.length;
        const avgDelta = p.lines.reduce((s: number, l: any) => s + (computeDelta(l) ?? 0), 0) / p.lines.length;
        return { partner: p.partner, lineCount: p.lines.length, avgMinG: avgMG, avgPC, avgDelta, monthly: totalM };
      })
      .sort((a, b) => b.monthly - a.monthly)
      .slice(0, 8);
  }, [overpaying]);

  // Top 10 savings opportunity lines
  const top10SavingsLines = useMemo(() => {
    return overpaying
      .map((l: any) => {
        const correctPC = l.pc5;
        if (correctPC == null || l.minG == null) return { ...l, exposure: 0 };
        const monthlyKm = (l.owKm || 0) * 2 * (l.rt || 0) * (l.buses || 0);
        const exposure = (l.minG - correctPC) * monthlyKm / 100000;
        return { ...l, exposure: exposure > 0 ? exposure : 0 };
      })
      .sort((a: any, b: any) => b.exposure - a.exposure)
      .slice(0, 10);
  }, [overpaying]);

  return (
    <div className="space-y-6 bg-white rounded-2xl p-6 text-gray-900 print:shadow-none">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Leadership Brief</h2>
          <p className="text-sm text-[#444444]/50">{lines.length} lines | Generated {new Date().toLocaleDateString('en-IN')}</p>
        </div>
        <button onClick={() => window.print()} className="px-4 py-2 bg-[#73D700] text-[#444444] rounded-lg font-semibold text-sm no-print">
          Export PDF
        </button>
      </div>

      {/* Row 1 - KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs text-[#444444]/50 uppercase tracking-wide mb-1">Monthly Outlay</p>
          <p className="text-xl font-bold text-gray-900">{fmtMoney(totalMonthly, showEur, eurRate)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs text-[#444444]/50 uppercase tracking-wide mb-1">Avg MinG</p>
          <p className="text-xl font-bold text-gray-900">{fmtPerKm(avgMinG, showEur, eurRate)}</p>
          <p className="text-xs text-[#444444]/60 mt-1">
            Target: {fmtPerKm(INDIA_MING_TARGET, showEur, eurRate)}
            <span className={`ml-1 ${avgMinG <= INDIA_MING_TARGET ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
              {avgMinG <= INDIA_MING_TARGET ? '\u2713 below target' : '\u2191 above target'}
            </span>
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs text-[#444444]/50 uppercase tracking-wide mb-1">Target MinG</p>
          <p className="text-xl font-bold text-gray-900">{fmtPerKm(INDIA_MING_TARGET, showEur, eurRate)}</p>
          <p className="text-xs text-[#444444]/60 mt-1">
            Current: {fmtPerKm(avgMinG, showEur, eurRate)}
            <span className={`ml-1 ${avgMinG <= INDIA_MING_TARGET ? 'text-[#73D700]' : 'text-[#FFAD00]'}`}>
              {avgMinG <= INDIA_MING_TARGET
                ? `\u2713 ${((1 - avgMinG / INDIA_MING_TARGET) * 100).toFixed(1)}% below`
                : `\u2191 ${((avgMinG / INDIA_MING_TARGET - 1) * 100).toFixed(1)}% above`}
            </span>
          </p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs text-[#444444]/50 uppercase tracking-wide mb-1">Savings Opportunity</p>
          <p className="text-xl font-bold text-[#FFAD00]">{fmtMoney(savingsOpportunity, showEur, eurRate)}/mo</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs text-[#444444]/50 uppercase tracking-wide mb-1">Healthy Lines</p>
          <p className="text-xl font-bold text-green-600">{healthy.length}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <p className="text-xs text-[#444444]/50 uppercase tracking-wide mb-1">Overpaying Lines</p>
          <p className="text-xl font-bold text-[#FFAD00]">{overpaying.length}</p>
        </div>
      </div>

      {/* Row 2 - Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Fleet Health by Region */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Fleet Health by Region</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={regionHealthData} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="region" tick={{ fill: '#6B7280', fontSize: 12 }} />
              <YAxis tick={{ fill: '#6B7280', fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="healthy" stackId="a" fill={HEALTH_COLORS.healthy} name="Healthy" />
              <Bar dataKey="marginal" stackId="a" fill={HEALTH_COLORS.marginal} name="Marginal" />
              <Bar dataKey="overpaying" stackId="a" fill={HEALTH_COLORS.overpaying} name="Overpaying" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cost Mix Donut */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Cost Mix (Estimated)</h3>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={costMixData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={2}>
                  {costMixData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtMoney(Number(v), showEur, eurRate)} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1">
              {costMixData.map((s, i) => (
                <div key={s.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600 flex-1">{s.name}</span>
                  <span className="text-gray-900 font-medium">{fmtMoney(s.value, showEur, eurRate)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Row 3 - Partner Renegotiation Priority */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Partner Renegotiation Priority (Top 8)</h3>
        {partnerPriority.length === 0 ? (
          <p className="text-[#444444]/60 text-sm">No overpaying partners found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[#444444]/50 border-b border-gray-300">
                <th className="pb-2 pr-3">Rank</th>
                <th className="pb-2 pr-3">Partner</th>
                <th className="pb-2 pr-3 text-right">Lines</th>
                <th className="pb-2 pr-3 text-right">Avg MinG</th>
                <th className="pb-2 pr-3 text-right">Avg PC</th>
                <th className="pb-2 pr-3 text-right">Delta%</th>
                <th className="pb-2 text-right">Monthly ₹L</th>
              </tr>
            </thead>
            <tbody>
              {partnerPriority.map((p, i) => (
                <tr key={p.partner} className="border-b border-gray-200 hover:bg-gray-100">
                  <td className="py-2 pr-3 font-semibold text-gray-700">{i + 1}</td>
                  <td className="py-2 pr-3 text-gray-900">{p.partner}</td>
                  <td className="py-2 pr-3 text-right">{p.lineCount}</td>
                  <td className="py-2 pr-3 text-right">{fmtPerKm(p.avgMinG, showEur, eurRate)}</td>
                  <td className="py-2 pr-3 text-right">{fmtPerKm(p.avgPC, showEur, eurRate)}</td>
                  <td className="py-2 pr-3 text-right text-[#FFAD00] font-semibold">{p.avgDelta.toFixed(1)}%</td>
                  <td className="py-2 text-right font-semibold">{fmtMoney(p.monthly, showEur, eurRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Row 4 - Top 10 Savings Opportunity Lines */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Top 10 Savings Opportunity Lines</h3>
        {top10SavingsLines.length === 0 ? (
          <p className="text-[#444444]/60 text-sm">No savings opportunities identified.</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(250, top10SavingsLines.length * 35)}>
            <BarChart data={top10SavingsLines} layout="vertical" margin={{ left: 80, right: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis type="number" tickFormatter={(v) => fmtMoney(v, showEur, eurRate)} tick={{ fill: '#6B7280', fontSize: 11 }} />
              <YAxis type="category" dataKey="code" tick={{ fill: '#6B7280', fontSize: 11 }} width={75} />
              <Tooltip formatter={(v) => `${fmtMoney(Number(v), showEur, eurRate)}/mo`} />
              <Bar dataKey="exposure" fill="#FFAD00" radius={[0, 4, 4, 0]} name="Monthly Exposure">
                <LabelList dataKey="exposure" position="right" formatter={(v) => fmtMoney(Number(v), showEur, eurRate)} style={{ fill: '#6B7280', fontSize: 11 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
