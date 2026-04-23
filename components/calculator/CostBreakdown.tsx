'use client';

import React from 'react';
import { PCResult } from '@/lib/calculations';

interface Props {
  result: PCResult;
}

export default function CostBreakdown({ result }: Props) {
  if (result.totalCostPerKm === 0) {
    return (
      <div className="rounded-lg border border-gray-700 bg-[#444444] p-6 text-center text-gray-500">
        Enter route details to see cost breakdown
      </div>
    );
  }

  const maxPerKm = Math.max(...result.components.map((c) => c.perKm));
  const nonZeroComponents = result.components.filter((c) => c.perKm > 0);

  return (
    <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
      <h3 className="text-sm font-semibold text-[#73D700] uppercase tracking-wide mb-4">
        Cost Breakdown
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 text-gray-400 font-medium">
                Component
              </th>
              <th className="text-right py-2 text-gray-400 font-medium w-24">
                ₹/km
              </th>
              <th className="text-right py-2 text-gray-400 font-medium w-16">
                %
              </th>
              <th className="py-2 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {nonZeroComponents.map((comp) => {
              const barPct = maxPerKm > 0 ? (comp.perKm / maxPerKm) * 100 : 0;
              return (
                <tr
                  key={comp.name}
                  className="border-b border-gray-800 hover:bg-white/5"
                >
                  <td className="py-1.5 text-gray-300">{comp.name}</td>
                  <td className="py-1.5 text-right text-white tabular-nums">
                    {comp.perKm.toFixed(2)}
                  </td>
                  <td className="py-1.5 text-right text-gray-400 tabular-nums">
                    {comp.pctOfTotal.toFixed(1)}
                  </td>
                  <td className="py-1.5 pl-3">
                    <div className="h-3 rounded-full bg-gray-800 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#73D700]/60"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-700">
              <td className="py-2 font-bold text-white bg-[#73D700]/10 rounded-l pl-2">
                TOTAL
              </td>
              <td className="py-2 text-right font-bold text-white bg-[#73D700]/10">
                {result.totalCostPerKm.toFixed(2)}
              </td>
              <td className="py-2 text-right font-bold text-gray-400 bg-[#73D700]/10 rounded-r">
                100.0
              </td>
              <td className="bg-[#73D700]/10"></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
