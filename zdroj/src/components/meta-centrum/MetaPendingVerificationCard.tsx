'use client';

import { useState } from 'react';
import type { MetaCampaignCreateResponse } from '@/lib/nest-client';

export const META_ACCOUNT_QUALITY_URL = 'https://business.facebook.com/accountquality/';
export const META_ADS_MANAGER_URL = 'https://adsmanager.facebook.com/';

export const META_PENDING_VERIFICATION_TITLE =
  '⚠ Meta vyžaduje ověření reklamního účtu';

type Props = {
  message?: string | null;
  technicalDetails?: unknown;
  launchDebug?: import('@/lib/nest-client').MetaLaunchDebugTrace | null;
  onRetry?: () => void;
  retryBusy?: boolean;
  compact?: boolean;
};

export function isPendingMetaVerificationError(
  error?: MetaCampaignCreateResponse['metaApiError'] | null,
  status?: string | null,
  metaVerificationStatus?: string | null,
): boolean {
  if (status === 'pending_meta_verification') return true;
  if (metaVerificationStatus === 'PENDING_META_VERIFICATION') return true;
  if (!error) return false;
  if (error.pendingMetaVerification) return true;
  if (error.errorCode === '31') return true;
  if ((error.errorUserTitle ?? '').toLowerCase().includes('ověřte svůj účet')) return true;
  const responseText = JSON.stringify(error.response ?? '').toLowerCase();
  return responseText.includes('this request requires the user to take a pending action');
}

export function MetaPendingVerificationCard({
  message,
  technicalDetails,
  launchDebug,
  onRetry,
  retryBusy = false,
  compact = false,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const body =
    message?.trim() ||
    [
      'Meta dočasně zablokovala vytváření nových reklam z bezpečnostních důvodů.',
      '',
      'Kampaň, Ad Set i Creative byly úspěšně vytvořeny.',
      'Chybí pouze vytvoření samotné reklamy.',
      '',
      'Pro pokračování otevřete Správce reklam a dokončete ověření účtu.',
    ].join('\n');

  const adminJson = {
    metaApiError: technicalDetails ?? null,
    launchDebug: launchDebug ?? null,
  };

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-950 shadow-sm ${
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'
      }`}
    >
      <p className={`font-semibold ${compact ? 'text-sm' : 'text-base'}`}>
        {META_PENDING_VERIFICATION_TITLE}
      </p>
      <p className={`mt-2 whitespace-pre-wrap leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>
        {body}
      </p>
      <div className={`mt-3 flex flex-wrap gap-2 ${compact ? 'text-xs' : ''}`}>
        <a
          href={META_ACCOUNT_QUALITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
        >
          Otevřít Account Quality
        </a>
        <a
          href={META_ADS_MANAGER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
        >
          Otevřít Ads Manager
        </a>
        {onRetry ? (
          <button
            type="button"
            disabled={retryBusy}
            onClick={onRetry}
            className="inline-flex items-center rounded-lg border border-emerald-400 bg-white px-3 py-1.5 font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:opacity-60"
          >
            Zkusit znovu
          </button>
        ) : null}
      </div>
      <div className="mt-3 border-t border-amber-200/80 pt-2">
        <button
          type="button"
          onClick={() => setDetailsOpen((open) => !open)}
          className="text-xs font-medium text-amber-900 underline decoration-amber-400/70 underline-offset-2 hover:text-amber-950"
        >
          {detailsOpen ? 'Skrýt technické detaily' : 'Technické detaily'}
        </button>
        {detailsOpen ? (
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg border border-amber-200 bg-white/90 p-3 font-mono text-[10px] leading-relaxed text-zinc-900">
            {JSON.stringify(adminJson, null, 2)}
          </pre>
        ) : null}
      </div>
    </div>
  );
}
