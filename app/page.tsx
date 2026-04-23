'use client'

import { useStore } from '@/store/useStore'
import Topbar from '@/components/layout/Topbar'
import TabNav from '@/components/layout/TabNav'
import ScenarioStrip from '@/components/layout/ScenarioStrip'
import CommandCentre from '@/components/command-centre/CommandCentre'
import Analytics from '@/components/analytics/Analytics'
import BaselineTable from '@/components/baseline/BaselineTable'
import PCCalculator from '@/components/calculator/PCCalculator'
import ScenarioList from '@/components/scenarios/ScenarioList'
import EVCompare from '@/components/ev-compare/EVCompare'

export default function Home() {
  const activeTab = useStore((s) => s.activeTab)
  const theme = useStore((s) => s.theme)

  return (
    <div className={theme === 'dark' ? 'dark' : ''}>
      <div className="min-h-screen bg-[#F5F5F5] dark:bg-gray-950">
        <Topbar />
        <TabNav />
        <ScenarioStrip />
        <main className="p-6">
          {activeTab === 'command-centre' && <CommandCentre />}
          {activeTab === 'analytics' && <Analytics />}
          {activeTab === 'baseline' && <BaselineTable />}
          {activeTab === 'calculator' && <PCCalculator />}
          {activeTab === 'scenarios' && <ScenarioList />}
          {activeTab === 'ev-compare' && <EVCompare />}
        </main>
      </div>
    </div>
  )
}
