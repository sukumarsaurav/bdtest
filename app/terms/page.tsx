export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 rounded-xl shadow-sm border border-gray-100">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Terms of Service</h1>
        <div className="space-y-6 text-gray-600">
          <p>Last Updated: {new Date().toLocaleDateString()}</p>
          
          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">1. Acceptance of Terms</h2>
            <p>By accessing and using the FlixBus India Internal BD Tool ("Application"), you accept and agree to be bound by the terms and provision of this agreement.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">2. Use License</h2>
            <p>This Application is intended solely for internal authorized personnel of FlixBus India. Permission is granted to temporarily use the materials and functionality strictly for business purposes and in accordance with FlixBus India company policies.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">3. Security and Authentication</h2>
            <p>Access requires authentication via our authorized identity provider (Microsoft Azure AD). You are responsible for maintaining the confidentiality of your account credentials and for restricting access to your computer or devices.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">4. Modifications</h2>
            <p>We may revise these terms of service for the Application at any time without notice. By using this Application, you are agreeing to be bound by the then-current version of these terms of service.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">5. Contact</h2>
            <p>If you have any questions about these Terms, please contact the FlixBus India IT Administration team.</p>
          </section>
        </div>
      </div>
    </div>
  )
}
