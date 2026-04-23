'use client'

import { useStore } from '@/store/useStore'
import { AppState } from '@/types'

const TABS: { key: AppState['activeTab']; label: string }[] = [
  { key: 'command-centre', label: 'Command Centre' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'baseline', label: 'Baseline' },
  { key: 'calculator', label: 'PC Calculator' },
  { key: 'scenarios', label: 'Scenarios' },
  { key: 'ev-compare', label: 'EV Compare' },
]

export default function TabNav() {
  const activeTab = useStore((s) => s.activeTab)

  return (
    <nav className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 px-6">
      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => useStore.setState({ activeTab: tab.key })}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[#73D700] text-[#73D700]'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </nav>
  )
}
