'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/70 focus:ring-2 focus:ring-[#ff6a00]/15';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
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
        success?: boolean;
        error?: string;
        details?: string;
      };

      if (!res.ok || !data.success) {
        const msg = [data.details, data.error].filter(Boolean).join(' — ');
        setError(
          msg.trim() || 'Neplatný e-mail nebo heslo',
        );
        return;
      }

      await refresh();

      const callbackUrl =
        searchParams.get('callbackUrl') ??
        searchParams.get('from') ??
        '/panel';

      router.push(callbackUrl.startsWith('/') ? callbackUrl : '/panel');
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
        <Link
          href="/"
          className="text-sm font-semibold text-[#e85d00] hover:text-[#ff6a00]"
        >
          ← Zpět
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Přihlášení</h1>
        <p className="mt-2 text-[15px] text-zinc-600">
          Přihlaste se pro přístup k uživatelskému panelu.
        </p>

        <form onSubmit={(e) => void onSubmit(e)} className="mt-8 space-y-4">
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
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
              Heslo
            </label>
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
          <Link href="/register" className="font-semibold text-[#e85d00] hover:underline">
            Registrace
          </Link>
        </p>
      </div>
    </div>
  );
}
