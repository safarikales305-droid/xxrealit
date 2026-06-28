import type { Metadata } from 'next';
import { LegalPageShell } from '@/components/legal/LegalPageShell';
import { PortalTermsHtml } from '@/components/legal/PortalTermsHtml';
import { fetchCurrentPortalTerms } from '@/lib/portal-terms';
import { TermsUnavailableSupport } from '@/components/support/TermsUnavailableSupport';
import { OperatorContactSupport } from '@/components/support/OperatorContactSupport';

export const metadata: Metadata = {
  title: 'Obchodní podmínky | XXRealit',
  description:
    'Obchodní podmínky a pravidla portálu XXrealit.cz — aktuální verze, kontakt na provozovatele.',
  alternates: {
    canonical: '/obchodni-podminky',
  },
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('cs-CZ', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default async function ObchodniPodminkyPage() {
  const terms = await fetchCurrentPortalTerms();

  if (!terms) {
    return (
      <LegalPageShell title="Obchodní podmínky" breadcrumb="Obchodní podmínky">
        <TermsUnavailableSupport />
      </LegalPageShell>
    );
  }

  return (
    <LegalPageShell title={terms.title} breadcrumb="Obchodní podmínky">
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-500">
        <p>
          <span className="font-semibold text-zinc-700">Verze:</span> {terms.version}
        </p>
        <p>
          <span className="font-semibold text-zinc-700">Poslední úprava:</span>{' '}
          {formatDate(terms.updatedAt)}
        </p>
      </div>

      <section className="mt-8">
        <h2 className="text-lg font-bold text-zinc-900">Obchodní podmínky</h2>
        <div className="mt-3">
          <PortalTermsHtml html={terms.termsHtml} />
        </div>
      </section>

      <section className="mt-10 border-t border-zinc-100 pt-8">
        <h2 className="text-lg font-bold text-zinc-900">Pravidla portálu</h2>
        <div className="mt-3">
          <PortalTermsHtml html={terms.rulesHtml} />
        </div>
      </section>

      <section className="mt-10 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
        <h2 className="text-base font-bold text-zinc-900">Kontakt na provozovatele</h2>
        <OperatorContactSupport />
      </section>
    </LegalPageShell>
  );
}
