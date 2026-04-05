'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/70 focus:ring-2 focus:ring-[#ff6a00]/15';

export default function RegistracePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, confirmPassword }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: unknown;
      };

      if (!res.ok) {
        const detailStr =
          typeof data.details === 'object' && data.details !== null
            ? JSON.stringify(data.details)
            : '';
        setError(
          [data.error, detailStr].filter(Boolean).join(' ') || 'Registrace selhala',
        );
        return;
      }

      router.push('/login?registered=1');
      router.refresh();
    } catch {
      setError('Nelze se spojit se serverem');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-4 py-16 text-zinc-900">
      <div className="w-full max-w-md">
        <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:text-[#ff6a00]">
          ← Domů
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Registrace</h1>
        <p className="mt-2 text-[15px] text-zinc-600">
          Minimálně 6 znaků hesla. Role výchozí: soukromý prodejce.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
              Heslo (min. 6 znaků)
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium">
              Potvrzení hesla
            </label>
            <input
              id="confirm"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={inputClass}
            />
          </div>
          {error ? (
            <p className="text-sm font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-semibold text-white shadow-md transition hover:opacity-95 disabled:opacity-60"
          >
            {loading ? 'Registruji…' : 'Vytvořit účet'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Už máte účet?{' '}
          <Link href="/login" className="font-semibold text-[#e85d00] hover:underline">
            Přihlásit se
          </Link>
        </p>
      </div>
    </div>
  );
}
