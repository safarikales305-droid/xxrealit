'use client';

import Link from 'next/link';
import type { NestProfileRequirements } from '@/lib/nest-client';

const VERIFIED_BADGE_TOOLTIP =
  'Profil má ověřený e-mail, WhatsApp číslo a vyplněné povinné údaje.';

type Props = {
  requirements: NestProfileRequirements | null | undefined;
  role: string;
  isTipar?: boolean;
  showVerifiedBadge?: boolean;
};

export function ProfileRequirementsCard({
  requirements,
  role,
  isTipar,
  showVerifiedBadge,
}: Props) {
  if (!requirements) return null;

  const checklist = requirements.checklist ?? [];
  const hasUnsatisfied = checklist.some((item) => !item.satisfied);
  const showCard = hasUnsatisfied || !requirements.showVerifiedBadge;

  if (!showCard && requirements.showVerifiedBadge) return null;

  const displayItems =
    checklist.length > 0
      ? checklist
      : [
          ...(requirements.professional ?? []).map((text, i) => ({
            id: `prof-${i}`,
            label: text,
            missingLabel: text,
            satisfied: false,
          })),
          ...(isTipar ? (requirements.tipar ?? []) : []).map((text, i) => ({
            id: `tip-${i}`,
            label: text,
            missingLabel: text,
            satisfied: false,
          })),
        ];

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-amber-950">Stav údajů v profilu</p>
          <p className="mt-1 text-xs text-amber-900/90">
            Zelené položky jsou splněné. Červené je potřeba doplnit nebo ověřit.
          </p>
        </div>
        {hasUnsatisfied ? (
          <Link
            href="/profil/dashboard?tab=settings#profile-details-form"
            className="shrink-0 rounded-full bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-950"
          >
            Doplnit údaje
          </Link>
        ) : null}
      </div>

      <ul className="space-y-1.5 text-sm">
        {displayItems.map((item) => (
          <li
            key={item.id}
            className={item.satisfied ? 'text-emerald-800' : 'text-red-800'}
          >
            {item.satisfied ? '✅' : '❌'}{' '}
            {item.satisfied ? item.label : item.missingLabel}
          </li>
        ))}
      </ul>

      {requirements.showVerifiedBadge ? (
        <p
          className="text-xs font-semibold text-emerald-800"
          title={VERIFIED_BADGE_TOOLTIP}
        >
          ✓ Ověřený štítek je aktivní. {VERIFIED_BADGE_TOOLTIP}
        </p>
      ) : null}
    </div>
  );
}

export { VERIFIED_BADGE_TOOLTIP };
