import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import LoginForm from '@/components/LoginForm'

export default async function LoginPage() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()

  if (data?.user) {
    redirect('/')
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-flix-gray">
      <div className="z-10 w-full max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-flix-white shadow-lg">
        <div className="flex flex-col items-center justify-center space-y-2 border-b border-gray-100 bg-flix-white px-4 py-8 pt-10 text-center sm:px-12">
          <div className="w-16 h-16 rounded-full bg-flix-green flex items-center justify-center shadow-sm mb-2">
            <span className="text-flix-charcoal font-black text-2xl tracking-tighter">FLIX</span>
          </div>
          <h3 className="text-xl font-bold text-flix-charcoal">Global BD Tool</h3>
          <p className="text-sm text-gray-500 font-medium pb-2">
            Sign in using email or Microsoft Azure AD.
          </p>
        </div>
        <div className="flex flex-col px-4 py-6 sm:px-8 bg-flix-white">
          <LoginForm />
        </div>
      </div>
    </div>
  )
}
