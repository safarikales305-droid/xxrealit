'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';

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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('LOGIN CLICKED');
    setError(null);
    setLoading(true);

    try {
      const loginUrl = API_BASE_URL ? `${API_BASE_URL}/auth/login` : '/api/auth/login';
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        details?: unknown;
        success?: boolean;
        token?: string;
        accessToken?: string;
        redirect?: string;
        access_token?: string;
        user?: {
          id: string;
          email: string;
          role: string;
          createdAt?: string;
          avatar?: string | null;
        };
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
      console.log('LOGIN RESPONSE:', data);

      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : JSON.stringify(data.details ?? data);
        setError(msg || 'Přihlášení se nezdařilo');
        return;
      }

      const token =
        (typeof data.token === 'string' && data.token) ||
        (typeof data.accessToken === 'string' && data.accessToken) ||
        (typeof data.access_token === 'string' && data.access_token) ||
        '';
      if (token.length > 0) {
        localStorage.setItem('token', token);
      }

      const userPayload = data.user ?? data.session?.user;
      if (userPayload) {
        try {
          localStorage.setItem(
            'user',
            JSON.stringify({
              id: userPayload.id,
              email: userPayload.email,
              role: userPayload.role,
              createdAt: userPayload.createdAt ?? new Date().toISOString(),
              avatar: userPayload.avatar ?? null,
            }),
          );
        } catch {
          /* ignore */
        }
      }

      await refresh();

      if (data.success) {
        const callbackUrl = searchParams.get('callbackUrl');
        const redirectTarget =
          typeof data.redirect === 'string' && data.redirect.length > 0
            ? data.redirect
            : '/';
        const target = callbackUrl || redirectTarget;
        router.push(target);
        return;
      }
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
          Při nastaveném <code className="rounded bg-zinc-100 px-1 text-[13px]">API_URL</code> /{' '}
          <code className="rounded bg-zinc-100 px-1 text-[13px]">NEXT_PUBLIC_API_URL</code> proběhne
          přihlášení přes Nest (stejný <code className="rounded bg-zinc-100 px-1 text-[13px]">JWT_SECRET</code>{' '}
          jako v Next). Jinak lokální Prisma v Next.
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
