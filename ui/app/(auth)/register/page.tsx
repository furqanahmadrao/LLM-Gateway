'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Registration failed');
      }

      // Successful registration
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-panel border border-border rounded-card p-8 shadow-xl">
      <div className="text-center mb-8">
        <h1 className="text-heading-lg text-text-primary mb-2">Create Account</h1>
        <p className="text-text-secondary">Get started with LLM Gateway</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-status-error/10 border border-status-error/20 rounded-button text-status-error text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-label uppercase text-text-muted mb-2">Full Name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full bg-background border border-border rounded-button px-3 py-2 text-text-primary focus:outline-none focus:border-accent transition-colors"
            placeholder="John Doe"
          />
        </div>

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

        <div>
          <label className="block text-label uppercase text-text-muted mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-background border border-border rounded-button px-3 py-2 text-text-primary focus:outline-none focus:border-accent transition-colors"
            placeholder="••••••••"
            required
            minLength={8}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-accent hover:bg-accent-hover text-[#0A0A0A] font-medium py-2 rounded-button transition-colors disabled:opacity-50 mt-2"
        >
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-text-secondary">
        Already have an account?{' '}
        <Link href="/login" className="text-accent hover:text-accent-hover transition-colors">
          Sign in
        </Link>
      </div>
    </div>
  );
}
