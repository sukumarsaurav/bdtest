'use client'

import { useState } from 'react'
import { useStore } from '@/store/useStore'
import FleetAnalytics from '@/components/fleet-analytics/FleetAnalytics'

export default function Supply() {
  const [uploadStatus, setUploadStatus] = useState<string | null>(null)

  const handleSupplyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadStatus('Parsing...')
    try {
      let rows: Record<string, string>[] = []

      if (file.name.endsWith('.csv')) {
        const text = await file.text()
        const lines = text.split('\n').filter(Boolean)
        const headers = lines[0].split(',').map((h) => h.trim())
        rows = lines.slice(1).map((line) => {
          const vals = line.split(',')
          const obj: Record<string, string> = {}
          headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? '' })
          return obj
        })
      } else {
        // For xlsx, use SheetJS if available
        const SJS = (window as any).__SJS__
        if (SJS) {
          const buf = await file.arrayBuffer()
          const wb = SJS.read(buf, { type: 'array' })
          rows = SJS.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]])
        } else {
          setUploadStatus('Error: XLSX parsing requires SheetJS. Use CSV instead.')
          return
        }
      }

      // Normalize column names
      const normalized = rows.map((r: any) => ({
        line_id: r.line_id || r['Line ID'] || r['LineID'] || '',
        oem: r.oem || r['OEM'] || r['Manufacturer'] || undefined,
        body_builder: r.body_builder || r['Body Builder'] || r['BodyBuilder'] || undefined,
        manufacture_year: r.manufacture_year || r['Year'] || r['Manufacture Year'] || undefined,
        seat_config: r.seat_config || r['Seat Config'] || r['Seats'] || undefined,
        bus_age_years: r.bus_age_years || r['Age'] || r['Bus Age'] || undefined,
      })).filter((r) => r.line_id)

      setUploadStatus(`Uploading ${normalized.length} rows...`)
      const res = await fetch('/api/supply-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalized),
      })
      const result = await res.json()
      setUploadStatus(
        result.failed === 0
          ? `Updated ${result.updated} lines successfully.`
          : `Updated ${result.updated}, ${result.failed} failed.`,
      )
    } catch (err) {
      setUploadStatus(`Error: ${err instanceof Error ? err.message : 'Upload failed'}`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Supply data upload card */}
      <div
        style={{
          border: '1.5px dashed rgba(68,68,68,0.2)',
          borderRadius: 12,
          padding: '1.5rem',
          textAlign: 'center',
          background: '#FFFFFF',
        }}
      >
        <p style={{ fontWeight: 500, marginBottom: 6, color: '#444444' }}>
          Upload supply data to enrich fleet analytics
        </p>
        <p style={{ fontSize: 13, color: 'rgba(68,68,68,0.6)', marginBottom: 12 }}>
          CSV format: line_id, oem, body_builder, manufacture_year, seat_config
        </p>
        <input
          type="file"
          accept=".csv,.xlsx"
          onChange={handleSupplyUpload}
          className="text-sm"
        />
        {uploadStatus && (
          <p
            style={{
              marginTop: 8,
              fontSize: 12,
              color: uploadStatus.startsWith('Error') ? '#FFAD00' : '#73D700',
            }}
          >
            {uploadStatus}
          </p>
        )}
      </div>

      {/* Existing Fleet Analytics charts */}
      <FleetAnalytics />
    </div>
  )
}
