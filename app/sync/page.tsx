'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';

interface SyncStatus {
  lastSync?: string;
  week?: string;
  rowCount?: number;
  noData?: boolean;
  pushed_at?: string;
  year_week?: string;
  rows?: unknown[];
  weeks?: {
    year_week: string;
    period: string;
    pushed_at: string;
    source: string;
  }[];
}

export default function SyncPage() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = () => {
    fetch('/api/sheet-data')
      .then((res) => res.json())
      .then((data) => {
        setStatus(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadStatus('Loading Excel parser...');

    try {
      setUploadStatus('Parsing Excel file...');
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellText: false });

      // Find BP Cost Hub sheet
      const sheetName = wb.SheetNames.find((n) => n === 'BP Cost Hub');
      if (!sheetName) {
        throw new Error('Sheet "BP Cost Hub" not found. Found: ' + wb.SheetNames.join(', '));
      }
      const ws = wb.Sheets[sheetName];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawArrays: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });

      // Send all weeks present in the sheet — server will group by year_week
      const weekSet = new Set<string>()
      rawArrays.slice(1).forEach((r) => { if (r[34]) weekSet.add(String(r[34])) })
      const weekCount = weekSet.size

      setUploadStatus(`Sending ${rawArrays.length - 1} rows across ${weekCount} weeks...`);

      const res = await fetch('/api/ingest?secret=7ea5f20a7ee15c046fe943ea08113e3a77bb742c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawArrays: rawArrays, source: 'sync-upload' }),
      });
      const data = await res.json();

      if (data.ok) {
        setUploadStatus(`Synced ${data.weeks} weeks (${data.totalRows} rows)`);
        fetchStatus(); // Refresh status
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      setUploadStatus(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-[#444444] text-gray-100">
      {/* Header */}
      <header className="bg-[#444444] border-b border-[#444444] px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#73D700] rounded-lg flex items-center justify-center font-bold text-white text-xl">
            F
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Flix BD</h1>
            <p className="text-sm text-gray-400">Data Sync</p>
          </div>
          <a href="/" className="ml-auto text-sm text-[#73D700] hover:underline">
            &larr; Back to Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-6 space-y-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Sync Data from SharePoint</h2>
          <p className="text-gray-400">
            Upload the BP Cost Snapshot Sheet to push the latest weekly data into the Flix BD dashboard.
          </p>
        </div>

        {/* File Upload — Primary Method */}
        <div className="bg-[#444444] rounded-xl p-6 border-2 border-[#73D700]">
          <h3 className="text-lg font-semibold text-white mb-2">Upload Excel File</h3>
          <p className="text-sm text-gray-400 mb-4">
            Download the BP Cost Snapshot Sheet.xlsm from SharePoint, then upload it here.
          </p>

          <div className="space-y-4">
            <ol className="space-y-2 text-sm text-gray-300">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-[#73D700] text-[#444444] rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span>Open the file in SharePoint &rarr; Click <strong>File</strong> &rarr; <strong>Save As</strong> &rarr; <strong>Download a Copy</strong></span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 bg-[#73D700] text-[#444444] rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span>Upload the downloaded .xlsm file below</span>
              </li>
            </ol>

            <div className="flex items-center gap-4">
              <label className={`flex-1 flex items-center justify-center gap-2 px-6 py-4 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
                uploading ? 'border-gray-600 bg-gray-800/50' : 'border-[#73D700]/50 hover:border-[#73D700] hover:bg-[#73D700]/5'
              }`}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsm,.xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                />
                {uploading ? (
                  <div className="flex items-center gap-3">
                    <svg className="animate-spin h-5 w-5 text-[#73D700]" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-gray-300">{uploadStatus}</span>
                  </div>
                ) : (
                  <>
                    <svg className="w-6 h-6 text-[#73D700]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <span className="text-[#73D700] font-semibold">Choose .xlsm file or drag here</span>
                  </>
                )}
              </label>
            </div>

            {uploadStatus && !uploading && (
              <div className={`text-sm px-4 py-2 rounded-lg ${
                uploadStatus.startsWith('Error') ? 'bg-[#FFAD00]/20 text-[#FFAD00]' : 'bg-green-900/30 text-[#73D700]'
              }`}>
                {uploadStatus}
              </div>
            )}
          </div>
        </div>

        {/* Sync Status */}
        <div className="bg-[#444444] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Sync Status</h3>
          {loading ? (
            <p className="text-gray-400">Loading sync status...</p>
          ) : error ? (
            <p className="text-gray-400">No data synced yet. Upload a file above to get started.</p>
          ) : status && !status.noData ? (
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Last Sync</p>
                <p className="text-white font-semibold mt-1">
                  {status.pushed_at ? new Date(status.pushed_at).toLocaleString() : 'Never'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Current Week</p>
                <p className="text-white font-semibold mt-1">{status.year_week ?? '--'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide">Row Count</p>
                <p className="text-white font-semibold mt-1">{status.rows ? status.rows.length.toLocaleString() : '--'}</p>
              </div>
            </div>
          ) : (
            <p className="text-gray-400">No data synced yet. Upload a file above to get started.</p>
          )}
        </div>

        {/* Available Weeks Table */}
        {status?.weeks && status.weeks.length > 0 && (
          <div className="bg-[#444444] rounded-xl p-6 overflow-x-auto">
            <h3 className="text-lg font-semibold text-white mb-4">Available Weeks</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-[#444444]">
                  <th className="pb-2 pr-3">Year_Week</th>
                  <th className="pb-2 pr-3">Period</th>
                  <th className="pb-2 pr-3">Pushed At</th>
                  <th className="pb-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {status.weeks.map((w, i) => (
                  <tr key={i} className="border-b border-[#444444]/50 hover:bg-[#444444]/40">
                    <td className="py-2 pr-3 font-mono">{w.year_week}</td>
                    <td className="py-2 pr-3">{w.period}</td>
                    <td className="py-2 pr-3">{new Date(w.pushed_at).toLocaleString()}</td>
                    <td className="py-2">{w.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Power Automate Setup */}
        <div className="bg-[#444444] rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Automate with Power Automate (Optional)</h3>
          <p className="text-gray-400 mb-4 text-sm">
            Set up a weekly Power Automate flow so data arrives every Monday automatically.
          </p>
          <ol className="space-y-3 text-sm text-gray-300">
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 border border-[#73D700] text-[#73D700] rounded-full flex items-center justify-center text-xs font-bold">1</span>
              <span>Go to <a href="https://make.powerautomate.com" target="_blank" rel="noopener noreferrer" className="text-[#73D700] underline">make.powerautomate.com</a> &rarr; Create Scheduled cloud flow (Weekly, Monday 09:00)</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 border border-[#73D700] text-[#73D700] rounded-full flex items-center justify-center text-xs font-bold">2</span>
              <span>Add <strong>Excel Online (Business)</strong> &rarr; List rows present in a table &rarr; point to BP Cost Snapshot Sheet.xlsm, sheet &quot;BP Cost Hub&quot;</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 border border-[#73D700] text-[#73D700] rounded-full flex items-center justify-center text-xs font-bold">3</span>
              <span>Add <strong>HTTP POST</strong> to <code className="bg-[#444444] px-1.5 py-0.5 rounded text-[#73D700]">https://flix-bd.vercel.app/api/ingest?secret=YOUR_SECRET</code></span>
            </li>
          </ol>
        </div>
      </main>

    </div>
  );
}
