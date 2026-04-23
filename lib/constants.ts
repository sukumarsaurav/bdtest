export const SHAREPOINT = {
  host: 'https://einfachbusfahren-my.sharepoint.com',
  serverRelUrl: '/personal/nityanand_baranwal_flix_com/Documents/Desktop/Office%20Data/Finance%20India%20Work%20Details/Adesh%20Sharma/Bus%20Partner%20Sheets/BP%20Cost%20Snapshot%20Sheet.xlsm',
  targetSheet: 'BP Cost Hub',
}

export const REGIONS = ['N', 'S', 'W'] as const
export const BUS_TYPES = ['Sleeper', 'Hybrid', 'Seater'] as const
export const GST_SLABS = [5, 18] as const

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  fuel_change: 'Fuel Price Change',
  expansion: 'Expansion',
  repurposing: 'Repurposing',
  removal: 'Removal',
  rest_stop: 'Rest Stop',
  cargo_deduction: 'Cargo Deduction',
  toll_change: 'Toll Change',
  payout_revision: 'Payout Revision',
  contract_tenure: 'Contract Tenure',
  custom: 'Custom',
}
