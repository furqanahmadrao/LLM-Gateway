'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // TODO: Implement password reset API
    await new Promise(resolve => setTimeout(resolve, 1000));
    setSubmitted(true);
    setLoading(false);
  };

  return (
    <div className="bg-panel border border-border rounded-card p-8 shadow-xl">
      <div className="text-center mb-8">
        <h1 className="text-heading-lg text-text-primary mb-2">Reset Password</h1>
        <p className="text-text-secondary">Enter your email to receive instructions</p>
      </div>

      {submitted ? (
        <div className="text-center space-y-4">
          <div className="p-4 bg-live-bg border border-live-border rounded-button text-live">
            If an account exists for {email}, we have sent password reset instructions.
          </div>
          <Link href="/login" className="block text-accent hover:text-accent-hover transition-colors">
            Return to Sign In
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-label uppercase text-text-muted mb-2">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-background border border-border rounded-button px-3 py-2 text-text-primary focus:outline-none focus:border-accent transition-colors"
              placeholder="you@example.com"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-[#0A0A0A] font-medium py-2 rounded-button transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
          
          <div className="mt-6 text-center text-sm text-text-secondary">
            <Link href="/login" className="text-text-muted hover:text-text-primary transition-colors">
              Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
