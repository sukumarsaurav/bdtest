'use client';

import React, { useMemo } from 'react';
import { PCInputs, PCResult, calculatePC } from '@/lib/calculations';

interface Props {
  inputs: PCInputs;
  baseResult: PCResult;
}

interface SensitivityScenario {
  label: string;
  compute: (inputs: PCInputs) => PCInputs;
}

const SCENARIOS: SensitivityScenario[] = [
  {
    label: 'Diesel +₹5',
    compute: (inp) => ({ ...inp, dieselPrice: inp.dieselPrice + 5 }),
  },
  {
    label: 'Interest +2%',
    compute: (inp) => ({ ...inp, interestRate: inp.interestRate + 2 }),
  },
  {
    label: 'State Tax waived',
    compute: (inp) => ({ ...inp, selectedStates: [] }),
  },
  {
    label: 'AITP waived',
    compute: (inp) => ({ ...inp, aitpApplicable: false }),
  },
];

export default function SensitivityTable({ inputs, baseResult }: Props) {
  const rows = useMemo(() => {
    return SCENARIOS.map((scenario) => {
      const adjusted = scenario.compute(inputs);
      const scenarioResult = calculatePC(adjusted);
      const delta = scenarioResult.recommendedMinG - baseResult.recommendedMinG;

      return {
        label: scenario.label,
        newMinG: scenarioResult.recommendedMinG,
        delta,
      };
    });
  }, [inputs, baseResult]);

  if (baseResult.totalCostPerKm === 0) return null;

  return (
    <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
      <h3 className="text-sm font-semibold text-[#73D700] uppercase tracking-wide mb-4">
        Sensitivity Analysis
      </h3>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-700">
              <th className="text-left py-2 text-gray-400 font-medium">
                Scenario
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                Base MinG
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                New MinG
              </th>
              <th className="text-right py-2 text-gray-400 font-medium">
                Delta ₹/km
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className="border-b border-gray-800 hover:bg-white/5"
              >
                <td className="py-2 text-gray-300">{row.label}</td>
                <td className="py-2 text-right text-white tabular-nums">
                  {baseResult.recommendedMinG.toFixed(2)}
                </td>
                <td className="py-2 text-right text-white tabular-nums">
                  {row.newMinG.toFixed(2)}
                </td>
                <td
                  className={`py-2 text-right tabular-nums font-medium ${
                    row.delta > 0
                      ? 'text-[#FFAD00]'
                      : row.delta < 0
                      ? 'text-[#73D700]'
                      : 'text-gray-400'
                  }`}
                >
                  {row.delta > 0 ? '+' : ''}
                  {row.delta.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
