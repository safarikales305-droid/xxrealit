import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell } from '@/components/legal/LegalPageShell';
import { DataDeletionContactBlock, DataDeletionSupportBlock } from '@/components/support/DataDeletionSupportBlocks';

export const metadata: Metadata = {
  title: 'Smazání dat Facebook účtu | XXRealit',
  description:
    'Jak požádat o smazání dat získaných prostřednictvím Facebook Login na portálu XXRealit.',
  robots: { index: true, follow: true },
  alternates: {
    canonical: '/data-deletion',
  },
};

export default function DataDeletionPage() {
  return (
    <LegalPageShell title="Smazání dat Facebook účtu" breadcrumb="Smazání Facebook dat">
      <p>
        Portál XXRealit respektuje právo uživatelů na ochranu osobních údajů v souladu s GDPR.
      </p>

      <DataDeletionSupportBlock />

      <p>
        Po ověření identity budou odstraněna všechna propojená data, zejména:
      </p>

      <ul className="list-disc space-y-1 pl-5">
        <li>propojení Facebook účtu s účtem XXRealit</li>
        <li>identifikátor Facebook účtu (facebookId)</li>
        <li>profilové údaje získané z Facebooku (jméno, profilový obrázek)</li>
        <li>uložené Facebook přístupové tokeny a propojení stránky (pokud existují)</li>
      </ul>

      <p>
        Žádost zpracujeme nejpozději do <strong>30 dnů</strong> od ověření totožnosti. Do zprávy
        uveďte e-mail účtu na XXRealit a pokud je to možné i odkaz na váš Facebook profil nebo jméno
        účtu použité při přihlášení.
      </p>

      <p>
        Účet a data můžete také spravovat přímo v nastavení profilu na XXRealit (odpojení Facebooku,
        smazání účtu). Více informací o zpracování údajů naleznete v{' '}
        <Link href="/privacy" className="font-semibold text-[#e85d00] hover:underline">
          Zásadách ochrany osobních údajů
        </Link>
        .
      </p>

      <DataDeletionContactBlock />
    </LegalPageShell>
  );
}
