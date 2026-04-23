'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'

export default function LoginForm() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
    } else {
      window.location.href = '/'
    }
  }

  const handleMicrosoftLogin = async () => {
    setError(null)
    await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: 'email',
      },
    })
  }

  return (
    <div className="w-full space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-700 border border-red-200 text-center">
          {error}
        </div>
      )}
      
      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div>
          <label className="block text-xs font-bold text-flix-charcoal tracking-wide mb-1.5">
            EMAIL ADDRESS
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="block w-full appearance-none rounded-md border border-gray-300 bg-flix-white px-3 py-2 text-flix-charcoal placeholder-gray-400 focus:border-flix-green focus:outline-none focus:ring-1 focus:ring-flix-green sm:text-sm font-medium"
            placeholder="name@flixbus.com"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-flix-charcoal tracking-wide mb-1.5">
            PASSWORD
          </label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block w-full appearance-none rounded-md border border-gray-300 bg-flix-white px-3 py-2 text-flix-charcoal placeholder-gray-400 focus:border-flix-green focus:outline-none focus:ring-1 focus:ring-flix-green sm:text-sm font-medium"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="flex h-10 w-full items-center justify-center rounded-md border border-transparent bg-flix-green px-4 py-2 text-sm font-bold text-flix-charcoal transition-all hover:bg-[#68C400] focus:outline-none focus:ring-2 focus:ring-flix-green focus:ring-offset-1 disabled:opacity-50 mt-2"
        >
          {loading ? 'Signing in...' : 'Sign In with Email'}
        </button>
      </form>

      <div className="relative my-6 pb-2">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-flix-white px-3 text-gray-500 uppercase font-bold tracking-widest text-[10px]">Or continue with</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleMicrosoftLogin}
        className="flex h-10 w-full items-center justify-center space-x-3 rounded-md border border-gray-200 bg-flix-white px-4 py-2 text-sm font-bold text-flix-charcoal shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 21 21"><path fill="#f25022" d="M1 1h9v9H1z"/><path fill="#00a4ef" d="M1 11h9v9H1z"/><path fill="#7fba00" d="M11 1h9v9h-9z"/><path fill="#ffb900" d="M11 11h9v9h-9z"/></svg>
        <span>Microsoft</span>
      </button>
    </div>
  )
}
