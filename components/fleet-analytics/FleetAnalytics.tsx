'use client';

import { useStore } from '@/store/useStore';
import { BASE_LINES } from '@/lib/baseline';
import { computeLineActuals, computePayoutWaterfall } from '@/lib/metrics';
import { fmtINR, fmtPct, fmtLakhs, fmtNum } from '@/lib/formatters';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
} from 'recharts';
import { useMemo } from 'react';

const FLIX_GREEN = '#73D700';
const NAVY = '#444444';
const RED = '#FFAD00';
const AMBER = '#FFAD00';
const PIE_COLORS = ['#73D700', '#444444', '#FFAD00', '#FFAD00', '#444444', '#FFAD00', '#73D700'];

function ChartCard({
  title,
  annotation,
  children,
}: {
  title: string;
  annotation?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">{title}</h3>
      {annotation && (
        <p className="text-xs text-gray-500 mb-4">{annotation}</p>
      )}
      {children}
    </div>
  );
}

export default function FleetAnalytics() {
  const lines = useStore((s) => s.lines) ?? BASE_LINES;
  const sheetData = useStore((s) => s.sheetData);
  const activeRegion = useStore((s) => s.activeRegion);

  const filteredLines = useMemo(() => {
    if (!lines || lines.length === 0) return [];
    if (activeRegion === 'all') return lines;
    return lines.filter((l: any) => l.region === activeRegion);
  }, [lines, activeRegion]);

  // ---- Chart 1: Route Profitability Matrix ----
  const scatterData = useMemo(() => {
    return filteredLines
      .filter((l: any) => l.owKm != null && l.delta != null)
      .map((l: any) => ({
        x: l.owKm,
        y: l.delta,
        z: l.monthly ?? 1,
        name: l.lineName ?? l.lineId,
        color: l.delta > 5 ? FLIX_GREEN : l.delta >= 0 ? AMBER : RED,
      }));
  }, [filteredLines]);

  // ---- Chart 2: Partner Concentration ----
  const partnerPieData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredLines.forEach((l: any) => {
      const partner = l.partner ?? 'Unknown';
      map[partner] = (map[partner] ?? 0) + (l.monthly ?? 0);
    });
    const sorted = Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
    if (sorted.length <= 9) return sorted;
    const top8 = sorted.slice(0, 8);
    const othersValue = sorted.slice(8).reduce((sum, s) => sum + s.value, 0);
    return [...top8, { name: 'Others', value: othersValue }];
  }, [filteredLines]);

  // ---- Chart 3: Bus Type Mix & Performance ----
  const busTypeData = useMemo(() => {
    const types = ['Sleeper', 'Hybrid', 'Seater'];
    return types.map((type) => {
      const subset = filteredLines.filter((l: any) => l.busType === type);
      const count = subset.length;
      const avgMinG =
        count > 0
          ? subset.reduce((s: number, l: any) => s + (l.minG ?? 0), 0) / count
          : 0;
      const withPc5 = subset.filter((l: any) => l.pc5 != null);
      const avgPc5 =
        withPc5.length > 0
          ? withPc5.reduce((s: number, l: any) => s + l.pc5, 0) /
            withPc5.length
          : 0;
      return { type, avgMinG: +avgMinG.toFixed(2), avgPc5: +avgPc5.toFixed(2), count };
    });
  }, [filteredLines]);

  // ---- Chart 4: Regional Spend Comparison ----
  const regionalData = useMemo(() => {
    const regions = ['N', 'S', 'W'];
    const totals = regions.map((r) => {
      const sum = lines
        .filter((l: any) => l.region === r)
        .reduce((s: number, l: any) => s + (l.monthly ?? 0), 0);
      return { region: r === 'N' ? 'North' : r === 'S' ? 'South' : 'West', value: sum };
    });
    const grandTotal = totals.reduce((s, t) => s + t.value, 0);
    return totals.map((t) => ({
      ...t,
      pct: grandTotal > 0 ? ((t.value / grandTotal) * 100).toFixed(1) : '0',
    }));
  }, [lines]);

  // ---- Chart 5: Contract Value Distribution ----
  const histogramData = useMemo(() => {
    const buckets = [
      { label: '<50', min: -Infinity, max: 50 },
      { label: '50-52', min: 50, max: 52 },
      { label: '52-54', min: 52, max: 54 },
      { label: '54-56', min: 54, max: 56 },
      { label: '56-58', min: 56, max: 58 },
      { label: '58-60', min: 58, max: 60 },
      { label: '60-62', min: 60, max: 62 },
      { label: '62+', min: 62, max: Infinity },
    ];
    const counts = buckets.map((b) => ({
      label: b.label,
      count: filteredLines.filter(
        (l: any) => l.minG != null && l.minG >= b.min && l.minG < b.max
      ).length,
    }));
    const validMinGs = filteredLines
      .filter((l: any) => l.minG != null)
      .map((l: any) => l.minG)
      .sort((a: number, b: number) => a - b);
    const median =
      validMinGs.length > 0
        ? validMinGs[Math.floor(validMinGs.length / 2)]
        : null;
    return { counts, median };
  }, [filteredLines]);

  if (!filteredLines || filteredLines.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-gray-400 text-lg">
        No fleet data available. Upload a sheet or adjust filters.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div
        className="rounded-xl px-6 py-4"
        style={{ backgroundColor: NAVY }}
      >
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Fleet Analytics &mdash; BCG Dashboard
        </h2>
        <p className="text-sm text-gray-300 mt-1">
          {filteredLines.length} lines
          {activeRegion !== 'all' ? ` in region ${activeRegion}` : ' across all regions'}
        </p>
      </div>

      {/* 2-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1 — Route Profitability Matrix */}
        <ChartCard
          title="Route Profitability Matrix"
          annotation="Bubble size = monthly payout. Green = healthy (>5%), amber = marginal (0-5%), red = overpaying (<0%)"
        >
          <div className="relative">
            <ResponsiveContainer width="100%" height={360}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="One-way KM"
                  label={{ value: 'One-way KM', position: 'insideBottom', offset: -5 }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Health Margin %"
                  label={{ value: 'Delta %', angle: -90, position: 'insideLeft' }}
                />
                <ZAxis type="number" dataKey="z" range={[40, 400]} name="Monthly Payout" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  formatter={(value, name) => {
                    const v = Number(value ?? 0)
                    if (name === 'One-way KM') return [fmtNum(v), name];
                    if (name === 'Health Margin %') return [fmtPct(v), name];
                    if (name === 'Monthly Payout') return [fmtLakhs(v), name];
                    return [String(value), name];
                  }}
                />
                <ReferenceLine x={500} stroke={NAVY} strokeDasharray="4 4" />
                <ReferenceLine y={0} stroke={RED} strokeDasharray="4 4" />
                <Scatter data={scatterData}>
                  {scatterData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} fillOpacity={0.7} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
            {/* Quadrant labels */}
            <span className="absolute top-2 left-14 text-[10px] text-gray-400 font-medium">
              Short &amp; Healthy
            </span>
            <span className="absolute top-2 right-6 text-[10px] text-gray-400 font-medium">
              Long &amp; Healthy
            </span>
            <span className="absolute bottom-8 left-14 text-[10px] text-gray-400 font-medium">
              Short &amp; Overpaying
            </span>
            <span className="absolute bottom-8 right-6 text-[10px] text-gray-400 font-medium">
              Long &amp; Overpaying
            </span>
          </div>
        </ChartCard>

        {/* Chart 2 — Partner Concentration */}
        <ChartCard
          title="Partner Concentration"
          annotation="Top 8 partners by monthly payout. Donut shows spend share."
        >
          <ResponsiveContainer width="100%" height={360}>
            <PieChart>
              <Pie
                data={partnerPieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                label={({ name, value }) => `${name} ${fmtLakhs(value)}`}
              >
                {partnerPieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => fmtLakhs(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Chart 3 — Bus Type Mix & Performance */}
        <ChartCard
          title="Bus Type Mix & Performance"
          annotation="Average MinG and PC by bus type. Count of lines shown as label."
        >
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={busTypeData} margin={{ top: 20, right: 20, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="type" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgMinG" name="Avg MinG" fill={NAVY} label={{ position: 'top', fontSize: 10 }} />
              <Bar dataKey="avgPc5" name="Avg PC" fill={FLIX_GREEN} label={{ position: 'top', fontSize: 10 }} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-6 mt-2 text-xs text-gray-500 justify-center">
            {busTypeData.map((b) => (
              <span key={b.type}>
                {b.type}: {b.count} lines
              </span>
            ))}
          </div>
        </ChartCard>

        {/* Chart 4 — Regional Spend Comparison */}
        <ChartCard
          title="Regional Spend Comparison"
          annotation="Total monthly payout by region (all lines, unfiltered)."
        >
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={regionalData}
              layout="vertical"
              margin={{ top: 10, right: 60, bottom: 10, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tickFormatter={(v) => fmtLakhs(v)} />
              <YAxis type="category" dataKey="region" width={60} />
              <Tooltip formatter={(value) => fmtLakhs(Number(value))} />
              <Bar dataKey="value" name="Monthly Spend" fill={FLIX_GREEN}>
                {regionalData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={
                      i === 0 ? NAVY : i === 1 ? '#3B7A1A' : FLIX_GREEN
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-6 mt-2 text-xs text-gray-500 justify-center">
            {regionalData.map((r) => (
              <span key={r.region}>
                {r.region}: {r.pct}%
              </span>
            ))}
          </div>
        </ChartCard>

        {/* Chart 5 — Contract Value Distribution */}
        <ChartCard
          title="Contract Value Distribution"
          annotation="Histogram of MinG (minimum guarantee) values across lines."
        >
          <ResponsiveContainer width="100%" height={360}>
            <BarChart
              data={histogramData.counts}
              margin={{ top: 20, right: 20, bottom: 5, left: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" label={{ value: 'MinG Range (k)', position: 'insideBottom', offset: -5 }} />
              <YAxis label={{ value: 'Line Count', angle: -90, position: 'insideLeft' }} />
              <Tooltip />
              <Bar dataKey="count" name="Lines" fill={FLIX_GREEN}>
                {histogramData.counts.map((_, i) => (
                  <Cell key={i} fill={FLIX_GREEN} />
                ))}
              </Bar>
              {histogramData.median != null && (
                <ReferenceLine
                  x={
                    histogramData.counts.findIndex((b) => {
                      const ranges: Record<string, [number, number]> = {
                        '<50': [-Infinity, 50],
                        '50-52': [50, 52],
                        '52-54': [52, 54],
                        '54-56': [54, 56],
                        '56-58': [56, 58],
                        '58-60': [58, 60],
                        '60-62': [60, 62],
                        '62+': [62, Infinity],
                      };
                      const [lo, hi] = ranges[b.label] ?? [0, 0];
                      return (
                        histogramData.median! >= lo && histogramData.median! < hi
                      );
                    }) >= 0
                      ? histogramData.counts[
                          histogramData.counts.findIndex((b) => {
                            const ranges: Record<string, [number, number]> = {
                              '<50': [-Infinity, 50],
                              '50-52': [50, 52],
                              '52-54': [52, 54],
                              '54-56': [54, 56],
                              '56-58': [56, 58],
                              '58-60': [58, 60],
                              '60-62': [60, 62],
                              '62+': [62, Infinity],
                            };
                            const [lo, hi] = ranges[b.label] ?? [0, 0];
                            return (
                              histogramData.median! >= lo &&
                              histogramData.median! < hi
                            );
                          })
                        ].label
                      : undefined
                  }
                  stroke={RED}
                  strokeDasharray="4 4"
                  label={{
                    value: `Median: ${histogramData.median?.toFixed(1)}`,
                    position: 'top',
                    fill: RED,
                    fontSize: 11,
                  }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
