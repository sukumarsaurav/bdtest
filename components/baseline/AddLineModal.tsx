'use client';

import { useState, useEffect } from 'react';
import { useStore } from '@/store/useStore';
import { Line } from '@/types';

interface AddLineModalProps {
  open: boolean;
  onClose: () => void;
}

const INITIAL_FORM: Omit<Line, 'delta' | 'monthly'> = {
  code: '',
  route: '',
  partner: '',
  region: 'N',
  buses: 1,
  type: 'Sleeper',
  gst: 5,
  owKm: 0,
  rt: 0,
  minG: 0,
  pc5: 0,
  dieselAtCommission: undefined,
  startDate: undefined,
};

export default function AddLineModal({ open, onClose }: AddLineModalProps) {
  const { lines, addLine } = useStore();
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setError('');
    }
  }, [open]);

  const delta =
    form.pc5 && form.minG
      ? ((form.pc5 - form.minG) / form.pc5) * 100
      : null;

  const monthly =
    form.minG && form.owKm && form.rt && form.buses
      ? (form.minG * form.owKm * 2 * form.rt * form.buses) / 100000
      : 0;

  const handleChange = (field: string, value: string | number | undefined) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.code.trim()) {
      setError('Code is required.');
      return;
    }

    if (lines.some((l) => l.code === form.code.trim())) {
      setError('A line with this code already exists.');
      return;
    }

    if (!form.route.trim() || !form.partner.trim()) {
      setError('Route and Partner are required.');
      return;
    }

    const newLine: Line = {
      ...form,
      code: form.code.trim(),
      route: form.route.trim(),
      partner: form.partner.trim(),
      delta: delta != null ? Math.round(delta * 10) / 10 : null,
      monthly: Math.round(monthly * 10) / 10,
      dieselAtCommission: form.dieselAtCommission || undefined,
      startDate: form.startDate || undefined,
    };

    addLine(newLine);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 bg-[#444444] rounded-t-xl">
          <h2 className="text-lg font-semibold text-white">Add New Line</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-2 text-sm text-[#FFAD00] bg-[#FFAD00]/10 border border-[#FFAD00]/30 rounded-lg">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Code */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => handleChange('code', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
                placeholder="e.g. MUM-BLR-01"
              />
            </div>

            {/* Route */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Route</label>
              <input
                type="text"
                value={form.route}
                onChange={(e) => handleChange('route', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
                placeholder="e.g. Mumbai - Bangalore"
              />
            </div>

            {/* Partner */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Partner</label>
              <input
                type="text"
                value={form.partner}
                onChange={(e) => handleChange('partner', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
                placeholder="e.g. SRS Travels"
              />
            </div>

            {/* Region */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Region</label>
              <select
                value={form.region}
                onChange={(e) => handleChange('region', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              >
                <option value="N">N</option>
                <option value="S">S</option>
                <option value="W">W</option>
              </select>
            </div>

            {/* Buses */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Buses</label>
              <input
                type="number" step="any"
                min={1}
                value={form.buses}
                onChange={(e) => handleChange('buses', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              />
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
              <select
                value={form.type}
                onChange={(e) => handleChange('type', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              >
                <option value="Sleeper">Sleeper</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Seater">Seater</option>
              </select>
            </div>

            {/* GST */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">GST (%)</label>
              <select
                value={form.gst}
                onChange={(e) => handleChange('gst', parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              >
                <option value={5}>5%</option>
                <option value={18}>18%</option>
              </select>
            </div>

            {/* OW km */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">OW km</label>
              <input
                type="number" step="any"
                min={0}
                value={form.owKm}
                onChange={(e) => handleChange('owKm', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              />
            </div>

            {/* RT */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">RT</label>
              <input
                type="number" step="any"
                min={0}
                value={form.rt}
                onChange={(e) => handleChange('rt', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              />
            </div>

            {/* MinG */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">MinG</label>
              <input
                type="number" step="any"
                min={0}
                value={form.minG}
                onChange={(e) => handleChange('minG', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              />
            </div>

            {/* PC */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">PC</label>
              <input
                type="number" step="any"
                min={0}
                value={form.pc5 ?? ''}
                onChange={(e) => handleChange('pc5', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              />
            </div>

            {/* PC */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">PC</label>
              <input
                type="number" step="any"
                min={0}
                value={form.pc5 ?? ''}
                onChange={(e) => handleChange('pc5', parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              />
            </div>

            {/* Diesel at Commissioning */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Diesel at Commissioning (&#8377;/L)</label>
              <input
                type="number" step="0.01"
                min={0}
                value={form.dieselAtCommission ?? ''}
                onChange={(e) => handleChange('dieselAtCommission', e.target.value ? parseFloat(e.target.value) : undefined)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
                placeholder="e.g. 87.50"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Diesel price when this line was commissioned</p>
            </div>

            {/* Line Start Date */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Line Start Date</label>
              <input
                type="date"
                value={form.startDate ?? ''}
                onChange={(e) => handleChange('startDate', e.target.value || undefined)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#73D700]"
              />
              <p className="text-[10px] text-gray-400 mt-0.5">Date this line started operating</p>
            </div>
          </div>

          {/* Computed Fields */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-[#F5F5F5] rounded-lg">
            <div>
              <span className="text-xs font-medium text-gray-500">Delta%</span>
              <p className="text-sm font-semibold text-[#444444]">
                {delta != null ? `${delta.toFixed(1)}%` : '—'}
              </p>
            </div>
            <div>
              <span className="text-xs font-medium text-gray-500">Monthly (₹L)</span>
              <p className="text-sm font-semibold text-[#444444]">
                ₹{monthly.toFixed(2)}L
              </p>
            </div>
          </div>

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
              type="submit"
              className="px-6 py-2 text-sm font-medium text-white bg-[#73D700] rounded-lg hover:bg-[#65bf00] transition-colors"
            >
              Add Line
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
