'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/70 focus:ring-2 focus:ring-[#ff6a00]/15';

export function LoginForm() {
  const router = useRouter();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: unknown;
        success?: boolean;
        access_token?: string;
        session?: {
          user?: {
            id: string;
            email: string;
            role: string;
            createdAt: string;
            avatar?: string | null;
          };
        };
      };

      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : JSON.stringify(data.details ?? data);
        setError(msg || 'Přihlášení se nezdařilo');
        return;
      }

      if (typeof data.access_token === 'string' && data.access_token.length > 0) {
        localStorage.setItem('token', data.access_token);
      }
      if (data.session?.user) {
        try {
          localStorage.setItem('user', JSON.stringify(data.session.user));
        } catch {
          /* ignore */
        }
      }

      await refresh();

      router.push('/dashboard');
      router.refresh();
    } catch {
      setError('Nelze se spojit se serverem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-4 py-16 text-zinc-900">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="text-sm font-semibold text-[#e85d00] hover:text-[#ff6a00]"
        >
          ← Zpět
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Přihlášení</h1>
        <p className="mt-2 text-[15px] text-zinc-600">
          Účet je v databázi Next.js (Neon + Prisma). JWT v cookie i v úložišti pro API.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium">
                Heslo
              </label>
              <Link
                href="/reset-hesla"
                className="text-sm font-medium text-[#e85d00] hover:underline"
              >
                Zapomenuté heslo?
              </Link>
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            {loading ? 'Přihlašuji…' : 'Přihlásit'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-zinc-600">
          Nemáte účet?{' '}
          <Link href="/registrace" className="font-semibold text-[#e85d00] hover:underline">
            Registrace
          </Link>
        </p>
      </div>
    </div>
  );
}
