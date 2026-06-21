'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { FacebookAuthButton } from '@/components/auth/FacebookAuthButton';
import { PasswordField } from '@/components/ui/PasswordField';
import { useAuth } from '@/hooks/use-auth';
import { getBrowserAuthLoginUrl } from '@/lib/api';
import { clearPwaInstallDismissed } from '@/lib/pwa-install-storage';

const inputClass =
  'w-full rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3.5 py-2.5 text-sm text-zinc-900 shadow-inner shadow-zinc-100/80 outline-none transition placeholder:text-zinc-400 focus:border-orange-400/80 focus:bg-white focus:ring-2 focus:ring-orange-500/20 sm:px-4 sm:py-3.5 sm:text-[15px]';

export function LoginForm() {
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fb = searchParams.get('facebook');
    if (fb === 'success') return;
    if (fb === 'error') {
      const reason = searchParams.get('reason')?.trim();
      const detail = reason ? ` (${reason})` : '';
      setError(`Přihlášení přes Facebook se nezdařilo.${detail}`);
      if (reason) {
        console.error('[facebook-auth] login error reason=', reason);
      }
    }
  }, [searchParams]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const loginUrl = getBrowserAuthLoginUrl();
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
        document.cookie = `token=${encoded}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
        document.cookie = `access_token=${encoded}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
      }

      await refresh();

      clearPwaInstallDismissed();

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
      <p className="mb-3 hidden text-center text-sm font-medium text-zinc-500 sm:mb-5 sm:block">
        Přihlášení
      </p>

      <form onSubmit={handleLogin} className="space-y-3.5 sm:space-y-5">
        <div>
          <label htmlFor="email" className="mb-1 block text-left text-xs font-semibold text-zinc-800 sm:mb-1.5 sm:text-sm">
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
          <div className="mb-1 flex items-center justify-between gap-2 sm:mb-1.5">
            <label htmlFor="password" className="block text-left text-xs font-semibold text-zinc-800 sm:text-sm">
              Heslo
            </label>
            <Link
              href="/reset-hesla"
              className="shrink-0 text-xs font-semibold text-orange-600 transition hover:text-orange-700 hover:underline sm:text-sm"
            >
              Zapomenuté heslo?
            </Link>
          </div>
          <PasswordField
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={setPassword}
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
          className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-semibold text-white shadow-lg shadow-orange-900/25 transition hover:opacity-[0.97] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-55 sm:py-3.5 sm:text-[15px]"
        >
          {loading ? 'Přihlašuji…' : 'Přihlásit'}
        </button>
      </form>

      <div className="relative my-4 sm:my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200" />
        </div>
        <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide">
          <span className="bg-white px-3 text-zinc-500">nebo</span>
        </div>
      </div>

      <FacebookAuthButton label="Přihlásit přes Facebook" event="facebook_login_click" />

      <p className="mt-4 border-t border-zinc-100 pt-4 text-center text-xs text-zinc-600 sm:mt-8 sm:pt-6 sm:text-sm">
        Ještě nemáte účet?{' '}
        <Link href={registerHref} className="font-semibold text-orange-600 hover:text-orange-700 hover:underline">
          Založit registraci
        </Link>
      </p>
    </AuthPageShell>
  );
}
