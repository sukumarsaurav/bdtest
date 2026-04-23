import { createClient } from '@/utils/supabase/server'
import SignOutToLoginButton from '@/components/SignOutToLoginButton'

export default async function UnauthorizedPage() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-flix-gray">
            <div className="z-10 w-full max-w-md overflow-hidden rounded-xl border border-gray-200 bg-flix-white shadow-lg text-center p-8">
                <div className="mx-auto w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h3 className="text-2xl font-bold text-flix-charcoal mb-2">Access Denied</h3>
                <p className="text-sm text-gray-500 mb-6">
                    The account <strong>{user?.email || 'unknown'}</strong> is not authorized to access this internal tool. Please sign in with an approved Flix email address.
                </p>
                <SignOutToLoginButton />
            </div>
        </div>
    )
}
