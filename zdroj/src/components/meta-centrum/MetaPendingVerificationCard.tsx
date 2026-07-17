'use client';

import { useState } from 'react';
import type { MetaCampaignCreateResponse, MetaCampaignDraft } from '@/lib/nest-client';

export const META_ACCOUNT_QUALITY_URL = 'https://business.facebook.com/accountquality/';
export const META_ADS_MANAGER_URL = 'https://adsmanager.facebook.com/';
export const META_ADS_MANAGER_ACCOUNT_OVERVIEW_URL =
  'https://adsmanager.facebook.com/adsmanager/manage/campaigns';

export const META_PENDING_VERIFICATION_TITLE =
  '⚠ Meta z bezpečnostních důvodů blokuje vytvoření reklamy';

type SupportBox = NonNullable<
  NonNullable<MetaCampaignDraft['metaLaunchPayloads']>['pendingVerificationSupport']
>;

type Props = {
  message?: string | null;
  technicalDetails?: unknown;
  launchDebug?: import('@/lib/nest-client').MetaLaunchDebugTrace | null;
  supportBox?: SupportBox | null;
  draft?: MetaCampaignDraft | null;
  onCompleteAd?: () => void;
  onVerifyPreflight?: () => void;
  onRetry?: () => void;
  completeAdBusy?: boolean;
  verifyBusy?: boolean;
  retryBusy?: boolean;
  compact?: boolean;
};

export function isPendingMetaVerificationError(
  error?: MetaCampaignCreateResponse['metaApiError'] | null,
  status?: string | null,
  metaVerificationStatus?: string | null,
  pendingMetaVerification?: boolean | null,
): boolean {
  if (pendingMetaVerification) return true;
  if (status === 'pending_meta_verification') return true;
  if (metaVerificationStatus === 'PENDING_META_VERIFICATION') return true;
  if (!error) return false;
  if (error.pendingMetaVerification) return true;
  if (error.errorCode === '31') return true;
  if (error.errorSubcode === '3858385') return true;
  if ((error.errorUserTitle ?? '').toLowerCase().includes('ověřte svůj účet')) return true;
  const responseText = JSON.stringify(error.response ?? '').toLowerCase();
  return responseText.includes('this request requires the user to take a pending action');
}

function resolveSupportBox(
  supportBox?: SupportBox | null,
  draft?: MetaCampaignDraft | null,
): SupportBox | null {
  if (supportBox) return supportBox;
  const fromDraft = draft?.metaLaunchPayloads?.pendingVerificationSupport;
  return fromDraft ?? null;
}

export function MetaPendingVerificationCard({
  message,
  technicalDetails,
  launchDebug,
  supportBox,
  draft,
  onCompleteAd,
  onVerifyPreflight,
  onRetry,
  completeAdBusy = false,
  verifyBusy = false,
  retryBusy = false,
  compact = false,
}: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const body =
    message?.trim() ||
    [
      'Meta z bezpečnostních důvodů blokuje vytvoření nebo úpravu reklamy.',
      'Campaign, sada reklam a kreativa jsou vytvořené správně.',
      'Dokončete požadovanou kontrolu ve Správci reklam a potom klikněte na Dokončit reklamu.',
    ].join('\n');

  const box = resolveSupportBox(supportBox, draft);
  const copyText = box?.copyBlock ?? '';

  const adminJson = {
    metaApiError: technicalDetails ?? null,
    launchDebug: launchDebug ?? null,
    supportBox: box,
    launchSteps: draft?.metaLaunchSteps ?? null,
  };

  async function copySupportDetails() {
    if (!copyText.trim()) return;
    try {
      await navigator.clipboard.writeText(copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-950 shadow-sm ${
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'
      }`}
    >
      <p className={`font-semibold ${compact ? 'text-sm' : 'text-base'}`}>
        {META_PENDING_VERIFICATION_TITLE}
      </p>
      <p className="mt-1 text-xs font-medium text-amber-900">
        Čeká na bezpečnostní ověření Meta účtu
      </p>
      <p className={`mt-2 whitespace-pre-wrap leading-relaxed ${compact ? 'text-xs' : 'text-sm'}`}>
        {body}
      </p>
      {draft?.metaLaunchSteps ? (
        <ul className="mt-3 space-y-1 text-xs">
          <li>{draft.metaLaunchSteps.campaign?.ok ? '✓' : '○'} Campaign</li>
          <li>{draft.metaLaunchSteps.adSet?.ok ? '✓' : '○'} Ad Set</li>
          <li>{draft.metaLaunchSteps.creative?.ok ? '✓' : '○'} Creative</li>
          <li>{draft.metaLaunchSteps.ad?.ok ? '✓' : '✕'} Ad</li>
        </ul>
      ) : null}
      <div className={`mt-3 flex flex-wrap gap-2 ${compact ? 'text-xs' : ''}`}>
        <a
          href={META_ADS_MANAGER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
        >
          Otevřít Správce reklam
        </a>
        <a
          href={META_ADS_MANAGER_ACCOUNT_OVERVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
        >
          Otevřít Přehled účtu
        </a>
        <a
          href={META_ACCOUNT_QUALITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-medium text-amber-950 shadow-sm transition hover:bg-amber-50"
        >
          Otevřít Account Quality
        </a>
        {onVerifyPreflight ? (
          <button
            type="button"
            disabled={verifyBusy}
            onClick={onVerifyPreflight}
            className="inline-flex items-center rounded-lg border border-sky-400 bg-white px-3 py-1.5 font-medium text-sky-900 shadow-sm transition hover:bg-sky-50 disabled:opacity-60"
          >
            {verifyBusy ? 'Ověřuji…' : 'Znovu ověřit stav'}
          </button>
        ) : null}
        {onCompleteAd ? (
          <button
            type="button"
            disabled={completeAdBusy}
            onClick={onCompleteAd}
            className="inline-flex items-center rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-1.5 font-medium text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {completeAdBusy ? 'Dokončuji…' : 'Dokončit reklamu'}
          </button>
        ) : onRetry ? (
          <button
            type="button"
            disabled={retryBusy}
            onClick={onRetry}
            className="inline-flex items-center rounded-lg border border-emerald-400 bg-white px-3 py-1.5 font-medium text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:opacity-60"
          >
            {retryBusy ? 'Spouštím…' : 'Dokončit reklamu'}
          </button>
        ) : null}
        {copyText ? (
          <button
            type="button"
            onClick={() => void copySupportDetails()}
            className="inline-flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
          >
            {copied ? 'Zkopírováno' : 'Zkopírovat technické údaje pro podporu Meta'}
          </button>
        ) : null}
      </div>
      {box ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg border border-amber-200 bg-white/90 p-3 font-mono text-[10px] leading-relaxed text-zinc-900">
          {box.copyBlock}
        </pre>
      ) : null}
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
