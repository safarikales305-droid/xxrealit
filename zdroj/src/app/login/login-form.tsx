'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';

const inputClass =
  'w-full rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-4 py-3.5 text-[15px] text-zinc-900 shadow-inner shadow-zinc-100/80 outline-none transition placeholder:text-zinc-400 focus:border-orange-400/80 focus:bg-white focus:ring-2 focus:ring-orange-500/20';

export function LoginForm() {
  const searchParams = useSearchParams();
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
          coverImage?: string | null;
          bio?: string | null;
        };
        session?: {
          user?: {
            id: string;
            email: string;
            role: string;
            createdAt: string;
            avatar?: string | null;
            coverImage?: string | null;
            bio?: string | null;
          };
        };
      };

      if (!res.ok) {
        const msg =
          typeof data.error === 'string'
            ? data.error
            : typeof data.details === 'string'
              ? data.details
              : 'Přihlášení se nezdařilo. Zkontrolujte e-mail a heslo.';
        setError(msg);
        return;
      }

      const token =
        (typeof data.token === 'string' && data.token) ||
        (typeof data.accessToken === 'string' && data.accessToken) ||
        (typeof data.access_token === 'string' && data.access_token) ||
        '';
      if (token.length > 0) {
        const encoded = encodeURIComponent(token);
        document.cookie = `token=${encoded}; path=/; SameSite=Lax`;
        document.cookie = `access_token=${encoded}; path=/; SameSite=Lax`;
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
              coverImage: userPayload.coverImage ?? null,
              bio: userPayload.bio ?? null,
            }),
          );
        } catch {
          /* ignore */
        }
      }

      await refresh();

      const redirectParam =
        searchParams.get('redirect') ??
        searchParams.get('callbackUrl') ??
        (typeof data.redirect === 'string' ? data.redirect : null);
      const rawTarget = redirectParam || '/';
      const target =
        rawTarget.startsWith('/') && !rawTarget.startsWith('//')
          ? rawTarget
          : '/';

      window.location.href = target;
    } catch {
      setError('Nelze se spojit se serverem. Zkuste to prosím za chvíli.');
    } finally {
      setLoading(false);
    }
  };

  const registerHref = (() => {
    const r = searchParams.get('redirect') ?? searchParams.get('callbackUrl');
    return r ? `/registrace?redirect=${encodeURIComponent(r)}` : '/registrace';
  })();

  return (
    <AuthPageShell variant="login">
      <p className="mb-6 text-center text-sm font-medium text-zinc-500">Přihlášení</p>

      <form onSubmit={handleLogin} className="space-y-5">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-left text-sm font-semibold text-zinc-800">
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
            placeholder="vas@email.cz"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label htmlFor="password" className="block text-left text-sm font-semibold text-zinc-800">
              Heslo
            </label>
            <Link
              href="/reset-hesla"
              className="shrink-0 text-sm font-semibold text-orange-600 transition hover:text-orange-700 hover:underline"
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
            placeholder="••••••••"
          />
        </div>
        {error ? (
          <div
            className="rounded-xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-orange-900/25 transition hover:opacity-[0.97] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading ? 'Přihlašuji…' : 'Přihlásit se'}
        </button>
      </form>

      <p className="mt-8 border-t border-zinc-100 pt-6 text-center text-sm text-zinc-600">
        Ještě nemáte účet?{' '}
        <Link href={registerHref} className="font-semibold text-orange-600 hover:text-orange-700 hover:underline">
          Založit registraci
        </Link>
      </p>
    </AuthPageShell>
  );
}
