'use client';

import { useState } from 'react';
import { trackFacebookAnalytics } from '@/lib/facebook-analytics';
import { storeFacebookOAuthReturnPath } from '@/lib/facebook-oauth-return';
import { isPwaStandalone } from '@/lib/pwa-standalone';

type Props = {
  label: string;
  event: 'facebook_login_click' | 'facebook_register_click';
  className?: string;
};

function FacebookIcon() {
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"
      />
    </svg>
  );
}

function redirectTo(url: string) {
  window.location.href = url;
}

export function FacebookAuthButton({ label, event, className }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    trackFacebookAnalytics(event);
    storeFacebookOAuthReturnPath();

    const loginPath = '/api/auth/facebook/login';
    const standalone = isPwaStandalone();

    try {
      const res = await fetch(loginPath, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string };
      const url = typeof data.url === 'string' ? data.url.trim() : '';
      if (url) {
        if (standalone) {
          console.info('[facebook-auth] PWA standalone redirect to Facebook OAuth');
        }
        redirectTo(url);
        return;
      }
      console.warn('[facebook-auth] missing OAuth URL from login endpoint');
    } catch (err) {
      console.error('[facebook-auth] login endpoint fetch failed', err);
    }

    redirectTo(loginPath);
  }

  return (
    <div className={className}>
      <button
        type="button"
        disabled={loading}
        onClick={() => void handleClick()}
        className="flex w-full items-center justify-center gap-3 rounded-full border border-[#1877F2]/30 bg-[#1877F2] px-4 py-3.5 text-[15px] font-semibold text-white shadow-sm transition hover:bg-[#166fe0] disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? (
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <FacebookIcon />
        )}
        {loading ? 'Přesměrovávám na Facebook…' : label}
      </button>
      <p className="mt-3 text-center text-xs leading-relaxed text-zinc-500">
        Přihlášením přes Facebook souhlasíte se zpracováním údajů podle zásad ochrany osobních
        údajů.
      </p>
    </div>
  );
}
