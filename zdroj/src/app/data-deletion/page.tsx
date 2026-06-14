import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell } from '@/components/legal/LegalPageShell';

export const metadata: Metadata = {
  title: 'Smazání dat Facebook účtu | XXRealit',
  description:
    'Jak požádat o smazání dat získaných prostřednictvím Facebook Login na portálu XXRealit.',
  robots: { index: true, follow: true },
  alternates: {
    canonical: 'https://www.xxrealit.cz/data-deletion',
  },
};

export default function DataDeletionPage() {
  return (
    <LegalPageShell title="Smazání dat Facebook účtu" breadcrumb="Smazání Facebook dat">
      <p>
        Portál XXRealit respektuje právo uživatelů na ochranu osobních údajů v souladu s GDPR.
      </p>

      <p>
        Pokud si uživatel přeje odstranit data získaná prostřednictvím Facebook Login, zašle žádost
        na:
      </p>

      <p className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-center text-lg font-semibold text-zinc-900">
        <a href="mailto:info@xxrealit.cz" className="text-[#e85d00] hover:underline">
          info@xxrealit.cz
        </a>
      </p>

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
        Žádost zpracujeme nejpozději do <strong>30 dnů</strong> od ověření totožnosti. Do e-mailu
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

      <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
        <p className="font-semibold text-zinc-900">Kontakt</p>
        <p className="mt-2">
          <a href="mailto:info@xxrealit.cz" className="font-semibold text-[#e85d00] hover:underline">
            info@xxrealit.cz
          </a>
        </p>
        <p className="mt-1">
          <a
            href="https://www.xxrealit.cz"
            className="font-semibold text-[#e85d00] hover:underline"
            rel="noopener noreferrer"
          >
            https://www.xxrealit.cz
          </a>
        </p>
      </div>
    </LegalPageShell>
  );
}
