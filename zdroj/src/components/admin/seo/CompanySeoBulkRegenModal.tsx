'use client';

import { useState } from 'react';
import {
  nestAdminCompanySeoRegenerate,
  nestAdminCompanySeoRegenerateDryRun,
  type CompanySeoDryRunSummary,
  type CompanySeoJobView,
} from '@/lib/company-seo-admin-client';

type Scope = 'errors' | 'noindex' | 'missing_page' | 'changed' | 'all';

type Props = {
  token: string | null;
  open: boolean;
  onClose: () => void;
  onStarted: (job: CompanySeoJobView) => void;
};

const DEFAULT_OPTIONS = {
  regenerateMetadata: true,
  regenerateCanonical: true,
  regenerateStructuredData: true,
  regenerateInternalLinks: true,
  regenerateContent: true,
  regenerateSitemap: true,
  regenerateScore: true,
  regenerateRobots: true,
};

export function CompanySeoBulkRegenModal({ token, open, onClose, onStarted }: Props) {
  const [scope, setScope] = useState<Scope>('all');
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dryRunResult, setDryRunResult] = useState<CompanySeoDryRunSummary | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);

  if (!open) return null;

  async function runDryRun() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const result = await nestAdminCompanySeoRegenerateDryRun(token, { scope, ...options });
      if (!result) throw new Error('Kontrola se nezdařila.');
      setDryRunResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function startRegeneration() {
    if (!token) return;
    if (scope === 'all' && !confirmAll) {
      setError('Potvrďte spuštění pro všechny firmy.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await nestAdminCompanySeoRegenerate(token, {
        filters: { scope, ...options },
        confirmAll: scope === 'all' ? confirmAll : true,
      });
      if (!result) throw new Error('Spuštění se nezdařilo.');
      if ('error' in result && result.error === 'CONFIRMATION_REQUIRED') {
        setError(String(result.message));
        return;
      }
      onStarted(result as CompanySeoJobView);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-zinc-900">Přegenerovat SEO firem</h3>
        <p className="mt-1 text-sm text-zinc-600">
          Hromadná regenerace běží na serveru na pozadí. Můžete zavřít prohlížeč.
        </p>

        <fieldset className="mt-5 space-y-2">
          <legend className="text-sm font-semibold text-zinc-800">Rozsah</legend>
          {(
            [
              ['errors', 'pouze firmy s chybou SEO'],
              ['noindex', 'pouze neindexovatelné firmy'],
              ['missing_page', 'pouze firmy bez SEO stránky'],
              ['changed', 'pouze firmy změněné od posledního generování'],
              ['all', 'všechny firmy'],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="radio"
                name="scope"
                checked={scope === value}
                onChange={() => setScope(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        <fieldset className="mt-5 grid gap-2 sm:grid-cols-2">
          <legend className="col-span-full text-sm font-semibold text-zinc-800">Volby</legend>
          {Object.entries(options).map(([key, checked]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
              />
              {key.replace('regenerate', '').replace(/([A-Z])/g, ' $1').trim()}
            </label>
          ))}
        </fieldset>

        {scope === 'all' ? (
          <label className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <input
              type="checkbox"
              checked={confirmAll}
              onChange={(e) => setConfirmAll(e.target.checked)}
              className="mt-1"
            />
            <span>
              Bude zkontrolováno a případně přegenerováno SEO všech firem. Firemní data, recenze,
              claimy a ověřené kontakty nebudou odstraněny.
            </span>
          </label>
        ) : null}

        {dryRunResult ? (
          <div className="mt-5 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
            <p className="font-semibold text-zinc-900">{dryRunResult.total.toLocaleString('cs-CZ')} firem</p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              <li>OK: {dryRunResult.ok.toLocaleString('cs-CZ')}</li>
              <li>Špatný title: {dryRunResult.badTitle.toLocaleString('cs-CZ')}</li>
              <li>Chybí description: {dryRunResult.missingDescription.toLocaleString('cs-CZ')}</li>
              <li>Chybný canonical: {dryRunResult.badCanonical.toLocaleString('cs-CZ')}</li>
              <li>Potenciální duplicity: {dryRunResult.potentialDuplicates.toLocaleString('cs-CZ')}</li>
              <li>Noindex: {dryRunResult.noindex.toLocaleString('cs-CZ')}</li>
              <li>Chybí structured data: {dryRunResult.missingStructuredData.toLocaleString('cs-CZ')}</li>
              <li>Chybí v sitemap: {dryRunResult.missingSitemap.toLocaleString('cs-CZ')}</li>
              <li>Duplicitní IČO: {dryRunResult.duplicateIco.toLocaleString('cs-CZ')}</li>
            </ul>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700"
          >
            Zrušit
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void runDryRun()}
            className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800 disabled:opacity-50"
          >
            Provést kontrolu bez změn
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void startRegeneration()}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Spustit přegenerování
          </button>
        </div>
      </div>
    </div>
  );
}
