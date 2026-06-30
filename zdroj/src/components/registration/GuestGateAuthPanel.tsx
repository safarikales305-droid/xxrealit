'use client';

import { useState } from 'react';
import { FacebookAuthButton } from '@/components/auth/FacebookAuthButton';
import { PortalIntroLink } from '@/components/auth/PortalIntroLink';
import { TermsConsentCheckbox } from '@/components/auth/TermsConsentCheckbox';
import { PasswordField } from '@/components/ui/PasswordField';
import { useAuth } from '@/hooks/use-auth';
import { getBrowserAuthLoginUrl } from '@/lib/api';
import {
  extractTokenFromLoginResponse,
  persistClientAuthToken,
} from '@/lib/auth-client';
import { normalizeAuthUser } from '@/lib/auth-user';
import { setWindowLocationHref } from '@/lib/navigation-debug';
import { closeGuestRegistrationGate } from '@/lib/guest-registration-gate-store';
import { storeFacebookOAuthReturnPath } from '@/lib/facebook-oauth-return';
import { clearPwaInstallDismissed } from '@/lib/pwa-install-storage';
import {
  REGISTRATION_ACCOUNT_TYPES,
  type RegistrationAccountType,
} from '@/lib/registration-account-types';

const inputClass =
  'w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-[15px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20';

type Mode = 'login' | 'register';

type Props = {
  mode: Mode;
  returnTo: string;
  onClose: () => void;
  onSwitchMode: (mode: Mode) => void;
};

export function GuestGateAuthPanel({ mode, returnTo, onClose, onSwitchMode }: Props) {
  const { refresh, setUser } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<RegistrationAccountType>('USER');
  const [termsAccepted, setTermsAccepted] = useState(false);

  async function finishAuth() {
    storeFacebookOAuthReturnPath(returnTo);
    await refresh();
    clearPwaInstallDismissed();
    closeGuestRegistrationGate();
    onClose();
    if (returnTo && returnTo !== '/') {
      setWindowLocationHref(returnTo, 'GuestGateAuthPanel.finishAuth');
    } else {
      window.location.reload();
    }
  }

  async function handleLogin(e: React.FormEvent) {
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
        token?: string;
        accessToken?: string;
        access_token?: string;
        user?: Record<string, unknown>;
        session?: { user?: Record<string, unknown> };
      };
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Přihlášení se nezdařilo.');
        return;
      }
      const token = extractTokenFromLoginResponse(data);
      if (token) {
        persistClientAuthToken(token);
      }
      const sessionUser = data.user ?? data.session?.user;
      const normalized = sessionUser ? normalizeAuthUser(sessionUser) : null;
      if (normalized) setUser(normalized);
      await finishAuth();
    } catch {
      setError('Nelze se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password, confirmPassword, role, termsAccepted }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Registrace selhala.');
        return;
      }
      const loginUrl = getBrowserAuthLoginUrl();
      const loginRes = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const loginData = (await loginRes.json().catch(() => ({}))) as {
        token?: string;
        accessToken?: string;
        access_token?: string;
        user?: Record<string, unknown>;
        session?: { user?: Record<string, unknown> };
      };
      if (loginRes.ok) {
        const token = extractTokenFromLoginResponse(loginData);
        if (token) persistClientAuthToken(token);
        const sessionUser = loginData.user ?? loginData.session?.user;
        const normalized = sessionUser ? normalizeAuthUser(sessionUser) : null;
        if (normalized) setUser(normalized);
        await finishAuth();
        return;
      }
      onSwitchMode('login');
      setError('Účet vytvořen. Přihlaste se prosím.');
    } catch {
      setError('Nelze se spojit se serverem.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={mode === 'login' ? 'Přihlášení' : 'Registrace'}
      onClick={onClose}
    >
      <div
        className="pointer-events-auto relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full px-2 py-1 text-sm font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
          aria-label="Zavřít"
        >
          ✕
        </button>

        <h3 className="pr-8 text-lg font-bold text-zinc-900">
          {mode === 'login' ? 'Přihlásit' : 'Registrovat'}
        </h3>
        <p className="mt-1 text-sm text-zinc-600">
          {mode === 'login'
            ? 'Přihlaste se e-mailem a pokračujte v prohlížení.'
            : 'Vytvořte si účet a pokračujte v prohlížení.'}
        </p>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="mt-5 space-y-4">
            <div>
              <label htmlFor="gate-login-email" className="mb-1 block text-sm font-semibold text-zinc-800">
                E-mail
              </label>
              <input
                id="gate-login-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="gate-login-password" className="mb-1 block text-sm font-semibold text-zinc-800">
                Heslo
              </label>
              <PasswordField
                id="gate-login-password"
                autoComplete="current-password"
                required
                value={password}
                onChange={setPassword}
                className={inputClass}
              />
            </div>
            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? 'Přihlašuji…' : 'Přihlásit'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="mt-5 space-y-3">
            <PortalIntroLink />
            <input
              type="text"
              required
              placeholder="Jméno"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
            <input
              type="email"
              required
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            <input
              type="tel"
              required
              placeholder="Telefon"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={inputClass}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as RegistrationAccountType)}
              className={inputClass}
            >
              {REGISTRATION_ACCOUNT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <PasswordField
              id="gate-register-password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={setPassword}
              className={inputClass}
              placeholder="Heslo (min. 6 znaků)"
            />
            <PasswordField
              id="gate-register-confirm"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={setConfirmPassword}
              className={inputClass}
              placeholder="Potvrzení hesla"
            />
            {error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                {error}
              </p>
            ) : null}
            <TermsConsentCheckbox checked={termsAccepted} onChange={setTermsAccepted} />
            <button
              type="submit"
              disabled={loading || !termsAccepted}
              className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {loading ? 'Vytvářím účet…' : 'Registrovat'}
            </button>
          </form>
        )}

        <div className="relative my-5">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-zinc-200" />
          </div>
          <div className="relative flex justify-center text-xs font-medium uppercase tracking-wide">
            <span className="bg-white px-3 text-zinc-500">nebo</span>
          </div>
        </div>

        <FacebookAuthButton
          label="Přihlásit přes Facebook"
          event={mode === 'login' ? 'facebook_login_click' : 'facebook_register_click'}
          disabled={mode === 'register' && !termsAccepted}
        />

        <p className="mt-4 text-center text-sm text-zinc-600">
          {mode === 'login' ? (
            <>
              Nemáte účet?{' '}
              <button
                type="button"
                onClick={() => onSwitchMode('register')}
                className="font-semibold text-orange-600 hover:underline"
              >
                Registrovat
              </button>
            </>
          ) : (
            <>
              Už máte účet?{' '}
              <button
                type="button"
                onClick={() => onSwitchMode('login')}
                className="font-semibold text-orange-600 hover:underline"
              >
                Přihlásit
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
