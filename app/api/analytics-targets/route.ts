import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
)

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const region = req.nextUrl.searchParams.get('region')
  const partner = req.nextUrl.searchParams.get('partner')

  let query = supabase
    .from('analytics_targets')
    .select('*')
    .order('line_code', { ascending: true })

  if (region) query = query.eq('region', region)
  if (partner) query = query.ilike('partner', `%${partner}%`)

  const { data, error } = await query

  // Graceful fallback if table doesn't exist
  if (error) {
    if (error.message?.includes('does not exist') || error.code === '42P01') {
      return NextResponse.json([])
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const body = await req.json()
  const rows = Array.isArray(body) ? body : [body]

  const { data, error } = await supabase
    .from('analytics_targets')
    .upsert(rows, { onConflict: 'line_code' })
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const updates = await req.json()
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('analytics_targets')
    .update(updates)
    .eq('id', parseInt(id, 10))
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
