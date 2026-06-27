'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { TermsConsentCheckbox } from '@/components/auth/TermsConsentCheckbox';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { PortalTermsHtml } from '@/components/legal/PortalTermsHtml';
import { useAuth } from '@/hooks/use-auth';
import { nestAcceptTerms } from '@/lib/nest-client';
import { fetchCurrentPortalTerms, type PortalTermsVersion } from '@/lib/portal-terms';

type Props = {
  initialTerms: PortalTermsVersion | null;
};

export function TermsReacceptPageClient({ initialTerms }: Props) {
  const router = useRouter();
  const { apiAccessToken, refresh } = useAuth();
  const [terms] = useState(initialTerms);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!accepted) {
      setError('Musíte souhlasit s aktualizovanými podmínkami');
      return;
    }
    setLoading(true);
    setError(null);
    const res = await nestAcceptTerms(apiAccessToken);
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení souhlasu selhalo');
      return;
    }
    await refresh();
    router.replace('/');
    router.refresh();
  }

  return (
    <AuthPageShell variant="register">
      <h1 className="text-center text-xl font-bold text-zinc-900">Aktualizované obchodní podmínky</h1>
      <p className="mt-2 text-center text-sm text-zinc-600">
        Před pokračováním prosím potvrďte souhlas s aktuální verzí podmínek portálu.
      </p>

      {terms ? (
        <div className="mt-4 max-h-[40vh] overflow-y-auto rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm">
          <p className="mb-2 font-semibold text-zinc-800">
            Verze {terms.version} ·{' '}
            <Link href="/obchodni-podminky" className="text-orange-600 underline" target="_blank">
              celý text
            </Link>
          </p>
          <PortalTermsHtml html={terms.termsHtml} />
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <TermsConsentCheckbox checked={accepted} onChange={setAccepted} id="reacceptTerms" />
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading || !accepted}
          className="w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? 'Ukládám…' : 'Potvrdit a pokračovat'}
        </button>
      </form>
    </AuthPageShell>
  );
}
