'use client';

import type { NestProfileRequirements } from '@/lib/nest-client';

type Props = {
  requirements: NestProfileRequirements | null | undefined;
  role: string;
  isTipar?: boolean;
};

export function ProfileRequirementsCard({ requirements, role, isTipar }: Props) {
  if (!requirements) return null;

  const professionalRoles = new Set([
    'AGENT',
    'COMPANY',
    'AGENCY',
    'CRAFTSMAN',
    'FINANCIAL_ADVISOR',
    'INVESTOR',
  ]);
  const showProfessional = professionalRoles.has(String(role).toUpperCase());
  const professionalIssues = requirements.professional ?? [];
  const tiparIssues = requirements.tipar ?? [];
  const creditBlocked = requirements.canTopUpCredits === false;
  const tiparBlocked = isTipar
    ? requirements.canUseTipar === false
    : tiparIssues.length > 0;

  const hasContent =
    (showProfessional && professionalIssues.length > 0) ||
    tiparBlocked ||
    creditBlocked;

  if (!hasContent && requirements.showVerifiedBadge) return null;

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 p-4">
      <p className="text-sm font-semibold text-amber-950">Chybějící údaje v profilu</p>
      <p className="text-xs text-amber-900/90">
        Dokud nejsou splněny všechny podmínky, nezobrazí se ověřený štítek a některé funkce zůstanou
        omezené.
      </p>

      {creditBlocked ? (
        <div>
          <p className="text-xs font-semibold text-amber-950">Dobití kreditu</p>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-900">
            {!requirements.canTopUpCredits ? (
              <>
                <li>Ověřte WhatsApp číslo</li>
                <li>Ověřte e-mail</li>
                <li>Vyplňte jméno</li>
              </>
            ) : null}
          </ul>
        </div>
      ) : null}

      {showProfessional && professionalIssues.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-amber-950">Ověřený profesionál</p>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-900">
            {professionalIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {tiparBlocked ? (
        <div>
          <p className="text-xs font-semibold text-amber-950">Tipař</p>
          <ul className="mt-1 list-inside list-disc text-sm text-amber-900">
            {tiparIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {requirements.showVerifiedBadge ? (
        <p className="text-xs font-semibold text-emerald-800">Ověřený štítek je aktivní.</p>
      ) : null}
    </div>
  );

}
