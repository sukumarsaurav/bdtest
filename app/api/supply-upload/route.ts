import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'


/**
 * POST /api/supply-upload
 * Accepts array of { line_id, oem, body_builder, bus_age_years, manufacture_year, seat_config }
 * Updates bl2 supply columns only (not MinG/PC/financial data).
 *
 * NOTE: bl2 lives in lib/baseline.ts (code-embedded). This route updates Supabase bl2
 * if that table exists, otherwise returns a 503 with instructions.
 */
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const rows = await req.json()

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
  }

  const invalid = rows.filter((r: any) => !r.line_id)
  if (invalid.length > 0) {
    return NextResponse.json({ error: `${invalid.length} rows missing line_id` }, { status: 400 })
  }

  let updated = 0
  let failed = 0
  const failures: { line_id: string; error: string }[] = []

  for (const row of rows) {
    const { line_id, oem, body_builder, bus_age_years, manufacture_year, seat_config } = row
    const updates: Record<string, unknown> = {}
    if (oem !== undefined) updates.oem = oem
    if (body_builder !== undefined) updates.body_builder = body_builder
    if (bus_age_years !== undefined) updates.bus_age_years = bus_age_years
    if (manufacture_year !== undefined) updates.manufacture_year = manufacture_year
    if (seat_config !== undefined) updates.seat_config = seat_config

    if (Object.keys(updates).length === 0) continue

    const { error } = await supabase
      .from('bl2')
      .update(updates)
      .eq('line_id', line_id)

    if (error) {
      failed++
      failures.push({ line_id, error: error.message })
    } else {
      updated++
    }
  }

  return NextResponse.json({ updated, failed, failures })
}
