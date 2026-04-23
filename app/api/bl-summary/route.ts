import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { BASE_LINES } from '@/lib/baseline'
import { effectiveMinG, deltaVsPc5, computeHealthVsPc5 } from '@/lib/cost-utils'
import type { SeasonalityMap } from '@/lib/cost-utils'

// Force dynamic — this route reads from Supabase at runtime
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'


/**
 * GET /api/bl-summary
 *
 * Returns baseline (BL) line data with pc5 as the SINGLE benchmark.
 * Primary source: Supabase bl2 table.
 * Fallback: lib/baseline.ts (if bl2 table doesn't exist yet).
 * Also returns per-line seasonality map from line_seasonality table.
 */
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  // Try Supabase bl2 table first
  const { data: bl2Data, error } = await supabase
    .from('bl2')
    .select('line_id, line_name, partner, region, buses, bus_type, gst_slab, ow_km, rt, min_g, pc5, pc_gst, delta, monthly_lakhs, oem, body_builder, bus_age_years, manufacture_year, seat_config, original_ming, last_renegotiation_date, last_ming_change, line_start_date, line_end_date')
    .order('line_id', { ascending: true })

  // Fetch seasonality map (line_seasonality table) — paginate past 1000-row default limit
  let seasonality: SeasonalityMap = {}
  let seasonOffset = 0
  const PAGE_SIZE = 1000
  while (true) {
    const { data: seasonPage } = await supabase
      .from('line_seasonality')
      .select('line_id, year_week, factor')
      .range(seasonOffset, seasonOffset + PAGE_SIZE - 1)
    if (!seasonPage || seasonPage.length === 0) break
    for (const row of seasonPage) {
      if (!seasonality[row.line_id]) seasonality[row.line_id] = {}
      seasonality[row.line_id][row.year_week] = row.factor
    }
    seasonOffset += seasonPage.length
    if (seasonPage.length < PAGE_SIZE) break
  }

  let lines: any[]

  if (error || !bl2Data || bl2Data.length === 0) {
    // Fallback to embedded baseline.ts
    lines = BASE_LINES.map((l) => {
      const health = computeHealthVsPc5(l.minG, l.gst, l.pc5)
      const delta = deltaVsPc5(l.minG, l.gst, l.pc5)
      return {
        line_id: l.code,
        line_name: l.route,
        partner: l.partner,
        region: l.region,
        buses: l.buses,
        bus_type: l.type,
        gst_slab: l.gst,
        ow_km: l.owKm,
        rt: l.rt,
        min_g: l.minG,
        pc5: l.pc5,
        delta_pct: delta != null ? +delta.toFixed(1) : null,
        health,
        monthly_lakhs: l.monthly,
        line_start_date: l.startDate ?? null,
        line_end_date: null,
        line_age_years: null,
        is_active: true,
      }
    })
  } else {
    // Use Supabase bl2 data — recompute health/delta + add computed fields
    lines = bl2Data.map((l) => {
      const health = computeHealthVsPc5(l.min_g, l.gst_slab, l.pc5)
      const delta = deltaVsPc5(l.min_g, l.gst_slab, l.pc5)
      // Compute age
      let lineAgeYears: number | null = null
      if (l.line_start_date) {
        const start = new Date(l.line_start_date)
        lineAgeYears = +((today.getTime() - start.getTime()) / (365.25 * 86400000)).toFixed(1)
      }
      // Compute active status
      const isActive = l.line_end_date == null || l.line_end_date >= todayStr
      return {
        ...l,
        delta_pct: delta != null ? +delta.toFixed(1) : null,
        health,
        line_age_years: lineAgeYears,
        is_active: isActive,
      }
    })
  }

  const totalLines = lines.length
  const totalBuses = lines.reduce((s: number, l: any) => s + (l.buses || 0), 0)
  const knownPc = lines.filter((l: any) => l.pc5 != null)
  const avgMinG =
    totalLines > 0
      ? lines.reduce((s: number, l: any) => s + l.min_g, 0) / totalLines
      : 0
  const avgPc =
    knownPc.length > 0
      ? knownPc.reduce((s: number, l: any) => s + (l.pc5 as number), 0) / knownPc.length
      : 0

  const healthBreakdown = {
    healthy: lines.filter((l: any) => l.health === 'healthy').length,
    marginal: lines.filter((l: any) => l.health === 'marginal').length,
    overpaying: lines.filter((l: any) => l.health === 'overpaying').length,
    unknown: lines.filter((l: any) => l.health === 'unknown').length,
  }

  // Compute avg line age (excluding nulls)
  const linesWithAge = lines.filter((l: any) => l.line_age_years != null)
  const avgLineAge = linesWithAge.length > 0
    ? +(linesWithAge.reduce((s: number, l: any) => s + l.line_age_years, 0) / linesWithAge.length).toFixed(1)
    : null

  return NextResponse.json(
    {
      lines,
      summary: {
        totalLines,
        totalBuses,
        avgMinG,
        avgPc,
        healthBreakdown,
        avgLineAge,
        linesWithDateData: linesWithAge.length,
      },
      seasonality,
      source: error ? 'baseline.ts' : 'supabase',
    },
    {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    },
  )
}
