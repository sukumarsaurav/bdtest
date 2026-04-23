'use client';

import React, { useMemo } from 'react';
import { BASE_LINES } from '@/lib/baseline';

interface Props {
  owKm: number;
  busType: string;
  region: string; // 'S' | 'N' | 'W'
  gstSlab: 5 | 18;
}

export default function ComparableRoutes({ owKm, busType, region, gstSlab }: Props) {
  const comparables = useMemo(() => {
    if (!BASE_LINES || owKm === 0) return [];

    // Sort by distance proximity, boost same region/busType/gstSlab
    return [...BASE_LINES]
      .map((line: any) => {
        const distDelta = Math.abs(line.owKm - owKm);
        let score = distDelta;
        // Boost: lower score = better match
        if (line.region === region) score -= 50;
        if (line.type === busType) score -= 30;
        if (line.gst === gstSlab) score -= 20;
        return { ...line, _score: score, _distDelta: distDelta };
      })
      .sort((a: any, b: any) => a._score - b._score)
      .slice(0, 15);
  }, [owKm, busType, region, gstSlab]);

  const medianMinG = useMemo(() => {
    if (comparables.length === 0) return 0;
    const sorted = [...comparables]
      .map((c: any) => c.minG ?? 0)
      .filter((v: number) => v > 0)
      .sort((a: number, b: number) => a - b);
    if (sorted.length === 0) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  }, [comparables]);

  if (comparables.length === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
        <h3 className="text-sm font-semibold text-[#73D700] uppercase tracking-wide mb-3">
          Comparable Routes
        </h3>
        <p className="text-sm text-gray-500 text-center py-4">
          No comparable routes found
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
      <h3 className="text-sm font-semibold text-[#73D700] uppercase tracking-wide mb-1">
        Comparable Routes
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Top {comparables.length} matches by proximity &amp; config | Median MinG:{' '}
        <span className="text-[#73D700] font-medium">
          {medianMinG.toFixed(2)}/km
        </span>
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 text-gray-400 font-medium">
                Code
              </th>
              <th className="text-left py-2 text-gray-400 font-medium">
                Route
              </th>
              <th className="text-center py-2 text-gray-400 font-medium">
                Type
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                OW km
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                MinG
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                PC
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                Delta%
              </th>
            </tr>
          </thead>
          <tbody>
            {comparables.map((line: any, idx: number) => {
              const lineMinG = line.minG ?? 0;
              const linePc5 = line.pc5 ?? 0;
              const delta = line.delta ?? 0;
              const sameRegion = line.region === region;
              const sameType = line.type === busType;

              return (
                <tr
                  key={line.code ?? idx}
                  className={`border-b border-gray-800 hover:bg-white/5 ${
                    sameRegion && sameType ? 'bg-[#73D700]/5' : ''
                  }`}
                >
                  <td className="py-1.5 text-gray-400 font-mono text-xs">
                    {line.code ?? '-'}
                  </td>
                  <td className="py-1.5 text-gray-300 max-w-[180px] truncate">
                    {line.route ?? '-'}
                  </td>
                  <td className="py-1.5 text-center">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        sameType
                          ? 'bg-[#73D700]/20 text-[#73D700]'
                          : 'bg-gray-800 text-gray-500'
                      }`}
                    >
                      {line.type}
                    </span>
                  </td>
                  <td className="py-1.5 text-right text-white tabular-nums">
                    {line.owKm}
                  </td>
                  <td className="py-1.5 text-right text-white tabular-nums">
                    {lineMinG.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right text-white tabular-nums">
                    {linePc5 !== null ? linePc5.toFixed(2) : '-'}
                  </td>
                  <td
                    className={`py-1.5 text-right tabular-nums font-medium ${
                      delta > 0
                        ? 'text-[#73D700]'
                        : delta < 0
                        ? 'text-[#FFAD00]'
                        : 'text-gray-400'
                    }`}
                  >
                    {delta !== null ? `${delta > 0 ? '+' : ''}${delta.toFixed(1)}%` : '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
