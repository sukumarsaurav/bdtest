'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useStore } from '@/store/useStore';

interface BPDropdownProps {
  selected: string[];
  onChange: (selected: string[]) => void;
}

export default function BPDropdown({ selected, onChange }: BPDropdownProps) {
  const { lines } = useStore();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const partners = useMemo(() => {
    const unique = Array.from(new Set(lines.map((l) => l.partner))).sort();
    return unique;
  }, [lines]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = (partner: string) => {
    if (selected.includes(partner)) {
      onChange(selected.filter((p) => p !== partner));
    } else {
      onChange([...selected, partner]);
    }
  };

  const handleSelectAll = () => {
    onChange([...partners]);
  };

  const handleClear = () => {
    onChange([]);
  };

  const label =
    selected.length === 0
      ? 'All partners'
      : `${selected.length} of ${partners.length} partners`;

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium text-gray-500">BP:</span>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1 text-xs border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#73D700] transition-colors"
        >
          <span>{label}</span>
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-40 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg">
          {/* Action Buttons */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <button
              onClick={handleSelectAll}
              className="text-xs text-[#73D700] font-medium hover:underline"
            >
              Select All
            </button>
            <button
              onClick={handleClear}
              className="text-xs text-[#FFAD00] font-medium hover:underline"
            >
              Clear
            </button>
          </div>

          {/* Partner List */}
          <div className="max-h-48 overflow-y-auto py-1">
            {partners.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">No partners found</div>
            ) : (
              partners.map((partner) => (
                <label
                  key={partner}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[#F5F5F5] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(partner)}
                    onChange={() => handleToggle(partner)}
                    className="rounded border-gray-300 text-[#73D700] focus:ring-[#73D700]"
                  />
                  <span className="truncate">{partner}</span>
                </label>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-400">
            {label}
          </div>
        </div>
      )}
    </div>
  );
}
