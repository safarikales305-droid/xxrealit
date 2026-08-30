'use client';

import { useEffect, useRef, useState } from 'react';
import {
  closeShortsEmailSignup,
  completeShortsEmailSignup,
  dismissShortsEmailSignup,
  type EmailSignupPublicSettings,
} from '@/hooks/use-shorts-email-signup';
import {
  submitShortsEmailSignup,
  trackShortsSignupEvent,
} from '@/lib/shorts-email-signup-analytics';

type Props = {
  open: boolean;
  settings: EmailSignupPublicSettings | null;
  successMessage: string | null;
  signupSource?: string;
};

export function ShortsEmailSignupModal({ open, settings, successMessage, signupSource }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  if (!open || !settings) return null;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Zadejte platný e-mail.');
      return;
    }
    setLoading(true);
    setError(null);
    trackShortsSignupEvent('shorts_signup_submitted', {
      triggerViewCount: settings.afterViews,
      variantId: settings.variantId,
    });
    const result = await submitShortsEmailSignup(trimmed, signupSource);
    setLoading(false);
    if (!result.success) {
      trackShortsSignupEvent('shorts_signup_failed');
      setError(result.message || 'Nepodařilo se registraci dokončit. Zkuste to prosím znovu.');
      return;
    }
    completeShortsEmailSignup(
      'Poslali jsme vám e-mail, kde si můžete nastavit heslo.',
    );
  };

  if (successMessage) {
    return (
      <div
        className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 p-4 sm:items-center"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <h2 className="text-xl font-bold text-zinc-900">Hotovo.</h2>
          <p className="mt-2 text-sm text-zinc-600">{successMessage}</p>
          <button
            type="button"
            className="mt-6 w-full rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white hover:bg-orange-700"
            onClick={() => closeShortsEmailSignup()}
          >
            Pokračovat ve sledování
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shorts-email-signup-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') dismissShortsEmailSignup();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button
          type="button"
          className="absolute right-3 top-3 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          aria-label="Zavřít"
          onClick={() => {
            trackShortsSignupEvent('shorts_signup_closed');
            dismissShortsEmailSignup();
          }}
        >
          ✕
        </button>
        <h2 id="shorts-email-signup-title" className="pr-8 text-xl font-bold text-zinc-900">
          {settings.title}
        </h2>
        <p className="mt-2 text-sm text-zinc-600">{settings.description}</p>
        <form className="mt-5 space-y-3" onSubmit={(e) => void onSubmit(e)}>
          <label className="block text-sm font-medium text-zinc-700">
            Email
            <input
              ref={inputRef}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => trackShortsSignupEvent('shorts_signup_email_started')}
              placeholder="vas@email.cz"
              className="mt-1 w-full rounded-xl border border-zinc-300 px-4 py-3 text-base outline-none ring-orange-500 focus:ring-2"
              disabled={loading}
            />
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-orange-600 py-3 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
          >
            {loading ? 'Odesílám…' : settings.buttonText}
          </button>
        </form>
        <p className="mt-3 text-center text-xs text-zinc-500">
          Stačí pouze e-mail. Heslo si nastavíte později z odkazu v e-mailu.
        </p>
        <button
          type="button"
          className="mt-4 w-full text-center text-sm text-zinc-500 underline hover:text-zinc-800"
          onClick={() => dismissShortsEmailSignup()}
        >
          {settings.dismissText}
        </button>
      </div>
    </div>
  );
}
