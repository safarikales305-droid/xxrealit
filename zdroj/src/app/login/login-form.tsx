'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { FacebookAuthButton } from '@/components/auth/FacebookAuthButton';
import { PortalIntroLink } from '@/components/auth/PortalIntroLink';
import { PasswordField } from '@/components/ui/PasswordField';
import { useAuth } from '@/hooks/use-auth';
import { getBrowserAuthLoginUrl } from '@/lib/api';
import { setWindowLocationHref } from '@/lib/navigation-debug';
import { postLoginHomePath } from '@/lib/post-login-routing';
import { clearPwaInstallDismissed } from '@/lib/pwa-install-storage';
import {
  clearProfileOnboardingSession,
  markJustLoggedIn,
  markJustRegistered,
} from '@/lib/onboarding-popup-session';

import {
  authDividerClass,
  authFormSpacing,
  authInputClass,
  authLabelClass,
  authPrimaryBtnClass,
} from '@/components/auth/auth-form-styles';

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
      clearProfileOnboardingSession();
      if (searchParams.get('registered') === '1') {
        markJustRegistered();
      } else {
        markJustLoggedIn();
      }

      const sessionUser = data.user ?? data.session?.user;
      const role = sessionUser?.role;

      if (role === 'ADMIN') {
        setWindowLocationHref(postLoginHomePath('ADMIN'), 'login-form:admin');
        return;
      }

      let portalWorkerStatus: string | null | undefined = null;
      if (role === 'PORTAL_WORKER') {
        const meRes = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
        if (meRes.ok) {
          const meRaw = (await meRes.json()) as {
            portalWorkerStatus?: string | null;
            user?: { portalWorkerStatus?: string | null; role?: string };
          };
          portalWorkerStatus =
            meRaw.portalWorkerStatus ?? meRaw.user?.portalWorkerStatus ?? 'PENDING_APPROVAL';
        }
        setWindowLocationHref(
          postLoginHomePath(
            'PORTAL_WORKER',
            portalWorkerStatus as 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SUSPENDED' | null,
          ),
          'login-form:portal-worker',
        );
        return;
      }

      const redirectParam =
        searchParams.get('redirect') ??
        searchParams.get('callbackUrl') ??
        (typeof data.redirect === 'string' ? data.redirect : null);
      const rawTarget = redirectParam || '/';
      const target =
        rawTarget.startsWith('/') && !rawTarget.startsWith('//')
          ? rawTarget
          : '/';

      setWindowLocationHref(target, 'login-form:post-login');
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
      <form onSubmit={handleLogin} className={authFormSpacing}>
        <div>
          <label htmlFor="email" className={authLabelClass}>
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
            className={authInputClass}
            placeholder="vas@email.cz"
          />
        </div>
        <div>
          <div className="mb-2.5 flex items-center justify-between gap-2">
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
          <PasswordField
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={setPassword}
            className={authInputClass}
            placeholder="••••••••"
          />
        </div>
        {error ? (
          <div
            className="rounded-2xl border border-red-200/80 bg-red-50 px-4 py-3 text-sm font-medium text-red-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        <button type="submit" disabled={loading} className={authPrimaryBtnClass}>
          {loading ? 'Přihlašuji…' : 'Přihlásit'}
        </button>
      </form>

      <div className={authDividerClass}>
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-zinc-200" />
        </div>
        <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide">
          <span className="bg-white px-3 text-zinc-500">nebo</span>
        </div>
      </div>

      <FacebookAuthButton label="Přihlásit přes Facebook" event="facebook_login_click" />

      <PortalIntroLink className="mt-6" />

      <p className="mt-4 text-center text-[11px] leading-snug text-zinc-500 lg:hidden">
        Klepněte na náhled u okraje obrazovky a zaregistrujte se
      </p>

      <p className="mt-8 border-t border-zinc-100 pt-6 text-center text-sm text-zinc-600">
        Ještě nemáte účet?{' '}
        <Link href={registerHref} className="font-semibold text-orange-600 hover:text-orange-700 hover:underline">
          Založit registraci
        </Link>
      </p>
    </AuthPageShell>
  );
}
