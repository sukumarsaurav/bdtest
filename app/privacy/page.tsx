export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Privacy Policy</h1>
        <div className="space-y-6 text-gray-600">
          <p>Last Updated: {new Date().toLocaleDateString()}</p>
          
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Information We Collect</h2>
            <p>As an internal business tool for FlixBus India, we collect the necessary authentication information provided by Microsoft Azure AD, including your email address and basic profile information required to establish a secure session.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">2. How We Use Your Information</h2>
            <p>The information collected is used exclusively to facilitate access control, enforce security policies, and maintain audit logs of application usage. We do not use your information for targeted advertising or external marketing.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">3. Data Storage and Security</h2>
            <p>Your data is securely stored within our infrastructure (Supabase PostgreSQL databases). We employ industry-standard security measures, including Row-Level Security (RLS) and encrypted connections, to protect all data against unauthorized access.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">4. Data Sharing</h2>
            <p>We do not share, sell, or disclose your personal information to any external third parties unless legally compelled to do so by law enforcement.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">5. Your Rights</h2>
            <p>You have the right to request information about the data we hold regarding your account. Please direct all inquiries to your designated FlixBus India IT Administrator.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
