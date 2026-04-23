import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  if (err.code === '42P01') return true
  return /relation .* does not exist/i.test(err.message || '')
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const { data, error } = await supabase
    .from('bd_actions')
    .select('*')
    .order('priority_score', { ascending: false })
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
  const { data, error } = await supabase
    .from('bd_actions')
    .upsert(body, { onConflict: 'line_id' })
    .select()
    .single()
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json(
        { error: 'bd_actions table missing — run supabase/migrations/002_bd_actions.sql' },
        { status: 503, headers: corsHeaders }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
  return NextResponse.json(data, { headers: corsHeaders })
}

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400, headers: corsHeaders })
  const body = { ...(await req.json()), updated_at: new Date().toISOString() }
  const { data, error } = await supabase.from('bd_actions').update(body).eq('id', id).select().single()
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ error: 'table missing' }, { status: 503, headers: corsHeaders })
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
  return NextResponse.json(data, { headers: corsHeaders })
}

export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400, headers: corsHeaders })
  const { error } = await supabase.from('bd_actions').delete().eq('id', id)
  if (error) {
    if (isMissingTable(error)) return NextResponse.json({ ok: true }, { headers: corsHeaders })
    return NextResponse.json({ error: error.message }, { status: 500, headers: corsHeaders })
  }
  return NextResponse.json({ ok: true }, { headers: corsHeaders })
}
