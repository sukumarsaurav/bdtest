'use client'

import React, { useState } from 'react'
import { EVModel, ModelResult, Refurbishment } from './types'
import { fmtPerKm, fmtKm } from '@/lib/formatters'

interface Props {
  model: EVModel
  result: ModelResult
  annualKm: number
  showEur: boolean
  eurRate: number
  onChange: (patch: Partial<EVModel>) => void
  onRemove: () => void
  isBest: boolean
}

interface NumFieldProps {
  label: string
  value: number | string | undefined
  onChange: (v: number) => void
  suffix?: string
  step?: number
}

function NumField({ label, value, onChange, suffix, step = 0.1 }: NumFieldProps) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px]">
      <span className="text-gray-500">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value ?? ''}
          step={step}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-full rounded bg-white border border-gray-200 px-2 py-1 text-xs text-[#444444] text-right focus:border-[#73D700] focus:outline-none"
        />
        {suffix && <span className="text-[10px] text-gray-400 whitespace-nowrap">{suffix}</span>}
      </div>
    </label>
  )
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px]">
      <span className="text-gray-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded bg-white border border-gray-200 px-2 py-1 text-xs text-[#444444] focus:border-[#73D700] focus:outline-none"
      />
    </label>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1.5">
      {children}
    </div>
  )
}

export default function VehicleCard({
  model,
  result,
  annualKm,
  showEur,
  eurRate,
  onChange,
  onRemove,
  isBest,
}: Props) {
  const [tab, setTab] = useState<'specs' | 'opex'>('specs')

  if (!model || !result) return null
  const isEV = model.type === 'ev'
  const loanYrs = Math.ceil(model.loanTenureMonths / 12)

  const batteryTriggerKm =
    (model.batteryWarrantyKm ?? 0) + (model.batteryBufferKm ?? 0)
  const batteryEvents = result.batteryEvents
  const firstEvent = batteryEvents[0]
  const optimalMonths = result.optimalTenureMonths
  const optimalYrs = Math.floor(optimalMonths / 12)
  const totalReplacementCost =
    batteryEvents.length * (model.batteryReplacementCostL ?? 0)

  const addRefurb = () => {
    const newRef: Refurbishment = {
      id: `ref-${Date.now()}`,
      name: 'Refurb ' + (model.refurbishments.length + 1),
      costL: 10,
      atYear: 4,
      financed: false,
    }
    onChange({ refurbishments: [...model.refurbishments, newRef] })
  }

  const updateRefurb = (idx: number, patch: Partial<Refurbishment>) => {
    const refs = [...model.refurbishments]
    refs[idx] = { ...refs[idx], ...patch }
    onChange({ refurbishments: refs })
  }

  const removeRefurb = (idx: number) => {
    onChange({ refurbishments: model.refurbishments.filter((_, i) => i !== idx) })
  }

  // Refurb comparison logic
  const refurbComparison = (r: Refurbishment) => {
    const principal = r.costL * 100000
    // One-time: all in ₹/km for that one year
    const oneTimePerKm = annualKm > 0 ? principal / annualKm : 0
    // Financed: EMI × 12 / annualKm per year for financed months
    const months = r.financingMonths ?? 24
    const rRate = (r.interestRatePct ?? 10) / 100 / 12
    const emi =
      rRate > 0
        ? (principal * rRate * Math.pow(1 + rRate, months)) /
          (Math.pow(1 + rRate, months) - 1)
        : principal / months
    const financedPerKmPerYr = annualKm > 0 ? (emi * 12) / annualKm : 0
    const totalFinanced = emi * months
    const totalInterest = totalFinanced - principal
    const recommendFinance = totalInterest < principal * 0.5
    return {
      oneTimePerKm,
      financedPerKmPerYr,
      totalInterest,
      months,
      recommendFinance,
    }
  }

  return (
    <div
      className={`min-w-[360px] w-[360px] rounded-xl border bg-white p-4 flex-shrink-0 ${
        isBest ? 'border-[#73D700] ring-2 ring-[#73D700]/30' : 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-100">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={model.name}
            onChange={(e) => onChange({ name: e.target.value })}
            className="w-full text-sm font-bold text-[#444444] bg-transparent border-none p-0 focus:outline-none focus:ring-1 focus:ring-[#73D700] rounded"
          />
          <input
            type="text"
            value={model.manufacturer}
            onChange={(e) => onChange({ manufacturer: e.target.value })}
            className="w-full text-[11px] text-gray-500 bg-transparent border-none p-0 focus:outline-none focus:ring-1 focus:ring-[#73D700] rounded"
          />
        </div>
        <div className="flex flex-col items-end gap-1 ml-2">
          <button
            onClick={() => onChange({ type: isEV ? 'diesel' : 'ev' })}
            className={`text-[10px] px-2 py-0.5 rounded font-semibold cursor-pointer ${
              isEV ? 'bg-[#73D700]/15 text-[#73D700]' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {isEV ? 'EV' : 'DIESEL'}
          </button>
          {isBest && (
            <span className="text-[9px] px-1.5 py-0.5 bg-[#73D700] text-white rounded font-bold">
              BEST
            </span>
          )}
          <button
            onClick={onRemove}
            className="text-[10px] text-gray-400 hover:text-[#FFAD00] transition"
            aria-label="remove"
          >
            ✕ remove
          </button>
        </div>
      </div>

      {/* Key result header */}
      <div className="mb-3 rounded-md bg-gray-50 border border-gray-200 px-2 py-1.5 text-[10px] flex items-center justify-between">
        <span className="text-gray-500">Weighted avg</span>
        <span className="font-bold text-[#444444]">
          {fmtPerKm(result.weightedAvgPerKm, showEur, eurRate)}
        </span>
      </div>

      {/* Battery warnings */}
      {isEV && result.batteryRiskFlag && firstEvent && (
        <div className="mb-3 rounded-md bg-[#FFAD00]/10 border border-[#FFAD00]/30 px-2 py-1.5 text-[10px] text-[#FFAD00]">
          <span className="font-bold">⚠ Battery risk:</span> Loan tenure ({loanYrs}y /{' '}
          {model.loanTenureMonths}mo) exceeds 1st replacement (Y{firstEvent.year}, {optimalYrs}y
          optimal)
        </div>
      )}
      {isEV && !result.batteryRiskFlag && firstEvent && (
        <div className="mb-3 rounded-md bg-green-50 border border-green-200 px-2 py-1.5 text-[10px] text-green-700">
          <span className="font-bold">💡 Optimal tenure:</span> {optimalYrs}y ({optimalMonths}
          mo) · 1st replacement Y{firstEvent.year} at{' '}
          {(firstEvent.triggerKm / 100000).toFixed(1)} lakh km
        </div>
      )}

      {/* Battery events list (multi-cycle) */}
      {isEV && batteryEvents.length > 0 && (
        <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-[10px] space-y-1">
          <div className="flex items-center justify-between font-bold text-[#444444]">
            <span>🔋 Battery events ({batteryEvents.length})</span>
            {model.batteryReplacementCostL && (
              <span className="text-[#FFAD00]">
                Total: ₹{totalReplacementCost.toFixed(0)}L
              </span>
            )}
          </div>
          {batteryEvents.map((e) => (
            <div key={e.replacementNumber} className="text-gray-700">
              <div>
                <span className="font-semibold text-[#FFAD00]">
                  ⚡ #{e.replacementNumber}
                </span>
                : Year {e.year} (at {(e.triggerKm / 100000).toFixed(1)} lakh km)
              </div>
              <div className="text-[9px] text-[#FFAD00] ml-3">
                └ Warranty ends Y{e.warrantyEndYear} (
                {(e.warrantyEndKm / 100000).toFixed(1)} lakh km) · Buffer zone Y
                {e.warrantyEndYear}–{e.year} 🟡 risk
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-3">
        {(['specs', 'opex'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 text-[11px] font-semibold py-1.5 transition ${
              tab === t
                ? 'text-[#444444] border-b-2 border-[#73D700]'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t === 'specs' ? 'Specs & Financing' : 'Opex & Refurb'}
          </button>
        ))}
      </div>

      {/* SPECS TAB */}
      {tab === 'specs' && (
        <div>
          <SectionLabel>Physical</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Length"
              value={model.lengthM}
              onChange={(v) => onChange({ lengthM: v })}
              suffix="m"
              step={0.5}
            />
            <NumField
              label="Seats"
              value={model.seats}
              onChange={(v) => onChange({ seats: v })}
              step={1}
            />
          </div>

          <SectionLabel>Purchase & Financing</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Vehicle price"
              value={model.vehiclePriceL}
              onChange={(v) => onChange({ vehiclePriceL: v })}
              suffix="₹L"
              step={1}
            />
            <NumField
              label="Financing"
              value={model.financingPct}
              onChange={(v) => onChange({ financingPct: v })}
              suffix="%"
              step={5}
            />
            <NumField
              label="Interest rate"
              value={model.interestRatePct}
              onChange={(v) => onChange({ interestRatePct: v })}
              suffix="%/yr"
              step={0.25}
            />
            <NumField
              label="Loan tenure"
              value={model.loanTenureMonths}
              onChange={(v) => onChange({ loanTenureMonths: v })}
              suffix="mo"
              step={12}
            />
            <NumField
              label="Extension"
              value={model.extensionMonths}
              onChange={(v) => onChange({ extensionMonths: v })}
              suffix="mo"
              step={12}
            />
            <NumField
              label="Margin"
              value={model.marginPct}
              onChange={(v) => onChange({ marginPct: v })}
              suffix="%"
              step={1}
            />
          </div>

          {isEV && (
            <>
              <SectionLabel>EV Battery & Charging</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Battery"
                  value={model.batteryKWh}
                  onChange={(v) => onChange({ batteryKWh: v })}
                  suffix="kWh"
                  step={5}
                />
                <NumField
                  label="Range"
                  value={model.rangeKm}
                  onChange={(v) => onChange({ rangeKm: v })}
                  suffix="km"
                  step={10}
                />
                <NumField
                  label="Consumption"
                  value={model.energyConsumptionKWhPerKm}
                  onChange={(v) => onChange({ energyConsumptionKWhPerKm: v })}
                  suffix="kWh/km"
                  step={0.05}
                />
                <NumField
                  label="Charging rate"
                  value={model.chargingOrFuelCostPerUnit}
                  onChange={(v) => onChange({ chargingOrFuelCostPerUnit: v })}
                  suffix="₹/kWh"
                  step={0.5}
                />
                <TextField
                  label="Charging time"
                  value={model.chargingTimeHrs ?? ''}
                  onChange={(v) => onChange({ chargingTimeHrs: v })}
                />
              </div>

              <SectionLabel>Battery Replacement (by KM)</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Warranty"
                  value={model.batteryWarrantyKm}
                  onChange={(v) => onChange({ batteryWarrantyKm: v })}
                  suffix="km"
                  step={50000}
                />
                <NumField
                  label="Buffer"
                  value={model.batteryBufferKm}
                  onChange={(v) => onChange({ batteryBufferKm: v })}
                  suffix="km"
                  step={25000}
                />
                <div className="col-span-2">
                  <NumField
                    label="Replacement cost"
                    value={model.batteryReplacementCostL}
                    onChange={(v) => onChange({ batteryReplacementCostL: v })}
                    suffix="₹L"
                    step={1}
                  />
                </div>
              </div>
              <div className="mt-2 text-[10px] text-gray-500 italic">
                Trigger every {fmtKm(batteryTriggerKm)} · {batteryEvents.length}{' '}
                replacement{batteryEvents.length === 1 ? '' : 's'} over contract ·{' '}
                {(annualKm / 100000).toFixed(2)} lakh km/yr
              </div>
            </>
          )}

          {!isEV && (
            <>
              <SectionLabel>Engine</SectionLabel>
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Mileage"
                  value={model.mileageKmPerL}
                  onChange={(v) => onChange({ mileageKmPerL: v })}
                  suffix="km/L"
                  step={0.1}
                />
                <NumField
                  label="Diesel price"
                  value={model.chargingOrFuelCostPerUnit}
                  onChange={(v) => onChange({ chargingOrFuelCostPerUnit: v })}
                  suffix="₹/L"
                  step={0.5}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* OPEX TAB */}
      {tab === 'opex' && (
        <div>
          <SectionLabel>Per-km opex</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Maintenance"
              value={model.maintenancePerKm}
              onChange={(v) => onChange({ maintenancePerKm: v })}
              suffix="₹/km"
              step={0.1}
            />
            <NumField
              label="D/H salary"
              value={model.dhSalaryPerKm}
              onChange={(v) => onChange({ dhSalaryPerKm: v })}
              suffix="₹/km"
              step={0.1}
            />
            <NumField
              label="Tolls"
              value={model.tollsPerKm}
              onChange={(v) => onChange({ tollsPerKm: v })}
              suffix="₹/km"
              step={0.1}
            />
            <NumField
              label="Tyres"
              value={model.tyrePerKm}
              onChange={(v) => onChange({ tyrePerKm: v })}
              suffix="₹/km"
              step={0.1}
            />
            <NumField
              label="Admin"
              value={model.adminPerKm}
              onChange={(v) => onChange({ adminPerKm: v })}
              suffix="₹/km"
              step={0.05}
            />
            <NumField
              label="Liasoning"
              value={model.liasoningPerKm}
              onChange={(v) => onChange({ liasoningPerKm: v })}
              suffix="₹/km"
              step={0.05}
            />
            <NumField
              label="Challan"
              value={model.challanPerKm}
              onChange={(v) => onChange({ challanPerKm: v })}
              suffix="₹/km"
              step={0.05}
            />
            <NumField
              label="Van"
              value={model.vanPerKm}
              onChange={(v) => onChange({ vanPerKm: v })}
              suffix="₹/km"
              step={0.05}
            />
            {!isEV && (
              <NumField
                label="AdBlue"
                value={model.adbluePerKm}
                onChange={(v) => onChange({ adbluePerKm: v })}
                suffix="₹/km"
                step={0.1}
              />
            )}
          </div>

          <SectionLabel>Per round-trip (₹)</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            <NumField
              label="Water"
              value={model.waterPerRT}
              onChange={(v) => onChange({ waterPerRT: v })}
              suffix="₹"
              step={25}
            />
            <NumField
              label="Laundry"
              value={model.laundryPerRT}
              onChange={(v) => onChange({ laundryPerRT: v })}
              suffix="₹"
              step={25}
            />
            <NumField
              label="Parking"
              value={model.parkingPerRT}
              onChange={(v) => onChange({ parkingPerRT: v })}
              suffix="₹"
              step={25}
            />
          </div>

          <SectionLabel>Per month</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <NumField
              label="Dashcam"
              value={model.dashcamPerMonth}
              onChange={(v) => onChange({ dashcamPerMonth: v })}
              suffix="₹/mo"
              step={50}
            />
            <NumField
              label="Uniform"
              value={model.uniformPerMonth}
              onChange={(v) => onChange({ uniformPerMonth: v })}
              suffix="₹/mo"
              step={50}
            />
            <NumField
              label="State tax"
              value={model.stateTaxPerMonthL}
              onChange={(v) => onChange({ stateTaxPerMonthL: v })}
              suffix="₹L/mo"
              step={0.01}
            />
            <NumField
              label="AITP"
              value={model.aitpPerMonthL}
              onChange={(v) => onChange({ aitpPerMonthL: v })}
              suffix="₹L/mo"
              step={0.01}
            />
            <NumField
              label="Insurance"
              value={model.insurancePerMonthL}
              onChange={(v) => onChange({ insurancePerMonthL: v })}
              suffix="₹L/mo"
              step={0.01}
            />
          </div>

          <SectionLabel>Refurbishments</SectionLabel>
          <div className="space-y-2">
            {model.refurbishments.map((r, idx) => {
              const cmp = refurbComparison(r)
              return (
                <div
                  key={r.id}
                  className="rounded-md border border-gray-200 bg-gray-50 p-2 space-y-1.5"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={r.name}
                      onChange={(e) => updateRefurb(idx, { name: e.target.value })}
                      className="flex-1 text-[11px] font-semibold bg-white border border-gray-200 rounded px-1.5 py-0.5 text-[#444444] focus:outline-none focus:border-[#73D700]"
                    />
                    <button
                      onClick={() => removeRefurb(idx)}
                      className="text-[10px] text-gray-400 hover:text-[#FFAD00]"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <NumField
                      label="Cost"
                      value={r.costL}
                      onChange={(v) => updateRefurb(idx, { costL: v })}
                      suffix="₹L"
                      step={1}
                    />
                    <NumField
                      label="At year"
                      value={r.atYear}
                      onChange={(v) => updateRefurb(idx, { atYear: v })}
                      step={1}
                    />
                    <label className="flex flex-col gap-0.5 text-[11px]">
                      <span className="text-gray-500">Mode</span>
                      <button
                        onClick={() => updateRefurb(idx, { financed: !r.financed })}
                        className={`text-[10px] rounded px-1.5 py-1 font-semibold ${
                          r.financed
                            ? 'bg-[#73D700]/15 text-[#73D700]'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {r.financed ? 'Financed' : 'One-time'}
                      </button>
                    </label>
                  </div>
                  {r.financed && (
                    <div className="grid grid-cols-2 gap-1.5">
                      <NumField
                        label="Months"
                        value={r.financingMonths ?? 24}
                        onChange={(v) => updateRefurb(idx, { financingMonths: v })}
                        step={6}
                      />
                      <NumField
                        label="Int %"
                        value={r.interestRatePct ?? 10}
                        onChange={(v) => updateRefurb(idx, { interestRatePct: v })}
                        step={0.5}
                      />
                    </div>
                  )}
                  <div className="text-[10px] text-gray-600 space-y-0.5">
                    <div>
                      <span className="font-semibold">One-time:</span>{' '}
                      {fmtPerKm(cmp.oneTimePerKm, showEur, eurRate)} in Y{r.atYear}
                    </div>
                    <div>
                      <span className="font-semibold">Financed:</span>{' '}
                      {fmtPerKm(cmp.financedPerKmPerYr, showEur, eurRate)}/yr ·{' '}
                      {(cmp.months / 12).toFixed(1)}y · +₹{(cmp.totalInterest / 100000).toFixed(1)}
                      L interest
                    </div>
                    <div
                      className={`font-semibold ${
                        cmp.recommendFinance ? 'text-[#73D700]' : 'text-[#FFAD00]'
                      }`}
                    >
                      {cmp.recommendFinance
                        ? '✓ Recommend financing (interest cost moderate)'
                        : '✓ Recommend one-time (interest adds too much)'}
                    </div>
                  </div>
                </div>
              )
            })}
            <button
              onClick={addRefurb}
              className="w-full text-[11px] py-1.5 rounded border border-dashed border-gray-300 text-gray-500 hover:border-[#73D700] hover:text-[#73D700] transition"
            >
              + Add Refurbishment
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
