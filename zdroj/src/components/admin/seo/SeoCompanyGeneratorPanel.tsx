'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  nestAdminCompanySeoCancel,
  nestAdminCompanySeoGenerateBatch,
  nestAdminCompanySeoGenerateFilter,
  nestAdminCompanySeoGenerateTest,
  nestAdminCompanySeoPause,
  nestAdminCompanySeoProgress,
  nestAdminCompanySeoResume,
  nestAdminCompanySeoStats,
  type CompanySeoJobView,
  type CompanySeoStats,
} from '@/lib/company-seo-admin-client';

type Props = {
  token: string | null;
};

export function SeoCompanyGeneratorPanel({ token }: Props) {
  const [stats, setStats] = useState<CompanySeoStats | null>(null);
  const [progress, setProgress] = useState<CompanySeoJobView | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(true);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, p] = await Promise.all([
      nestAdminCompanySeoStats(token),
      nestAdminCompanySeoProgress(token),
    ]);
    setStats(s);
    if (p) {
      setActive(p.active);
      setProgress(p.job);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token || !active) return;
    const id = setInterval(() => void refresh(), 3000);
    return () => clearInterval(id);
  }, [token, active, refresh]);

  async function run(label: string, fn: () => Promise<unknown>) {
    if (!token) {
      setError('Chybí přihlášení.');
      return;
    }
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await fn();
      if (!res) throw new Error('Akce se nezdařila.');
      setMsg(label);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl border border-orange-200 bg-orange-50/40 p-5">
      <h2 className="text-lg font-semibold text-zinc-900">SEO registr firem</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Generování unikátních SEO stránek z firemních záznamů XXREALIT. Žádná nová Company se nevytváří —
        pouze propojení přes <code className="text-xs">companyId</code>.
      </p>

      {stats ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="SEO stránek" value={stats.totalPages} />
          <Stat label="Indexovatelných" value={stats.indexable} />
          <Stat label="Bez stránky" value={stats.withoutPage} />
          <Stat label="Průměrné skóre" value={stats.averageScore} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn
          disabled={busy}
          onClick={() =>
            void run('Testovací firemní stránka spuštěna.', () => nestAdminCompanySeoGenerateTest(token!))
          }
        >
          Vygenerovat testovací firemní stránku
        </Btn>
        <Btn
          disabled={busy}
          onClick={() =>
            void run('Batch 10 spuštěn.', () =>
              nestAdminCompanySeoGenerateBatch(token!, 10, { onlyMissing }, false),
            )
          }
        >
          Vygenerovat 10 firemních stránek
        </Btn>
        <Btn
          disabled={busy}
          onClick={() =>
            void run('Batch 100 spuštěn.', () =>
              nestAdminCompanySeoGenerateBatch(token!, 100, { onlyMissing }, false),
            )
          }
        >
          Vygenerovat 100 firemních stránek
        </Btn>
        <Btn
          disabled={busy}
          onClick={() =>
            void run('Generování pro filtr spuštěno.', () =>
              nestAdminCompanySeoGenerateFilter(token!, { onlyMissing }, false),
            )
          }
        >
          Generovat pro aktuální filtr
        </Btn>
        <Btn disabled={busy || !active} onClick={() => void run('Úloha pokračuje.', () => nestAdminCompanySeoResume(token!))}>
          Pokračovat v úloze
        </Btn>
        <Btn disabled={busy || !active} onClick={() => void run('Úloha pozastavena.', () => nestAdminCompanySeoPause(token!))}>
          Pozastavit
        </Btn>
        <Btn disabled={busy || !active} onClick={() => void run('Úloha zrušena.', () => nestAdminCompanySeoCancel(token!))}>
          Zrušit
        </Btn>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
        <input type="checkbox" checked={onlyMissing} onChange={(e) => setOnlyMissing(e.target.checked)} />
        Pouze firmy bez existující SEO stránky
      </label>

      {progress ? (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-4 text-sm">
          <p>
            <strong>Úloha:</strong> {progress.type} · {progress.status} · {progress.progressPct}%
          </p>
          <p className="mt-1 text-zinc-600">
            Zpracováno {progress.processedCount}/{progress.requestedCount} · vytvořeno {progress.createdCount} ·
            aktualizováno {progress.updatedCount} · přeskočeno {progress.skippedCount} · chyby {progress.failedCount}
          </p>
          {progress.currentItem ? <p className="mt-1 text-zinc-500">Aktuálně: {progress.currentItem}</p> : null}
        </div>
      ) : null}

      {msg ? <p className="mt-3 text-sm text-green-700">{msg}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <p className="mt-4 text-xs text-zinc-500">
        Správa tabulky a detailů:{' '}
        <Link href="/admin/seo/firmy" className="font-semibold text-orange-700 hover:underline">
          SEO firmy
        </Link>
      </p>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-lg font-bold text-zinc-900">{value}</p>
    </div>
  );
}

function Btn({ children, disabled, onClick }: { children: React.ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
