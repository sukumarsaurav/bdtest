'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AppState, Line, Scenario, ChangeType, SheetSnapshot } from '@/types'
import { BASE_LINES } from '@/lib/baseline'

let nextCid = 1
let nextUid = 1

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      lines: BASE_LINES,
      scenarios: [],
      sheetData: null,
      availableWeeks: [],
      selectedWeek: 'latest',
      activeTab: 'command-centre',
      activeRegion: 'all',
      theme: 'light',
      eurRate: 89,
      showEur: false,
      blSearch: '',
      blSelectedBPs: [],
      blTypeFilter: 'all',

      setLines: (lines) => set({ lines }),
      addLine: (l) => set((s) => ({ lines: [...s.lines, l] })),
      updateLine: (code, u) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.code === code ? { ...l, ...u } : l)),
        })),
      deleteLine: (code) =>
        set((s) => ({ lines: s.lines.filter((l) => l.code !== code) })),
      importLines: (lines, mode) =>
        set((s) => ({
          lines: mode === 'replace' ? lines : [...s.lines, ...lines],
        })),

      addScenario: () =>
        set((s) => ({
          scenarios: [
            ...s.scenarios,
            { uid: nextUid++, name: `Scenario ${s.scenarios.length + 1}`, changes: [] },
          ],
        })),
      updateScenario: (uid, u) =>
        set((s) => ({
          scenarios: s.scenarios.map((sc) => (sc.uid === uid ? { ...sc, ...u } : sc)),
        })),
      deleteScenario: (uid) =>
        set((s) => ({ scenarios: s.scenarios.filter((sc) => sc.uid !== uid) })),

      addChange: (uid, type) =>
        set((s) => ({
          scenarios: s.scenarios.map((sc) =>
            sc.uid === uid
              ? { ...sc, changes: [...sc.changes, { cid: nextCid++, type }] }
              : sc
          ),
        })),
      updateChange: (uid, cid, u) =>
        set((s) => ({
          scenarios: s.scenarios.map((sc) =>
            sc.uid === uid
              ? {
                  ...sc,
                  changes: sc.changes.map((c) => (c.cid === cid ? { ...c, ...u } : c)),
                }
              : sc
          ),
        })),
      deleteChange: (uid, cid) =>
        set((s) => ({
          scenarios: s.scenarios.map((sc) =>
            sc.uid === uid
              ? { ...sc, changes: sc.changes.filter((c) => c.cid !== cid) }
              : sc
          ),
        })),

      setSheetData: (d) => set({ sheetData: d }),
      setAvailableWeeks: (w) => set({ availableWeeks: w }),
      setSelectedWeek: (w) => set({ selectedWeek: w }),
      setTheme: (t) => set({ theme: t }),
      setEurRate: (r) => set({ eurRate: r }),
      setShowEur: (v) => set({ showEur: v }),
      setActiveRegion: (r) => set({ activeRegion: r }),
      setActiveTab: (t) => set({ activeTab: t }),
      setBlSearch: (s) => set({ blSearch: s }),
      setBlTypeFilter: (f) => set({ blTypeFilter: f }),
      setBlSelectedBPs: (bps) => set({ blSelectedBPs: bps }),
    }),
    {
      name: 'flix-bd-store',
      partialize: (state) => ({
        lines: state.lines,
        scenarios: state.scenarios,
        theme: state.theme,
        eurRate: state.eurRate,
        showEur: state.showEur,
        activeRegion: state.activeRegion,
        blSelectedBPs: state.blSelectedBPs,
        blTypeFilter: state.blTypeFilter,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            // Migrate from old flix_scenarios localStorage
            try {
              const old = localStorage.getItem('flix_scenarios')
              if (old && state.scenarios.length === 0) {
                const parsed = JSON.parse(old)
                if (Array.isArray(parsed) && parsed.length > 0) {
                  state.scenarios = parsed.map((s: Scenario, i: number) => ({
                    ...s,
                    uid: s.uid || i + 1,
                  }))
                }
              }
            } catch {}
            // Ensure baseline lines are up to date (125 → 128 fix)
            if (state.lines.length < BASE_LINES.length) {
              state.lines = BASE_LINES
            }
            // Sync nextUid/nextCid
            state.scenarios.forEach((s) => {
              if (s.uid >= nextUid) nextUid = s.uid + 1
              s.changes.forEach((c) => {
                if (c.cid >= nextCid) nextCid = c.cid + 1
              })
            })
          }
        }
      },
    }
  )
)
