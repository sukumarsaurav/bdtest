'use client'

import { useStore } from '@/store/useStore'
import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function Topbar() {
  const { theme, setTheme, showEur, setShowEur, eurRate, setEurRate, lines } = useStore()
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const totalMonthly = lines.reduce((s, l) => s + l.monthly, 0)
  const totalBuses = lines.reduce((s, l) => s + l.buses, 0)

  return (
    <header className="bg-[#444444] text-white px-6 py-3 flex items-center justify-between sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <div className="w-9 h-9 bg-[#73D700] rounded-lg flex items-center justify-center font-bold text-[#444444] text-lg">
          F
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Flix BD Platform</h1>
          <p className="text-xs text-gray-400">{lines.length} lines &middot; {totalBuses} buses &middot; India Operations</p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="text-right">
          <p className="text-xs text-gray-400">Monthly Fleet Outlay</p>
          <p className="text-xl font-bold text-[#73D700]">
            {showEur
              ? `€${(totalMonthly / eurRate * 100000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`
              : `₹${totalMonthly.toFixed(1)}L`}
          </p>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showEur}
              onChange={(e) => setShowEur(e.target.checked)}
              className="accent-[#73D700]"
            />
            <span className="text-gray-300">EUR</span>
          </label>
          {showEur && (
            <input
              type="number"
              value={eurRate}
              onChange={(e) => setEurRate(Number(e.target.value) || 89)}
              className="w-14 bg-[#444444] text-white text-xs px-2 py-1 rounded border border-gray-600"
              title="EUR/INR rate"
            />
          )}
        </div>

        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
          className="p-2 rounded-lg hover:bg-[#444444] transition-colors"
          title="Toggle theme"
        >
          {theme === 'light' ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          )}
        </button>

        <button
          onClick={handleSignOut}
          className="p-2 rounded-lg hover:bg-[#555555] transition-colors text-gray-300 hover:text-white"
          title="Sign out"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </header>
  )
}
