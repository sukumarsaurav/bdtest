import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const dynamic = 'force-dynamic'
export const revalidate = 0


function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01') return true
  return /relation .* does not exist/i.test(err.message || '')
}

/** Valid status transitions. Key = from, value = allowed destinations. */
const TRANSITIONS: Record<string, string[]> = {
  identified: ['proposed', 'rejected'],
  proposed: ['in_discussion', 'rejected'],
  pitched: ['in_discussion', 'rejected'],
  in_discussion: ['agreed', 'rejected'],
  agreed: ['pending_approval', 'rejected'],
  pending_approval: ['effective', 'in_discussion', 'rejected'],
  rejected: ['proposed'],
}

const GST_MULT = (slab: number) => slab === 18 ? 1.13 : 1.0

// ─── GET ────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  // Fetch all renegotiations
  const { data: renegotiations, error } = await supabase
    .from('renegotiations')
    .select('*')
    .order('priority_score', { ascending: false })

  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ renegotiations: [], impact: null })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch bl2 for fleet-level impact metrics
  const { data: bl2Lines } = await supabase
    .from('bl2')
    .select('line_id, min_g, gst_slab, ow_km, rt, buses, monthly_lakhs, pc5, partner, region, line_name, bus_type')

  const lines = bl2Lines || []
  const recs = renegotiations || []

  // Fleet contracted km (all 125 lines)
  const fleetKm = lines.reduce((s, l) => s + l.ow_km * l.rt * 2 * l.buses, 0)

  // Baseline fleet weighted MinG (raw, no GST)
  const baselineMinG = fleetKm > 0
    ? lines.reduce((s, l) => s + l.min_g * l.ow_km * l.rt * 2 * l.buses, 0) / fleetKm
    : 0

  // Build lookup: line_id → latest active renegotiation per status group
  const effectiveRecs = recs.filter(r => r.status === 'effective')
  const agreedRecs = recs.filter(r => ['agreed', 'pending_approval', 'effective'].includes(r.status))
  const pipelineRecs = recs.filter(r => !['rejected', 'identified'].includes(r.status))

  const buildMinG = (activeRecs: any[]) => {
    const rMap = new Map<string, number>()
    activeRecs.forEach(r => {
      if (r.target_min_g != null) rMap.set(r.line_id, r.target_min_g)
    })
    if (fleetKm === 0) return baselineMinG
    return lines.reduce((s, l) => {
      const mg = rMap.get(l.line_id) ?? l.min_g
      return s + mg * l.ow_km * l.rt * 2 * l.buses
    }, 0) / fleetKm
  }

  const effectiveMinG = buildMinG(effectiveRecs)
  const agreedMinG = buildMinG(agreedRecs)
  const pipelineMinG = buildMinG(pipelineRecs)

  // Monthly savings from effective deals
  const effectiveMonthlySavingL = effectiveRecs.reduce((s, r) => {
    const line = lines.find(l => l.line_id === r.line_id)
    if (!line || !r.old_min_g || !r.target_min_g) return s
    const buses = r.affected_buses ?? line.buses
    const km = line.ow_km * line.rt * 2 * buses
    const oldEff = r.old_min_g * GST_MULT(r.old_gst_slab ?? line.gst_slab)
    const newEff = r.target_min_g * GST_MULT(r.new_gst_slab ?? r.old_gst_slab ?? line.gst_slab)
    return s + Math.max(0, oldEff - newEff) * km / 1e5
  }, 0)

  return NextResponse.json({
    renegotiations: recs,
    bl2Lines: lines,
    impact: {
      fleetKm,
      baselineMinG: +baselineMinG.toFixed(2),
      effectiveMinG: +effectiveMinG.toFixed(2),
      agreedMinG: +agreedMinG.toFixed(2),
      pipelineMinG: +pipelineMinG.toFixed(2),
      realisedImpact: +(effectiveMinG - baselineMinG).toFixed(2),
      agreedImpact: +(agreedMinG - baselineMinG).toFixed(2),
      pipelineImpact: +(pipelineMinG - baselineMinG).toFixed(2),
      effectiveMonthlySavingL: +effectiveMonthlySavingL.toFixed(1),
      effectiveCount: effectiveRecs.length,
      agreedCount: agreedRecs.length,
      pipelineCount: pipelineRecs.length,
    },
  })
}

// ─── POST ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  try {
    const body = await req.json()

    // Auto-populate old_min_g and old_gst_slab from bl2
    const { data: bl2 } = body.line_id
      ? await supabase.from('bl2').select('min_g, gst_slab, partner, region, line_name').eq('line_id', body.line_id).single()
      : { data: null }

    // Check for duplicate active renegotiation
    if (body.line_id) {
      const { data: existing } = await supabase
        .from('renegotiations')
        .select('id, status')
        .eq('line_id', body.line_id)
        .not('status', 'in', '("rejected","effective")')
      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: `Active renegotiation already exists for ${body.line_id} (id: ${existing[0].id})` },
          { status: 409 },
        )
      }
    }

    // Build insert payload with only known columns
    const insertPayload: Record<string, unknown> = {
      line_id: body.line_id,
      line_name: body.line_name ?? bl2?.line_name ?? null,
      partner: body.partner ?? bl2?.partner ?? null,
      region: body.region ?? bl2?.region ?? null,
      current_min_g: body.current_min_g ?? bl2?.min_g ?? body.old_min_g ?? null,
      target_min_g: body.target_min_g ? parseFloat(body.target_min_g) : null,
      old_ming: body.old_min_g ?? bl2?.min_g ?? null,
      old_gst_slab: body.old_gst_slab ?? bl2?.gst_slab ?? null,
      new_gst_slab: body.new_gst_slab ?? null,
      status: body.status || 'proposed',
      priority_score: body.priority_score ?? 0,
      monthly_savings: body.monthly_savings ?? 0,
      owner: body.owner || null,
      notes: body.notes || null,
      affected_buses: body.affected_buses ?? null,
      input_mode: body.input_mode || 'delta',
      status_changed_at: new Date().toISOString(),
      status_history: JSON.stringify([
        { status: body.status || 'proposed', at: new Date().toISOString(), by: body.owner || 'system' },
      ]),
    }

    const { data, error } = await supabase.from('renegotiations').insert(insertPayload).select().single()
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ error: 'table missing' }, { status: 503 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json(data, { status: 201 })
  } catch (err: any) {
    console.error('POST /api/renegotiations error:', err)
    return NextResponse.json({ error: err?.message || 'Unknown error' }, { status: 500 })
  }
}

// ─── PATCH ──────────────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const body = await req.json()
  const { status: newStatus, ...rest } = body

  // Fetch current record
  const { data: current, error: fetchErr } = await supabase
    .from('renegotiations')
    .select('*')
    .eq('id', parseInt(id, 10))
    .single()
  if (fetchErr || !current) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  const updates: Record<string, unknown> = {
    ...rest,
    updated_at: new Date().toISOString(),
  }

  // Status transition validation
  if (newStatus && newStatus !== current.status) {
    const allowed = TRANSITIONS[current.status]
    if (!allowed || !allowed.includes(newStatus)) {
      return NextResponse.json(
        { error: `Invalid transition: ${current.status} → ${newStatus}. Allowed: ${allowed?.join(', ') || 'none'}` },
        { status: 422 },
      )
    }
    updates.status = newStatus
    updates.status_changed_at = new Date().toISOString()

    // Append to status_history
    const history = Array.isArray(current.status_history) ? current.status_history : []
    history.push({
      status: newStatus,
      from: current.status,
      at: new Date().toISOString(),
      by: rest.owner || rest.approved_by || 'system',
      note: rest.approval_note || rest.notes || undefined,
    })
    updates.status_history = history

    // Status-specific timestamps
    if (newStatus === 'pitched') updates.pitched_at = updates.pitched_at || new Date().toISOString()
    if (newStatus === 'in_discussion') updates.discussion_started_at = updates.discussion_started_at || new Date().toISOString()
    if (newStatus === 'accepted') updates.accepted_at = updates.accepted_at || new Date().toISOString()
    if (newStatus === 'pending_approval') { /* just set status */ }
    if (newStatus === 'effective') updates.effective_at = updates.effective_at || new Date().toISOString()
  }

  // Update the record
  const { data: updated, error: updateErr } = await supabase
    .from('renegotiations')
    .update(updates)
    .eq('id', parseInt(id, 10))
    .select()
    .single()

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // On effective: update bl2
  if (newStatus === 'effective' && updated) {
    const agreedRate = updated.new_ming ?? updated.target_min_g
    const newGst = updated.new_gst_slab ?? updated.old_gst_slab

    if (agreedRate && updated.line_id) {
      // Backfill new_ming
      if (!updated.new_ming) {
        await supabase.from('renegotiations').update({ new_ming: agreedRate }).eq('id', parseInt(id, 10))
      }

      const bl2Updates: Record<string, unknown> = {
        min_g: agreedRate,
        last_renegotiation_date: new Date().toISOString().split('T')[0],
        last_ming_change: agreedRate - (updated.old_min_g || updated.current_min_g || agreedRate),
      }
      if (newGst != null) bl2Updates.gst_slab = newGst

      const { error: bl2Err } = await supabase
        .from('bl2')
        .update(bl2Updates)
        .eq('line_id', updated.line_id)

      if (bl2Err) {
        return NextResponse.json({
          ...updated, bl2Updated: false,
          bl2Error: `bl2 update failed: ${bl2Err.message}`,
        }, { status: 207 })
      }

      // Verify
      const { data: verify } = await supabase.from('bl2').select('min_g').eq('line_id', updated.line_id).single()
      const bl2Updated = verify?.min_g != null && Math.abs(verify.min_g - agreedRate) < 0.01

      if (!bl2Updated) {
        return NextResponse.json({
          ...updated, bl2Updated: false,
          bl2Error: `bl2.min_g is ${verify?.min_g}, expected ${agreedRate}`,
        }, { status: 207 })
      }

      return NextResponse.json({ ...updated, bl2Updated: true, newMinG: agreedRate })
    }
  }

  return NextResponse.json(updated)
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  // Fetch record before deleting
  const { data: record } = await supabase
    .from('renegotiations')
    .select('*')
    .eq('id', parseInt(id, 10))
    .single()

  if (!record) {
    return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  }

  // If effective, revert bl2
  let bl2Reverted = false
  if (record.status === 'effective' && record.old_min_g && record.line_id) {
    const revertUpdates: Record<string, unknown> = {
      min_g: record.old_min_g,
      last_renegotiation_date: null,
      last_ming_change: null,
    }
    if (record.old_gst_slab) revertUpdates.gst_slab = record.old_gst_slab

    await supabase.from('bl2').update(revertUpdates).eq('line_id', record.line_id)
    bl2Reverted = true
  }

  // Hard delete
  const { error } = await supabase.from('renegotiations').delete().eq('id', parseInt(id, 10))
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, bl2Reverted, line_id: record.line_id })
}
