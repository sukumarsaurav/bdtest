import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { transformHubRows } from '@/lib/hubTransform'
import { HubRow } from '@/types'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || authHeader !== `Bearer ${process.env.INGEST_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })
  }
  const body = await req.json()
  const rawArrays: unknown[][] = Array.isArray(body.rawArrays) ? body.rawArrays : []
  const dryRun = req.nextUrl.searchParams.get('dry') === '1'

  // Diagnostic counters — compute BEFORE transformHubRows so we can see exactly
  // what the bookmarklet uploaded vs what our filters rejected. This is the
  // only way to debug "why are rows X missing" without re-running the sync.
  const dataRows = rawArrays.slice(1)
  const diagnostics = {
    rawRowsReceived: dataRows.length,
    droppedNoLineId: 0,
    droppedNoBusKm: 0,
    droppedPartnerTotal: 0,
    droppedNoYearWeek: 0,
    keptRows: 0,
    yearWeekHistogram: {} as Record<string, number>,
    // Sample the rejected rows so we can see exactly what's different
    sampleDroppedNoYearWeek: [] as { lineId: string; period: string; partner: string; col34: unknown }[],
    sampleDroppedNoLineId: [] as { col: unknown[] }[],
  }

  // First-pass row filtering (mirrors transformHubRows but tracks rejection reasons)
  for (const r of dataRows) {
    const lineId = (r as unknown[])[7]   // COL.lineId
    const busKm = (r as unknown[])[8]    // COL.busKm
    const partner = String((r as unknown[])[4] ?? '')
    if (!lineId) {
      diagnostics.droppedNoLineId++
      if (diagnostics.sampleDroppedNoLineId.length < 3) {
        diagnostics.sampleDroppedNoLineId.push({ col: (r as unknown[]).slice(0, 10) })
      }
      continue
    }
    if (!busKm) { diagnostics.droppedNoBusKm++; continue }
    if (partner.includes('Total')) { diagnostics.droppedPartnerTotal++; continue }
    const yearWeek = String((r as unknown[])[34] ?? '')  // COL.yearWeek
    if (!yearWeek) {
      diagnostics.droppedNoYearWeek++
      if (diagnostics.sampleDroppedNoYearWeek.length < 5) {
        diagnostics.sampleDroppedNoYearWeek.push({
          lineId: String(lineId),
          period: String((r as unknown[])[1] ?? ''),
          partner,
          col34: (r as unknown[])[34],
        })
      }
      continue
    }
    diagnostics.keptRows++
    diagnostics.yearWeekHistogram[yearWeek] = (diagnostics.yearWeekHistogram[yearWeek] || 0) + 1
  }

  const allRows = transformHubRows(rawArrays)
  const source = body.source ?? 'bookmarklet'

  // Group rows by yearWeek so a single ingest can carry the full history
  const byWeek = new Map<string, HubRow[]>()
  for (const row of allRows) {
    if (!row.yearWeek) continue
    const bucket = byWeek.get(row.yearWeek)
    if (bucket) bucket.push(row)
    else byWeek.set(row.yearWeek, [row])
  }

  if (byWeek.size === 0) {
    return NextResponse.json(
      { error: 'no rows with valid yearWeek found', diagnostics },
      { status: 400, headers: corsHeaders }
    )
  }

  const pushedAt = new Date().toISOString()
  const snapshots = Array.from(byWeek.entries()).map(([yearWeek, rows]) => ({
    year_week: yearWeek,
    period:    rows[0]?.period ?? '',
    pushed_at: pushedAt,
    source,
    rows,
  }))

  if (!dryRun) {
    const { error } = await supabase
      .from('sheet_snapshots')
      .upsert(snapshots, { onConflict: 'year_week' })

    if (error) return NextResponse.json({ error: error.message, diagnostics }, { status: 500, headers: corsHeaders })
  }

  const storedRows = snapshots.reduce((s, snap) => s + snap.rows.length, 0)

  return NextResponse.json({
    ok: true,
    dryRun,
    weeks: snapshots.length,
    weekList: snapshots.map((s) => s.year_week).sort(),
    totalRows: storedRows,
    diagnostics,
  }, { headers: corsHeaders })
}
