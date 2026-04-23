import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// Returns [] if the table doesn't exist (graceful degradation until migration is run).
function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01') return true
  return /relation .* does not exist/i.test(err.message || '')
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const week = req.nextUrl.searchParams.get('week')
  let q = supabase.from('bp_cost_actuals').select('*').order('uploaded_at', { ascending: false })
  if (week && week !== 'latest') q = q.eq('year_week', week)
  const { data, error } = await q
  if (error) {
    if (isMissingTable(error)) return NextResponse.json([], { headers: corsHeaders })
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
  return NextResponse.json(data ?? [], { headers: corsHeaders })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const body = await req.json()
  const rows = Array.isArray(body) ? body : [body]
  if (rows.length === 0) return NextResponse.json({ ok: true, count: 0 }, { headers: corsHeaders })

  const { data, error } = await supabase
    .from('bp_cost_actuals')
    .upsert(rows, { onConflict: 'partner,year_week' })
    .select()

  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: 'bp_cost_actuals table missing — run supabase/migrations/001_bp_cost_actuals.sql' },
        { status: 503, headers: corsHeaders }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
  return NextResponse.json({ ok: true, count: data?.length ?? 0, data }, { headers: corsHeaders })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const week = req.nextUrl.searchParams.get('week')
  if (!week) return NextResponse.json({ error: 'week required' }, { status: 400, headers: corsHeaders })
  const { error } = await supabase.from('bp_cost_actuals').delete().eq('year_week', week)
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: true }, { headers: corsHeaders })
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
  return NextResponse.json({ ok: true }, { headers: corsHeaders })
}
