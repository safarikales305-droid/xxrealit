'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminSeoGenerateAll,
  nestAdminSeoGenerateBatch,
  nestAdminSeoGenerateTest,
  nestAdminSeoGenerationCancel,
  nestAdminSeoGenerationPause,
  nestAdminSeoGenerationProgress,
  nestAdminSeoGenerationResume,
  nestAdminSeoGenerationStats,
  nestAdminSeoRegenerateDrafts,
  nestAdminSeoRegenerateErrors,
  type SeoGenerationJobView,
  type SeoGenerationStats,
  type SeoGenerationTestResult,
} from '@/lib/nest-client';

export default function AdminSeoGeneratorPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<SeoGenerationStats | null>(null);
  const [progress, setProgress] = useState<SeoGenerationJobView | null>(null);
  const [active, setActive] = useState(false);
  const [testResult, setTestResult] = useState<SeoGenerationTestResult | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, p] = await Promise.all([
      nestAdminSeoGenerationStats(token),
      nestAdminSeoGenerationProgress(token),
    ]);
    setStats(s);
    if (p) {
      setActive(p.active);
      setProgress(p.job);
    }
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token || !active) return;
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [token, active, refresh]);

  async function runAction(label: string, fn: () => Promise<unknown>) {
    if (!token) {
      setError('Chybí přihlášení — obnovte stránku.');
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = (await fn()) as { success?: boolean; error?: string; jobId?: string } | null;
      if (res && res.success === false) {
        setError(res.error ?? `${label} selhalo.`);
      } else {
        setMsg(`${label} spuštěno.`);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : `${label} selhalo`);
    } finally {
      setBusy(false);
    }
  }

  async function generateTest() {
    if (!token) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    setTestResult(null);
    try {
      const res = await nestAdminSeoGenerateTest(token);
      if (!res) {
        setError('API nevrátilo odpověď. Zkontrolujte přihlášení a backend.');
        return;
      }
      setTestResult(res);
      setMsg(`Testovací stránka vytvořena (${res.action}).`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Testovací generování selhalo');
    } finally {
      setBusy(false);
    }
  }

  if (!token || user?.role !== 'ADMIN') return null;

  const job = progress;
  const pct = job?.progressPct ?? 0;

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        Šablonový generátor SEO stránek bez AI. Texty se skládají z lokálních šablon podle lokality,
        typu nabídky a dat RÚIAN/ČSÚ.
      </p>

      {stats ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Možné kombinace" value={stats.possibleCombinations} />
          <Stat label="Vytvořené záznamy" value={stats.createdRecords} />
          <Stat label="Publikované" value={stats.published} />
          <Stat label="Indexovatelné" value={stats.indexable} />
          <Stat label="DRAFT" value={stats.draft} />
          <Stat label="noindex" value={stats.noindex} />
          <Stat label="Chyby" value={stats.errors} warn={stats.errors > 0} />
        </div>
      ) : null}

      {stats && !stats.searchConsoleConnected ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {stats.searchConsoleNote}
        </p>
      ) : null}

      <section className="mb-6 space-y-3 rounded-2xl border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Generování</h2>
        <div className="flex flex-wrap gap-2">
          <ActionButton disabled={busy} onClick={() => void generateTest()}>
            Generovat testovací stránku
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() =>
              void runAction('Generování 100 stránek', () =>
                nestAdminSeoGenerateBatch(token, { limit: 100, onlyMissing: true }),
              )
            }
          >
            Generovat 100 stránek
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() =>
              void runAction('Generování 1 000 stránek', () =>
                nestAdminSeoGenerateBatch(token, { limit: 1000, onlyMissing: true }),
              )
            }
          >
            Generovat 1 000 stránek
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={() => void runAction('Generování všech vhodných stránek', () => nestAdminSeoGenerateAll(token))}
          >
            Generovat všechny vhodné stránky
          </ActionButton>
          <ActionButton
            disabled={busy}
            variant="secondary"
            onClick={() => void runAction('Přegenerování DRAFT', () => nestAdminSeoRegenerateDrafts(token))}
          >
            Přegenerovat DRAFT
          </ActionButton>
          <ActionButton
            disabled={busy}
            variant="secondary"
            onClick={() => void runAction('Přegenerování chyb', () => nestAdminSeoRegenerateErrors(token))}
          >
            Přegenerovat ERROR
          </ActionButton>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-3">
          <ActionButton
            disabled={busy || !active}
            variant="secondary"
            onClick={() => void runAction('Pozastavení', () => nestAdminSeoGenerationPause(token, job?.jobId))}
          >
            Pozastavit
          </ActionButton>
          <ActionButton
            disabled={busy}
            variant="secondary"
            onClick={() => void runAction('Pokračování', () => nestAdminSeoGenerationResume(token, job?.jobId))}
          >
            Pokračovat
          </ActionButton>
          <ActionButton
            disabled={busy || !job}
            variant="danger"
            onClick={() => void runAction('Zrušení úlohy', () => nestAdminSeoGenerationCancel(token, job?.jobId))}
          >
            Zrušit úlohu
          </ActionButton>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        {msg ? <p className="text-sm text-green-700">{msg}</p> : null}
      </section>

      {job ? (
        <section className="mb-6 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {job.status === 'RUNNING' ? 'Generování probíhá' : `Stav: ${job.status}`}
            </h2>
            <span className="text-sm text-zinc-500">{pct} %</span>
          </div>
          <div className="mb-3 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-orange-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-sm font-medium">
            {job.processedItems.toLocaleString('cs-CZ')} / {job.totalItems.toLocaleString('cs-CZ')}
          </p>
          <div className="mt-2 grid gap-1 text-sm text-zinc-600 sm:grid-cols-2 lg:grid-cols-4">
            <span>Vytvořeno: {job.createdItems}</span>
            <span>Aktualizováno: {job.updatedItems}</span>
            <span>Přeskočeno: {job.skippedItems}</span>
            <span>Chyby: {job.failedItems}</span>
          </div>
          {job.currentItem ? (
            <p className="mt-2 text-sm text-zinc-500">Aktuálně: {job.currentItem}</p>
          ) : null}
          {job.lastError ? <p className="mt-2 text-sm text-red-600">Poslední chyba: {job.lastError}</p> : null}
          {job.logs.length ? (
            <div className="mt-4 max-h-48 overflow-y-auto rounded-lg bg-zinc-50 p-3 font-mono text-xs">
              {job.logs.map((l, i) => (
                <div key={`${l.at}-${i}`} className={l.level === 'error' ? 'text-red-700' : 'text-zinc-700'}>
                  [{l.at}] {l.message}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {testResult ? (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-5">
          <h2 className="mb-2 text-lg font-semibold text-green-900">Výsledek testu</h2>
          <ul className="space-y-1 text-sm text-green-900">
            <li>
              Veřejná URL:{' '}
              <Link href={testResult.publicPath} className="underline" target="_blank">
                {testResult.publicPath}
              </Link>
            </li>
            <li>Stav: {testResult.status}</li>
            <li>Indexovatelná: {testResult.indexable ? 'ano' : 'ne (noindex)'}</li>
            <li>H1: {testResult.h1}</li>
            <li>Meta Title: {testResult.metaTitle}</li>
            <li>Canonical: {testResult.canonical}</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <Link
              href={testResult.publicPath}
              target="_blank"
              className="rounded-lg bg-green-700 px-3 py-1.5 text-sm text-white"
            >
              Otevřít náhled
            </Link>
            <Link
              href={`/admin/seo/stranky/${testResult.pageId}`}
              className="rounded-lg border border-green-700 px-3 py-1.5 text-sm text-green-900"
            >
              Admin detail →
            </Link>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3">
      <p className={`text-xl font-bold ${warn ? 'text-red-600' : 'text-zinc-900'}`}>{value}</p>
      <p className="text-xs text-zinc-600">{label}</p>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'primary',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const cls =
    variant === 'primary'
      ? 'bg-orange-600 text-white'
      : variant === 'danger'
        ? 'border border-red-300 text-red-700'
        : 'border border-zinc-300 text-zinc-800';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${cls}`}
    >
      {children}
    </button>
  );
}
