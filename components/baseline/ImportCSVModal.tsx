'use client';

import { useState, useEffect, useRef } from 'react';
import { useStore } from '@/store/useStore';
import { Line } from '@/types';

interface ImportCSVModalProps {
  open: boolean;
  onClose: () => void;
}

type ImportMode = 'replace' | 'append';

const CSV_HEADERS = [
  'code', 'route', 'partner', 'region', 'buses', 'type', 'gst',
  'owKm', 'rt', 'minG', 'pc5', 'delta', 'monthly',
];

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(text: string): { lines: Line[]; errors: string[] } {
  const errors: string[] = [];
  const rows = text.split('\n').filter((r) => r.trim());

  if (rows.length < 2) {
    return { lines: [], errors: ['CSV must have a header row and at least one data row.'] };
  }

  const headerRow = parseCSVLine(rows[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

  // Map headers to expected fields
  const headerMap: Record<string, string> = {};
  for (const expected of CSV_HEADERS) {
    const normalized = expected.toLowerCase().replace(/[^a-z0-9]/g, '');
    const idx = headerRow.findIndex((h) => h === normalized || h.includes(normalized));
    if (idx !== -1) {
      headerMap[expected] = headerRow[idx];
    }
  }

  const parsed: Line[] = [];

  for (let i = 1; i < rows.length; i++) {
    const values = parseCSVLine(rows[i]);
    if (values.length < 4) {
      errors.push(`Row ${i + 1}: Too few columns (${values.length})`);
      continue;
    }

    try {
      const getVal = (field: string, fallback = ''): string => {
        const hKey = headerMap[field];
        if (!hKey) return fallback;
        const idx = headerRow.indexOf(hKey);
        return idx >= 0 && idx < values.length ? values[idx] : fallback;
      };

      const code = getVal('code');
      if (!code) {
        errors.push(`Row ${i + 1}: Missing code`);
        continue;
      }

      const minG = parseFloat(getVal('minG', '0')) || 0;
      const pc5Val = parseFloat(getVal('pc5', '0')) || 0;
      const owKm = parseFloat(getVal('owKm', '0')) || 0;
      const rt = parseFloat(getVal('rt', '0')) || 0;
      const buses = parseInt(getVal('buses', '1')) || 1;

      const delta = pc5Val && minG ? Math.round(((pc5Val - minG) / pc5Val) * 1000) / 10 : null;
      const monthly = Math.round((minG * owKm * 2 * rt * buses) / 100000 * 10) / 10;

      parsed.push({
        code,
        route: getVal('route'),
        partner: getVal('partner'),
        region: getVal('region', 'N') as 'N' | 'S' | 'W',
        buses,
        type: getVal('type', 'Sleeper') as 'Sleeper' | 'Hybrid' | 'Seater',
        gst: (parseInt(getVal('gst', '5')) === 18 ? 18 : 5) as 5 | 18,
        owKm,
        rt,
        minG,
        pc5: parseFloat(getVal('pc5', '0')) || 0,
        delta,
        monthly,
      });
    } catch {
      errors.push(`Row ${i + 1}: Failed to parse`);
    }
  }

  return { lines: parsed, errors };
}

export default function ImportCSVModal({ open, onClose }: ImportCSVModalProps) {
  const { importLines } = useStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ImportMode>('append');
  const [rawText, setRawText] = useState('');
  const [parsedLines, setParsedLines] = useState<Line[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    if (open) {
      setRawText('');
      setParsedLines([]);
      setParseErrors([]);
      setFileName('');
      setMode('append');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setRawText(text);
      const { lines, errors } = parseCSV(text);
      setParsedLines(lines);
      setParseErrors(errors);
    };
    reader.readAsText(file);
  };

  const handleSubmit = () => {
    if (parsedLines.length === 0) return;
    importLines(parsedLines, mode);
    onClose();
  };

  if (!open) return null;

  const previewLines = parsedLines.slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-[#444444] rounded-t-xl">
          <h2 className="text-lg font-semibold text-white">Import CSV</h2>
        </div>

        <div className="p-6 space-y-4">
          {/* File Input */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Select CSV File</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#73D700] file:text-white hover:file:bg-[#65bf00] file:cursor-pointer"
            />
            {fileName && (
              <p className="mt-1 text-xs text-gray-400">Selected: {fileName}</p>
            )}
          </div>

          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Import Mode</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="append"
                  checked={mode === 'append'}
                  onChange={() => setMode('append')}
                  className="text-[#73D700] focus:ring-[#73D700]"
                />
                <span className="text-sm">Append to existing</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mode"
                  value="replace"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                  className="text-[#73D700] focus:ring-[#73D700]"
                />
                <span className="text-sm text-[#FFAD00] font-medium">Replace all</span>
              </label>
            </div>
          </div>

          {/* Errors */}
          {parseErrors.length > 0 && (
            <div className="p-3 bg-[#FFAD00]/10 border border-[#FFAD00]/30 rounded-lg">
              <p className="text-xs font-medium text-[#FFAD00] mb-1">Parse Errors:</p>
              <ul className="text-xs text-[#FFAD00] space-y-0.5">
                {parseErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Table */}
          {previewLines.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-600 mb-2">
                Preview ({parsedLines.length} rows parsed, showing first {previewLines.length})
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#F5F5F5]">
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Code</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Route</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Partner</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Region</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500">Buses</th>
                      <th className="px-2 py-1.5 text-left font-medium text-gray-500">Type</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500">MinG</th>
                      <th className="px-2 py-1.5 text-right font-medium text-gray-500">Monthly</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {previewLines.map((line, i) => (
                      <tr key={i}>
                        <td className="px-2 py-1.5 font-mono">{line.code}</td>
                        <td className="px-2 py-1.5">{line.route}</td>
                        <td className="px-2 py-1.5">{line.partner}</td>
                        <td className="px-2 py-1.5">{line.region}</td>
                        <td className="px-2 py-1.5 text-right">{line.buses}</td>
                        <td className="px-2 py-1.5">{line.type}</td>
                        <td className="px-2 py-1.5 text-right">{line.minG}</td>
                        <td className="px-2 py-1.5 text-right">{line.monthly}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Buttons */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={parsedLines.length === 0}
              className="px-6 py-2 text-sm font-medium text-white bg-[#73D700] rounded-lg hover:bg-[#65bf00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import {parsedLines.length} Lines
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
