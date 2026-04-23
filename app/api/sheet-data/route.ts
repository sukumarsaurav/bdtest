import { createClient } from '@/utils/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: corsHeaders })

  const week = req.nextUrl.searchParams.get('week')

  const { data: weeks } = await supabase
    .from('sheet_snapshots')
    .select('year_week, period, pushed_at, source')
    .order('pushed_at', { ascending: false })
    .limit(68)

  if (!week || week === 'latest') {
    const { data } = await supabase
      .from('sheet_snapshots')
      .select('*')
      .order('pushed_at', { ascending: false })
      .limit(1)
      .single()
    if (!data) return NextResponse.json({ noData: true, weeks: weeks ?? [] })
    return NextResponse.json({ ...data, weeks: weeks ?? [] })
  }

  const { data } = await supabase
    .from('sheet_snapshots')
    .select('*')
    .eq('year_week', week)
    .single()

  if (!data) return NextResponse.json({ noData: true, weeks: weeks ?? [] })
  return NextResponse.json({ ...data, weeks: weeks ?? [] })
}
