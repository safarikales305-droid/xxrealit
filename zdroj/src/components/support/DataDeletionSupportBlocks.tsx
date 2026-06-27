'use client';

import { SupportContactButton } from '@/components/support/SupportContactButton';

export function DataDeletionSupportBlock() {
  return (
    <>
      <p>
        Pokud si uživatel přeje odstranit data získaná prostřednictvím Facebook Login, odešle žádost
        přes formulář podpory portálu:
      </p>

      <p className="rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-center">
        <SupportContactButton
          label="Kontaktovat podporu"
          subject="Žádost o smazání dat Facebook účtu"
          category="REPORT_ISSUE"
        />
      </p>
    </>
  );
}

export function DataDeletionContactBlock() {
  return (
    <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4">
      <p className="font-semibold text-zinc-900">Kontakt</p>
      <p className="mt-2">
        <SupportContactButton variant="link" label="Kontaktovat podporu" />
      </p>
      <p className="mt-1">
        <a
          href="https://www.xxrealit.cz"
          className="font-semibold text-[#e85d00] hover:underline"
          rel="noopener noreferrer"
        >
          www.xxrealit.cz
        </a>
      </p>
    </div>
  );
}
