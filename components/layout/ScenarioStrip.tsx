'use client'

import { useStore } from '@/store/useStore'

export default function ScenarioStrip() {
  const { scenarios, addScenario, activeRegion, setActiveRegion } = useStore()

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6 py-2 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Region</span>
        {(['all', 'N', 'S', 'W'] as const).map((r) => (
          <button
            key={r}
            onClick={() => setActiveRegion(r)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              activeRegion === r
                ? 'bg-[#73D700] text-[#444444]'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
            }`}
          >
            {r === 'all' ? 'All' : r === 'N' ? 'North' : r === 'S' ? 'South' : 'West'}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">{scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''}</span>
        <button
          onClick={addScenario}
          className="text-xs px-3 py-1 bg-[#444444] text-white rounded hover:bg-[#444444] transition-colors"
        >
          + Scenario
        </button>
      </div>
    </div>
  )
}
