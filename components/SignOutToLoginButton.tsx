'use client'

import { createClient } from '@/utils/supabase/client'
import { useRouter } from 'next/navigation'

export default function SignOutToLoginButton() {
    const supabase = createClient()
    const router = useRouter()

    const handleSignOut = async () => {
        // Clear session so the middleware stops bouncing them back to /unauthorized
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <button
            onClick={handleSignOut}
            className="inline-flex h-10 w-full items-center justify-center rounded-md border border-transparent bg-flix-green px-4 py-2 text-sm font-bold text-flix-charcoal transition-all hover:bg-opacity-90"
        >
            Sign In with Different Account
        </button>
    )
}
