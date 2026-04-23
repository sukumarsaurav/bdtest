'use client';

import { useState, useMemo } from 'react';
import { useStore } from '@/store/useStore';
import { Line, AppState } from '@/types';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/formatters';
import LineRow from './LineRow';
import AddLineModal from './AddLineModal';
import EditLineModal from './EditLineModal';
import ImportCSVModal from './ImportCSVModal';
import BPDropdown from './BPDropdown';

type SortKey = keyof Line | null;
type SortDir = 'asc' | 'desc';

const REGIONS = ['all', 'N', 'S', 'W'] as const;
const TYPES = ['all', 'Sleeper', 'Hybrid', 'Seater'] as const;

export default function BaselineTable() {
  const {
    lines,
    blSearch,
    setBlSearch,
    activeRegion,
    setActiveRegion,
    blTypeFilter,
    setBlTypeFilter,
    blSelectedBPs,
    setBlSelectedBPs,
    deleteLine,
  } = useStore();

  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [addOpen, setAddOpen] = useState(false);
  const [editLine, setEditLine] = useState<Line | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const filteredLines = useMemo(() => {
    let result = [...lines];

    // Search filter
    if (blSearch) {
      const q = blSearch.toLowerCase();
      result = result.filter(
        (l) =>
          l.route.toLowerCase().includes(q) ||
          l.partner.toLowerCase().includes(q) ||
          l.code.toLowerCase().includes(q)
      );
    }

    // Region filter
    if (activeRegion && activeRegion !== 'all') {
      result = result.filter((l) => l.region === activeRegion);
    }

    // Type filter
    if (blTypeFilter && blTypeFilter !== 'all') {
      result = result.filter((l) => l.type === blTypeFilter);
    }

    // BP filter
    if (blSelectedBPs && blSelectedBPs.length > 0) {
      result = result.filter((l) => blSelectedBPs.includes(l.partner));
    }

    // Sort
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return 1;
        if (bVal == null) return -1;
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          return sortDir === 'asc'
            ? aVal.localeCompare(bVal)
            : bVal.localeCompare(aVal);
        }
        return sortDir === 'asc'
          ? (aVal as number) - (bVal as number)
          : (bVal as number) - (aVal as number);
      });
    }

    return result;
  }, [lines, blSearch, activeRegion, blTypeFilter, blSelectedBPs, sortKey, sortDir]);

  const totalBuses = filteredLines.reduce((sum, l) => sum + (l.buses || 0), 0);
  const totalMonthly = filteredLines.reduce((sum, l) => sum + (l.monthly || 0), 0);

  const handleEdit = (line: Line) => {
    setEditLine(line);
    setEditOpen(true);
  };

  const handleDelete = (line: Line) => {
    if (confirm(`Delete line ${line.code}?`)) {
      deleteLine(line.code);
    }
  };

  const handleExportCSV = () => {
    const headers = [
      'Code', 'Route', 'Partner', 'Region', 'Buses', 'Type', 'GST',
      'OW km', 'RT', 'MinG', 'MinG+Impact', 'PC', 'Delta%', 'Monthly', 'Start Date', 'Age',
    ];
    const rows = filteredLines.map((l) =>
      [l.code, l.route, l.partner, l.region, l.buses, l.type, l.gst,
       l.owKm, l.rt, l.minG, l.pc5, l.delta, l.monthly].join(',')
    );
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'baseline_export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: { key: keyof Line; label: string }[] = [
    { key: 'code', label: 'Code' },
    { key: 'route', label: 'Route' },
    { key: 'partner', label: 'Partner' },
    { key: 'region', label: 'Region' },
    { key: 'buses', label: 'Buses' },
    { key: 'type', label: 'Type' },
    { key: 'gst', label: 'GST' },
    { key: 'owKm', label: 'OW km' },
    { key: 'rt', label: 'RT' },
    { key: 'minG', label: 'MinG' },
    { key: 'minG', label: 'MinG + Impact' },
    { key: 'pc5', label: 'PC' },
    { key: 'delta', label: 'Delta%' },
    { key: 'monthly', label: 'Monthly ₹L' },
    { key: 'code', label: 'Start Date' },
    { key: 'code', label: 'Age' },
  ];

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <input
          type="text"
          placeholder="Search by route, partner, or code..."
          value={blSearch}
          onChange={(e) => setBlSearch(e.target.value)}
          className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700] text-sm"
        />
        <svg
          className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Filter Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Region Pills */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-500 mr-1">Region:</span>
          {REGIONS.map((r) => (
            <button
              key={r}
              onClick={() => setActiveRegion(r)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                activeRegion === r
                  ? 'bg-[#444444] text-white'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              {r === 'all' ? 'All' : r}
            </button>
          ))}
        </div>

        {/* Type Dropdown */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-gray-500">Type:</span>
          <select
            value={blTypeFilter}
            onChange={(e) => setBlTypeFilter(e.target.value as AppState['blTypeFilter'])}
            className="px-3 py-1 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t === 'all' ? 'All' : t}
              </option>
            ))}
          </select>
        </div>

        {/* BP Multi-select */}
        <BPDropdown selected={blSelectedBPs} onChange={setBlSelectedBPs} />
      </div>

      {/* Summary Strip */}
      <div className="flex items-center gap-6 px-4 py-2 bg-[#F5F5F5] rounded-lg text-sm">
        <span className="font-medium text-[#444444]">
          {filteredLines.length} lines shown
        </span>
        <span className="text-gray-600">
          {formatNumber(totalBuses)} buses
        </span>
        <span className="text-gray-600">
          {new Set(filteredLines.map((l) => l.partner)).size} partners
        </span>
        <span className="text-gray-600">
          Total monthly: <span className="font-semibold text-[#444444]">₹{formatNumber(totalMonthly)}L</span>
        </span>
      </div>

      {/* Data Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#444444] text-white">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wider cursor-pointer hover:bg-[#444444]/80 select-none whitespace-nowrap"
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key && (
                      <span className="text-[#73D700]">
                        {sortDir === 'asc' ? '▲' : '▼'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider w-16">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredLines.map((line) => (
              <LineRow
                key={line.code}
                line={line}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
            {filteredLines.length === 0 && (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-gray-400">
                  No lines match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setAddOpen(true)}
          className="px-4 py-2 text-sm font-medium text-white bg-[#73D700] rounded-lg hover:bg-[#65bf00] transition-colors"
        >
          + Add Line
        </button>
        <button
          onClick={() => setImportOpen(true)}
          className="px-4 py-2 text-sm font-medium text-[#444444] bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Import CSV
        </button>
        <button
          onClick={handleExportCSV}
          className="px-4 py-2 text-sm font-medium text-[#444444] bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Modals */}
      <AddLineModal open={addOpen} onClose={() => setAddOpen(false)} />
      <EditLineModal open={editOpen} line={editLine} onClose={() => { setEditOpen(false); setEditLine(null); }} />
      <ImportCSVModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
