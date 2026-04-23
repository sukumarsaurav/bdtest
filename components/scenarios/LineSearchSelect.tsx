'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Line } from '@/types'
import { fmtPerKm } from '@/lib/formatters'
import { useStore } from '@/store/useStore'

interface Props {
  lines: Line[]
  value: string       // selected line code
  onChange: (code: string) => void
  placeholder?: string
}

export default function LineSearchSelect({ lines, value, onChange, placeholder = 'Search line...' }: Props) {
  const showEur = useStore((s) => s.showEur)
  const eurRate = useStore((s) => s.eurRate)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const selectedLine = lines.find((l) => l.code === value)

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    if (!q) return lines
    return lines.filter((l) =>
      l.route.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q) ||
      l.partner.toLowerCase().includes(q)
    )
  }, [lines, query])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <input
          type="text"
          value={open ? query : (selectedLine ? `${selectedLine.code} \u00B7 ${selectedLine.route}` : '')}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#73D700] outline-none pr-8"
        />
        <svg className="absolute right-2 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No lines found</div>
          ) : filtered.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => { onChange(l.code); setOpen(false); setQuery('') }}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-[#73D700]/10 transition-colors flex items-start gap-2 ${value === l.code ? 'bg-[#73D700]/15' : ''}`}
            >
              <span className="font-mono text-[10px] bg-[#444444] text-white px-1.5 py-0.5 rounded mt-0.5 shrink-0">
                {l.code}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#444444] truncate">{l.route}</div>
                <div className="text-gray-400 flex gap-2 flex-wrap mt-0.5">
                  <span>{l.partner}</span>
                  <span>{'\u00B7'}</span>
                  <span>{l.region}</span>
                  <span>{'\u00B7'}</span>
                  <span>{l.buses} buses</span>
                  <span>{'\u00B7'}</span>
                  <span>{l.owKm}km OW</span>
                  <span>{'\u00B7'}</span>
                  <span>{fmtPerKm(l.minG, showEur, eurRate)}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {selectedLine && !open && (
        <div className="mt-2 rounded-lg border border-[#73D700]/30 bg-[#73D700]/5 px-3 py-2">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="font-mono bg-[#444444] text-white px-1.5 py-0.5 rounded text-[10px]">{selectedLine.code}</span>
            <span className="font-semibold text-[#444444]">{selectedLine.route}</span>
            <span className="text-gray-400">{'\u00B7'}</span>
            <span className="text-gray-600">{selectedLine.partner}</span>
            <span className="text-gray-400">{'\u00B7'}</span>
            <span className="text-gray-600">{selectedLine.region}</span>
            <span className="text-gray-400">{'\u00B7'}</span>
            <span className="text-gray-600">{selectedLine.buses} buses</span>
            <span className="text-gray-400">{'\u00B7'}</span>
            <span className="text-gray-600">{selectedLine.rt} RT/mo</span>
            <span className="text-gray-400">{'\u00B7'}</span>
            <span className="text-gray-600">{selectedLine.owKm}km OW</span>
            <span className="text-gray-400">{'\u00B7'}</span>
            <span className="font-semibold text-[#444444]">{fmtPerKm(selectedLine.minG, showEur, eurRate)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
