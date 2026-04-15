'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3.5 text-zinc-900 shadow-sm outline-none transition placeholder:text-zinc-400 focus:border-[#ff6a00]/70 focus:ring-2 focus:ring-[#ff6a00]/15';

function ResetHeslaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function requestReset(e: React.FormEvent) {
    console.log('SUBMIT');
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const resetRequestUrl = API_BASE_URL
        ? `${API_BASE_URL}/auth/reset-request`
        : '/api/auth/reset-request';
      console.log('SENDING REQUEST', {
        url: resetRequestUrl,
        method: 'POST',
        email: email.trim(),
      });
      const res = await fetch(resetRequestUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        setError(data.error || 'Požadavek se nezdařil');
        return;
      }
      if (data.success === false) {
        setError(
          data.message ??
            'Odeslání e-mailu se nezdařilo. Zkuste to znovu později nebo kontaktujte podporu.',
        );
        return;
      }
      setMessage(data.message ?? 'Zkontrolujte e-mail.');
    } catch (err) {
      console.error('RESET REQUEST ERROR', err);
      setError('Nelze se spojit se serverem');
    } finally {
      setLoading(false);
    }
  }

  async function submitNewPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!tokenFromUrl) return;
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: tokenFromUrl,
          password,
          confirmPassword,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || 'Obnova hesla selhala');
        return;
      }
      setMessage('Heslo bylo změněno. Můžete se přihlásit.');
      setTimeout(() => router.push('/login'), 1500);
    } catch {
      setError('Nelze se spojit se serverem');
    } finally {
      setLoading(false);
    }
  }

  if (tokenFromUrl) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-4 py-16">
        <div className="w-full max-w-md">
          <Link href="/login" className="text-sm font-semibold text-[#e85d00] hover:underline">
            ← Zpět na přihlášení
          </Link>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900">
            Nové heslo
          </h1>
          <form onSubmit={submitNewPassword} className="mt-8 space-y-4">
            <div>
              <label htmlFor="np" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Nové heslo (min. 6 znaků)
              </label>
              <input
                id="np"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="npc" className="mb-1.5 block text-sm font-medium text-zinc-700">
                Potvrzení hesla
              </label>
              <input
                id="npc"
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
              />
            </div>
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {message ? <p className="text-sm text-green-700">{message}</p> : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
            >
              {loading ? 'Ukládám…' : 'Nastavit heslo'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-4 py-16">
      <div className="w-full max-w-md">
        <Link href="/login" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Zpět na přihlášení
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-zinc-900">
          Obnova hesla
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Zadejte e-mail účtu. Pošleme odkaz na obnovení hesla (Resend).
        </p>
        <form onSubmit={requestReset} className="mt-8 space-y-4">
          <div>
            <label htmlFor="em" className="mb-1.5 block text-sm font-medium text-zinc-700">
              E-mail
            </label>
            <input
              id="em"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          <button
            type="submit"
            disabled={loading}
            onClick={() => console.log('CLICK')}
            className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-sm font-semibold text-white shadow-md disabled:opacity-60"
          >
            {loading ? 'Odesílám…' : 'Odeslat odkaz'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ResetHeslaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-zinc-500">
          Načítání…
        </div>
      }
    >
      <ResetHeslaInner />
    </Suspense>
  );
}
