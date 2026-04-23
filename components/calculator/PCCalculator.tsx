'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { PCInputs, PCResult, calculatePC, getDefaultInputs } from '@/lib/calculations';
import CostBreakdown from './CostBreakdown';
import SensitivityTable from './SensitivityTable';
import TenureComparison from './TenureComparison';
import ComparableRoutes from './ComparableRoutes';

const SOUTH_STATES = ['Karnataka', 'Tamil Nadu', 'Kerala', 'Andhra Pradesh', 'Telangana'];
const NORTH_STATES = ['Delhi', 'Haryana', 'Punjab', 'Uttar Pradesh', 'Rajasthan', 'Madhya Pradesh', 'Uttarakhand', 'Himachal Pradesh', 'Jammu & Kashmir'];

const CHASSIS_OPTIONS = [
  { name: 'BharatBenz 1624', cost: 3200000 },
  { name: 'Volvo B8R', cost: 5500000 },
  { name: 'Scania K310', cost: 5000000 },
  { name: 'Ashok Leyland 2820', cost: 2800000 },
  { name: 'Tata LPO 1823', cost: 2600000 },
];

const BODY_OPTIONS = [
  { name: 'MG Body', cost: 2500000 },
  { name: 'Prakash Body', cost: 2200000 },
  { name: 'JCBL Body', cost: 2000000 },
  { name: 'Veera Vahana', cost: 2800000 },
];

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-2 text-sm font-semibold text-[#73D700] uppercase tracking-wide"
    >
      {title}
      <span className="text-gray-500 text-xs">{open ? '[-]' : '[+]'}</span>
    </button>
  );
}

export default function PCCalculator() {
  const [inputs, setInputs] = useState<PCInputs>(getDefaultInputs());
  const [sections, setSections] = useState<Record<string, boolean>>({
    route: true,
    bus: true,
    chassis: true,
    financing: false,
    fuel: true,
    perTrip: false,
    perMonth: false,
    perKm: false,
    insurance: false,
    aitp: false,
    van: false,
    region: true,
    gst: true,
  });

  const result: PCResult = useMemo(() => calculatePC(inputs), [inputs]);

  const update = useCallback(<K extends keyof PCInputs>(key: K, value: PCInputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleSection = useCallback((key: string) => {
    setSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  function handleBusTypeChange(bt: PCInputs['busType']) {
    const berthsMap: Record<string, number> = { Sleeper: 36, Hybrid: 24, Seater: 0 };
    const seatsMap: Record<string, number> = { Sleeper: 0, Hybrid: 12, Seater: 42 };
    setInputs((prev) => ({
      ...prev,
      busType: bt,
      berths: berthsMap[bt],
      seats: seatsMap[bt],
    }));
  }

  function handleChassisChange(name: string) {
    const opt = CHASSIS_OPTIONS.find((c) => c.name === name);
    if (opt) {
      setInputs((prev) => ({ ...prev, chassisName: opt.name, chassisCost: opt.cost }));
    }
  }

  function handleBodyChange(name: string) {
    const opt = BODY_OPTIONS.find((b) => b.name === name);
    if (opt) {
      setInputs((prev) => ({ ...prev, bodyName: opt.name, bodyCost: opt.cost }));
    }
  }

  function handleRegionChange(region: 'South' | 'North') {
    const dhDefaults: Record<string, number> = { South: 7.5, North: 8.0 };
    setInputs((prev) => ({
      ...prev,
      region,
      dhCostPerKm: dhDefaults[region],
      selectedStates: region === 'South' ? ['Karnataka', 'Tamil Nadu'] : ['Delhi', 'Haryana'],
      stateTaxOverrides: {},
    }));
  }

  function handleStateToggle(state: string) {
    setInputs((prev) => {
      const exists = prev.selectedStates.includes(state);
      return {
        ...prev,
        selectedStates: exists
          ? prev.selectedStates.filter((s) => s !== state)
          : [...prev.selectedStates, state],
      };
    });
  }

  const numField = (
    label: string,
    key: keyof PCInputs,
    opts?: { unit?: string; step?: number; hint?: string }
  ) => (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="flex-1 min-w-0">
        <label className="text-sm text-gray-300 whitespace-nowrap">
          {label}
          {opts?.unit && (
            <span className="text-xs text-gray-500 ml-1">({opts.unit})</span>
          )}
        </label>
        {opts?.hint && (
          <span className="text-xs text-[#73D700] ml-2">{opts.hint}</span>
        )}
      </div>
      <input
        type="number"
        step={opts?.step ?? 1}
        value={inputs[key] as number}
        onChange={(e) => update(key, parseFloat(e.target.value) || 0)}
        className="w-28 rounded bg-[#444444]/60 border border-gray-700 px-2 py-1 text-sm text-white text-right focus:border-[#73D700] focus:outline-none"
      />
    </div>
  );

  const fuelPerKm = inputs.mileage > 0 ? inputs.dieselPrice / inputs.mileage : 0;
  const tollPerKm = inputs.owKm > 0 ? inputs.tollPerOWTrip / inputs.owKm : 0;
  const rtKm = inputs.owKm * 2;

  const stateOptions = inputs.region === 'South' ? SOUTH_STATES : NORTH_STATES;
  const isNorthFlatState = (s: string) =>
    inputs.region === 'North' && !['Delhi'].includes(s);

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4">
      {/* LEFT PANEL - Inputs */}
      <div className="lg:w-[40%] space-y-3 overflow-y-auto max-h-[calc(100vh-6rem)]">
        {/* 1. Route Basics */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Route Basics" open={sections.route} onToggle={() => toggleSection('route')} />
          {sections.route && (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2 py-1">
                <label className="text-sm text-gray-300">Route Name</label>
                <input
                  type="text"
                  value={inputs.routeName}
                  onChange={(e) => update('routeName', e.target.value)}
                  placeholder="e.g. BLR-CHN"
                  className="w-40 rounded bg-[#444444]/60 border border-gray-700 px-2 py-1 text-sm text-white text-right focus:border-[#73D700] focus:outline-none"
                />
              </div>
              {numField('One-way KM', 'owKm', {
                unit: 'km',
                hint: `RT: ${(inputs.owKm * 2).toLocaleString('en-IN')} km`,
              })}
              {numField('Round Trips / Month', 'rtPerMonth', {
                hint: `Days in operation: ~${inputs.rtPerMonth * 3}/mo`,
              })}
              {numField('Buses', 'buses')}
              <div className="py-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-300">Margin</label>
                  <span className="text-sm font-medium text-white">{inputs.marginPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={0.5}
                  value={inputs.marginPct}
                  onChange={(e) => update('marginPct', parseFloat(e.target.value))}
                  className="w-full accent-[#73D700]"
                />
              </div>
            </div>
          )}
        </div>

        {/* 2. Bus Configuration */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Bus Configuration" open={sections.bus} onToggle={() => toggleSection('bus')} />
          {sections.bus && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 py-1">
                <label className="text-sm text-gray-300">Bus Type</label>
                <div className="flex rounded overflow-hidden border border-gray-700">
                  {(['Sleeper', 'Hybrid', 'Seater'] as const).map((bt) => (
                    <button
                      key={bt}
                      onClick={() => handleBusTypeChange(bt)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        inputs.busType === bt
                          ? 'bg-[#73D700] text-[#444444]'
                          : 'bg-[#444444] text-gray-400 hover:text-white'
                      }`}
                    >
                      {bt}
                    </button>
                  ))}
                </div>
              </div>
              <div className="text-xs text-gray-500 pl-1">
                {inputs.berths} berths, {inputs.seats} seats
              </div>

              <div className="flex items-center justify-between gap-2 py-1">
                <label className="text-sm text-gray-300">D/H Model</label>
                <div className="flex rounded overflow-hidden border border-gray-700">
                  {(['2D1H', '1D1H'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => update('dhModel', m)}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        inputs.dhModel === m
                          ? 'bg-[#73D700] text-[#444444]'
                          : 'bg-[#444444] text-gray-400 hover:text-white'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              {numField('D/H Cost', 'dhCostPerKm', { unit: '₹/km', step: 0.5 })}
            </div>
          )}
        </div>

        {/* 3. Chassis + Body */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Chassis + Body" open={sections.chassis} onToggle={() => toggleSection('chassis')} />
          {sections.chassis && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 py-1">
                <label className="text-sm text-gray-300">Chassis</label>
                <select
                  value={inputs.chassisName}
                  onChange={(e) => handleChassisChange(e.target.value)}
                  className="w-40 rounded bg-[#444444]/60 border border-gray-700 px-2 py-1 text-sm text-white focus:border-[#73D700] focus:outline-none"
                >
                  {CHASSIS_OPTIONS.map((c) => (
                    <option key={c.name} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              {numField('Chassis Cost', 'chassisCost', { unit: '₹' })}

              <div className="flex items-center justify-between gap-2 py-1">
                <label className="text-sm text-gray-300">Body</label>
                <select
                  value={inputs.bodyName}
                  onChange={(e) => handleBodyChange(e.target.value)}
                  className="w-40 rounded bg-[#444444]/60 border border-gray-700 px-2 py-1 text-sm text-white focus:border-[#73D700] focus:outline-none"
                >
                  {BODY_OPTIONS.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              {numField('Body Cost', 'bodyCost', { unit: '₹' })}

              <div className="border-t border-gray-700 pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Vehicle Cost</span>
                  <span className="text-white font-medium">
                    {(result.vehicleCost / 100000).toFixed(1)}L
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>Monthly EMI</span>
                  <span className="text-white font-medium">
                    {(result.monthlyEMI).toLocaleString('en-IN')}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400">
                  <span>EMI/km</span>
                  <span className="text-[#73D700] font-medium">
                    {result.emiPerKm.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 4. Financing */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Financing" open={sections.financing} onToggle={() => toggleSection('financing')} />
          {sections.financing && (
            <div className="space-y-2">
              <div className="py-1">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm text-gray-300">Financing %</label>
                  <span className="text-sm font-medium text-white">{inputs.financingPct}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={inputs.financingPct}
                  onChange={(e) => update('financingPct', parseFloat(e.target.value))}
                  className="w-full accent-[#73D700]"
                />
              </div>
              {numField('Interest Rate', 'interestRate', { unit: '% p.a.', step: 0.5 })}
              {numField('Loan Term', 'loanTermMonths', { unit: 'months' })}
            </div>
          )}
        </div>

        {/* 5. Fuel & Tolls */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Fuel & Tolls" open={sections.fuel} onToggle={() => toggleSection('fuel')} />
          {sections.fuel && (
            <div className="space-y-1">
              {numField('Diesel Price', 'dieselPrice', { unit: '₹/L', step: 0.5 })}
              {numField('Mileage', 'mileage', {
                unit: 'km/L',
                step: 0.1,
                hint: `Fuel: ${fuelPerKm.toFixed(2)} ₹/km`,
              })}
              {numField('AdBlue', 'adbluePerKm', { unit: '₹/km', step: 0.1 })}
              {numField('Toll per OW trip', 'tollPerOWTrip', {
                unit: '₹',
                hint: `Toll: ${tollPerKm.toFixed(2)} ₹/km`,
              })}
            </div>
          )}
        </div>

        {/* 6. Per-trip costs */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Per-Trip Costs" open={sections.perTrip} onToggle={() => toggleSection('perTrip')} />
          {sections.perTrip && (
            <div className="space-y-1">
              {numField('Water / RT', 'waterPerRT', {
                unit: '₹',
                hint: rtKm > 0 ? `${(inputs.waterPerRT / rtKm).toFixed(2)} ₹/km` : '',
              })}
              {numField('Laundry / RT', 'laundryPerRT', {
                unit: '₹',
                hint: rtKm > 0 ? `${(inputs.laundryPerRT / rtKm).toFixed(2)} ₹/km` : '',
              })}
              {numField('Parking / RT', 'parkingPerRT', {
                unit: '₹',
                hint: rtKm > 0 ? `${(inputs.parkingPerRT / rtKm).toFixed(2)} ₹/km` : '',
              })}
            </div>
          )}
        </div>

        {/* 7. Per-month costs */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Per-Month Costs" open={sections.perMonth} onToggle={() => toggleSection('perMonth')} />
          {sections.perMonth && (
            <div className="space-y-1">
              {numField('Dashcam', 'dashcamPerMonth', {
                unit: '₹/mo',
                hint: result.monthlyKmPerBus > 0
                  ? `${(inputs.dashcamPerMonth / result.monthlyKmPerBus).toFixed(2)} ₹/km`
                  : '',
              })}
              {numField('Uniform', 'uniformPerMonth', {
                unit: '₹/mo',
                hint: result.monthlyKmPerBus > 0
                  ? `${(inputs.uniformPerMonth / result.monthlyKmPerBus).toFixed(2)} ₹/km`
                  : '',
              })}
            </div>
          )}
        </div>

        {/* 8. Per-km costs */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Per-KM Costs" open={sections.perKm} onToggle={() => toggleSection('perKm')} />
          {sections.perKm && (
            <div className="space-y-1">
              {numField('Tyres', 'tyrePerKm', { unit: '₹/km', step: 0.1 })}
              {numField('Maintenance', 'maintenancePerKm', { unit: '₹/km', step: 0.1 })}
              {numField('Admin', 'adminPerKm', { unit: '₹/km', step: 0.1 })}
              {numField('Liasoning', 'liasoningPerKm', { unit: '₹/km', step: 0.1 })}
              {numField('Challan', 'challanPerKm', { unit: '₹/km', step: 0.05 })}
            </div>
          )}
        </div>

        {/* 9. Insurance & Registration */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Insurance & Registration" open={sections.insurance} onToggle={() => toggleSection('insurance')} />
          {sections.insurance && (
            <div className="space-y-1">
              {numField('Insurance % of Vehicle', 'insurancePctOfVehicle', {
                unit: '%/yr',
                step: 0.1,
                hint: result.monthlyKmPerBus > 0
                  ? `${(((result.vehicleCost * inputs.insurancePctOfVehicle / 100) / 12) / result.monthlyKmPerBus).toFixed(2)} ₹/km`
                  : '',
              })}
              {numField('Registration', 'registrationPerYear', {
                unit: '₹/yr',
                hint: result.monthlyKmPerBus > 0
                  ? `${(inputs.registrationPerYear / 12 / result.monthlyKmPerBus).toFixed(2)} ₹/km`
                  : '',
              })}
            </div>
          )}
        </div>

        {/* 10. AITP */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="AITP" open={sections.aitp} onToggle={() => toggleSection('aitp')} />
          {sections.aitp && (
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1">
                <label className="text-sm text-gray-300">Applicable</label>
                <button
                  onClick={() => update('aitpApplicable', !inputs.aitpApplicable)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    inputs.aitpApplicable ? 'bg-[#73D700]' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      inputs.aitpApplicable ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {inputs.aitpApplicable && (
                <>
                  <div className="flex items-center gap-3 py-1">
                    {(['monthly', 'quarterly', 'yearly'] as const).map((f) => (
                      <label key={f} className="flex items-center gap-1 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="radio"
                          name="aitpFreq"
                          checked={inputs.aitpFrequency === f}
                          onChange={() => update('aitpFrequency', f)}
                          className="accent-[#73D700]"
                        />
                        {f}
                      </label>
                    ))}
                  </div>
                  {numField('Annual Cost', 'aitpAnnualCost', { unit: '₹/yr' })}
                </>
              )}
            </div>
          )}
        </div>

        {/* 11. Van Pickup */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Van Pickup/Drop" open={sections.van} onToggle={() => toggleSection('van')} />
          {sections.van && (
            <div className="space-y-2">
              <div className="flex items-center justify-between py-1">
                <label className="text-sm text-gray-300">Enabled</label>
                <button
                  onClick={() => update('vanEnabled', !inputs.vanEnabled)}
                  className={`w-12 h-6 rounded-full transition-colors ${
                    inputs.vanEnabled ? 'bg-[#73D700]' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full transition-transform ${
                      inputs.vanEnabled ? 'translate-x-6' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
              {inputs.vanEnabled && (
                <>
                  <div className="flex items-center gap-4 py-1">
                    <label className="flex items-center gap-1 text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={inputs.pickupEnabled}
                        onChange={() => update('pickupEnabled', !inputs.pickupEnabled)}
                        className="accent-[#73D700]"
                      />
                      Pickup
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-300">
                      <input
                        type="checkbox"
                        checked={inputs.dropEnabled}
                        onChange={() => update('dropEnabled', !inputs.dropEnabled)}
                        className="accent-[#73D700]"
                      />
                      Drop
                    </label>
                  </div>
                  {inputs.pickupEnabled && numField('Pickup Cost / RT', 'pickupCostPerRT', { unit: '₹' })}
                  {inputs.dropEnabled && numField('Drop Cost / RT', 'dropCostPerRT', { unit: '₹' })}
                  <div className="flex items-center justify-between gap-2 py-1">
                    <label className="text-sm text-gray-300">Type</label>
                    <div className="flex rounded overflow-hidden border border-gray-700">
                      {(['dedicated', 'merged'] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => update('vanType', t)}
                          className={`px-3 py-1 text-xs font-medium transition-colors ${
                            inputs.vanType === t
                              ? 'bg-[#73D700] text-[#444444]'
                              : 'bg-[#444444] text-gray-400 hover:text-white'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  {numField('Sharing Buses', 'vanSharingBuses')}
                </>
              )}
            </div>
          )}
        </div>

        {/* 12. Region & State Tax */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="Region & State Tax" open={sections.region} onToggle={() => toggleSection('region')} />
          {sections.region && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 py-1">
                <label className="text-sm text-gray-300">Region</label>
                <div className="flex rounded overflow-hidden border border-gray-700">
                  {(['South', 'North'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => handleRegionChange(r)}
                      className={`px-4 py-1 text-xs font-medium transition-colors ${
                        inputs.region === r
                          ? 'bg-[#73D700] text-[#444444]'
                          : 'bg-[#444444] text-gray-400 hover:text-white'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 py-1">
                {stateOptions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStateToggle(s)}
                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                      inputs.selectedStates.includes(s)
                        ? 'bg-[#73D700]/20 border-[#73D700] text-[#73D700]'
                        : 'border-gray-700 text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              {inputs.selectedStates
                .filter((s) => isNorthFlatState(s))
                .map((s) => (
                  <div key={s} className="flex items-center justify-between gap-2 py-1">
                    <label className="text-xs text-gray-400">{s} flat/mo</label>
                    <input
                      type="number"
                      value={inputs.stateTaxOverrides[s] ?? 0}
                      onChange={(e) =>
                        setInputs((prev) => ({
                          ...prev,
                          stateTaxOverrides: {
                            ...prev.stateTaxOverrides,
                            [s]: parseFloat(e.target.value) || 0,
                          },
                        }))
                      }
                      className="w-24 rounded bg-[#444444]/60 border border-gray-700 px-2 py-1 text-xs text-white text-right focus:border-[#73D700] focus:outline-none"
                    />
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* 13. GST */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <SectionHeader title="GST" open={sections.gst} onToggle={() => toggleSection('gst')} />
          {sections.gst && (
            <div className="flex items-center justify-between py-2">
              <label className="text-sm text-gray-300">GST Slab</label>
              <div className="flex rounded overflow-hidden border border-gray-700">
                {([5, 18] as const).map((slab) => (
                  <button
                    key={slab}
                    onClick={() => update('gstSlab', slab)}
                    className={`px-4 py-1 text-sm font-medium transition-colors ${
                      inputs.gstSlab === slab
                        ? 'bg-[#73D700] text-[#444444]'
                        : 'bg-[#444444] text-gray-400 hover:text-white'
                    }`}
                  >
                    {slab}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL - Results */}
      <div className="lg:w-[60%] space-y-4 overflow-y-auto max-h-[calc(100vh-6rem)]">
        {/* Recommended MinG Header */}
        <div className="rounded-lg border border-[#73D700]/30 bg-[#444444] p-6 text-center">
          <div className="text-xs text-gray-400 uppercase tracking-wide mb-1">
            Recommended MinG
          </div>
          <div className="text-4xl font-bold text-[#73D700]">
            {result.recommendedMinG.toFixed(2)}
            <span className="text-lg text-gray-400 ml-1">per km</span>
          </div>
          {inputs.routeName && (
            <div className="text-sm text-gray-500 mt-1">{inputs.routeName}</div>
          )}
        </div>

        {/* Key Numbers */}
        <div className="rounded-lg border border-gray-700 bg-[#444444] p-4">
          <h3 className="text-sm font-semibold text-[#73D700] uppercase tracking-wide mb-3">
            Key Numbers
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Total Cost/km', value: `${result.totalCostPerKm.toFixed(2)}` },
              { label: 'Margin/km', value: `${result.marginPerKm.toFixed(2)}` },
              { label: 'GST on MinG', value: `${result.gstOnMinG.toFixed(2)}` },
              { label: 'Total incl GST', value: `${result.totalMinGInclGst.toFixed(2)}` },
              { label: 'Monthly km/bus', value: result.monthlyKmPerBus.toLocaleString('en-IN') },
              { label: 'Operating days', value: `~${result.operatingDays}` },
              { label: 'Monthly cost/bus', value: `${(result.monthlyCostPerBus / 100000).toFixed(1)}L` },
              { label: 'Total monthly', value: `${result.totalMonthlyAllBuses.toFixed(1)}L` },
              { label: 'Annual commitment', value: `${result.annualCommitment.toFixed(2)} Cr` },
            ].map((item) => (
              <div key={item.label} className="rounded bg-[#444444]/80 border border-gray-700 p-2 text-center">
                <div className="text-xs text-gray-400">{item.label}</div>
                <div className="text-sm font-bold text-white mt-0.5">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cost Breakdown */}
        <CostBreakdown result={result} />

        {/* Comparable Routes */}
        <ComparableRoutes
          owKm={inputs.owKm}
          busType={inputs.busType}
          region={inputs.region === 'South' ? 'S' : 'N'}
          gstSlab={inputs.gstSlab}
        />

        {/* Sensitivity */}
        <SensitivityTable inputs={inputs} baseResult={result} />

        {/* Tenure Comparison */}
        <TenureComparison inputs={inputs} baseResult={result} />
      </div>
    </div>
  );
}
