'use client';

import React, { useMemo } from 'react';
import { PCInputs, PCResult, calculatePC } from '@/lib/calculations';

interface Props {
  inputs: PCInputs;
  baseResult: PCResult;
}

const TENURES = [36, 42, 48, 54, 60, 72];

export default function TenureComparison({ inputs, baseResult }: Props) {
  const tenureResults = useMemo(() => {
    return TENURES.map((months) => {
      const adjusted: PCInputs = {
        ...inputs,
        loanTermMonths: months,
      };
      const res = calculatePC(adjusted);

      return {
        months,
        emiPerKm: res.emiPerKm,
        monthlyEMI: res.monthlyEMI,
        totalCostPerKm: res.totalCostPerKm,
        recommendedMinG: res.recommendedMinG,
        totalMonthlyAllBuses: res.totalMonthlyAllBuses,
      };
    });
  }, [inputs]);

  if (baseResult.totalCostPerKm === 0) return null;

  const minMinG = Math.min(...tenureResults.map((r) => r.recommendedMinG));
  const maxMinG = Math.max(...tenureResults.map((r) => r.recommendedMinG));

  return (
    <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
      <h3 className="text-sm font-semibold text-[#73D700] uppercase tracking-wide mb-4">
        Contract Tenure Comparison
      </h3>

      {/* Bar chart */}
      <div className="flex items-end gap-3 h-36 mb-6 px-2">
        {tenureResults.map((t) => {
          const height =
            maxMinG > 0 ? ((t.recommendedMinG - minMinG * 0.95) / (maxMinG - minMinG * 0.95)) * 100 : 0;
          const isLowest = t.recommendedMinG === minMinG;

          return (
            <div
              key={t.months}
              className="flex-1 flex flex-col items-center justify-end h-full"
            >
              <div className="text-xs text-white font-medium mb-1">
                {t.recommendedMinG.toFixed(1)}
              </div>
              <div
                className={`w-full rounded-t transition-all ${
                  isLowest ? 'bg-[#73D700]' : 'bg-[#73D700]/40'
                }`}
                style={{ height: `${Math.max(height, 5)}%` }}
              />
              <div className="text-xs text-gray-400 mt-2">{t.months}mo</div>
            </div>
          );
        })}
      </div>

      {/* Details table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 text-gray-400 font-medium">
                Tenure
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                EMI/mo
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                EMI ₹/km
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                Cost ₹/km
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                MinG ₹/km
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                Monthly ₹L
              </th>
            </tr>
          </thead>
          <tbody>
            {tenureResults.map((t) => {
              const isLowest = t.recommendedMinG === minMinG;
              const isCurrent = t.months === inputs.loanTermMonths;

              return (
                <tr
                  key={t.months}
                  className={`border-b border-gray-800 ${
                    isLowest
                      ? 'bg-[#73D700]/10'
                      : isCurrent
                      ? 'bg-white/5'
                      : 'hover:bg-white/5'
                  }`}
                >
                  <td className="py-2 text-gray-300 font-medium">
                    {t.months} mo
                    {isLowest && (
                      <span className="ml-2 text-xs bg-[#73D700] text-[#444444] px-1.5 py-0.5 rounded font-semibold">
                        BEST
                      </span>
                    )}
                    {isCurrent && !isLowest && (
                      <span className="ml-2 text-xs bg-gray-600 text-white px-1.5 py-0.5 rounded font-semibold">
                        CURRENT
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right text-white tabular-nums">
                    {t.monthlyEMI.toLocaleString('en-IN')}
                  </td>
                  <td className="py-2 text-right text-white tabular-nums">
                    {t.emiPerKm.toFixed(2)}
                  </td>
                  <td className="py-2 text-right text-white tabular-nums">
                    {t.totalCostPerKm.toFixed(2)}
                  </td>
                  <td className="py-2 text-right text-white tabular-nums font-medium">
                    {t.recommendedMinG.toFixed(2)}
                  </td>
                  <td className="py-2 text-right text-white tabular-nums">
                    {t.totalMonthlyAllBuses.toFixed(1)}L
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
