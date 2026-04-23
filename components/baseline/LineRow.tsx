'use client';

import { Line } from '@/types';
import { formatNumber, formatCurrency, formatPercent, computeDelta } from '@/lib/formatters';

interface LineRowProps {
  line: Line;
  onEdit: (line: Line) => void;
  onDelete: (line: Line) => void;
}

function getDeltaColor(delta: number | null | undefined): string {
  if (delta == null) return 'bg-gray-100 text-gray-400';
  if (delta > 5) return 'bg-[#73D700]/15 text-[#73D700]';
  if (delta >= 0) return 'bg-amber-100 text-[#FFAD00]';
  return 'bg-[#FFAD00]/10 text-[#FFAD00]';
}

export default function LineRow({ line, onEdit, onDelete }: LineRowProps) {
  const delta = computeDelta(line);

  return (
    <tr className="group hover:bg-[#F5F5F5] transition-colors">
      <td className="px-3 py-2 text-xs font-mono whitespace-nowrap">{line.code}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">{line.route}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">{line.partner}</td>
      <td className="px-3 py-2 text-xs text-center">{line.region}</td>
      <td className="px-3 py-2 text-xs text-center">{line.buses}</td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">{line.type}</td>
      <td className="px-3 py-2 text-xs text-center">{line.gst}%</td>
      <td className="px-3 py-2 text-xs text-right">{formatNumber(line.owKm)}</td>
      <td className="px-3 py-2 text-xs text-right">{line.rt}</td>
      <td className="px-3 py-2 text-xs text-right">{formatNumber(line.minG, 2)}</td>
      <td className="px-3 py-2 text-xs text-right" style={{ color: line.gst === 18 ? '#FFAD00' : 'rgba(68,68,68,0.3)' }}>
        {line.gst === 18 ? formatNumber(+(line.minG * 1.13).toFixed(2), 2) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-right font-bold text-[#444444]">
        {line.pc5 != null ? formatNumber(line.pc5, 2) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-center">
        <span
          className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${getDeltaColor(delta)}`}
        >
          {delta != null ? `${delta.toFixed(1)}%` : '—'}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-right font-medium">
        ₹{formatNumber(line.monthly, 2)}L
      </td>
      <td className="px-3 py-2 text-xs whitespace-nowrap">
        {line.startDate ? new Date(line.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
      </td>
      <td className="px-3 py-2 text-xs text-right">
        {line.startDate ? `${((Date.now() - new Date(line.startDate).getTime()) / (365.25 * 86400000)).toFixed(1)} yrs` : '—'}
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(line)}
            className="p-1 text-gray-400 hover:text-[#444444] rounded transition-colors"
            title="Edit"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          </button>
          <button
            onClick={() => onDelete(line)}
            className="p-1 text-gray-400 hover:text-[#FFAD00] rounded transition-colors"
            title="Delete"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}
