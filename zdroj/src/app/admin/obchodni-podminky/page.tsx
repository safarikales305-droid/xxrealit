'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SimpleRichEditor } from '@/components/admin/SimpleRichEditor';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminCreatePortalTermsVersion,
  nestAdminListPortalTermsVersions,
  nestAdminPublishPortalTermsVersion,
  nestAdminUnpublishPortalTermsVersion,
  nestAdminUpdatePortalTermsVersion,
  type PortalTermsVersionRow,
} from '@/lib/nest-client';

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('cs-CZ');
  } catch {
    return iso;
  }
}

export default function AdminObchodniPodminkyPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;

  const [items, setItems] = useState<PortalTermsVersionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [termsHtml, setTermsHtml] = useState('');
  const [rulesHtml, setRulesHtml] = useState('');
  const [operatorContact, setOperatorContact] = useState('');
  const [requireReacceptOnLogin, setRequireReacceptOnLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );
  const published = useMemo(() => items.find((i) => i.isPublished) ?? null, [items]);

  const loadForm = useCallback((row: PortalTermsVersionRow | null) => {
    if (!row) {
      setTitle('');
      setTermsHtml('');
      setRulesHtml('');
      setOperatorContact('');
      setRequireReacceptOnLogin(false);
      setSelectedId(null);
      return;
    }
    setSelectedId(row.id);
    setTitle(row.title);
    setTermsHtml(row.termsHtml);
    setRulesHtml(row.rulesHtml);
    setOperatorContact(row.operatorContact);
    setRequireReacceptOnLogin(row.requireReacceptOnLogin);
  }, []);

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminListPortalTermsVersions(token);
    setItems(data.items);
    const pub = data.items.find((i) => i.isPublished);
    if (pub && !selectedId) {
      loadForm(pub);
    }
  }, [token, selectedId, loadForm]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [isLoading, user, router, refresh]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  async function saveNewVersion(publish: boolean) {
    if (!token) return;
    setBusy(true);
    setError(null);
    const res = await nestAdminCreatePortalTermsVersion(token, {
      title,
      termsHtml,
      rulesHtml,
      operatorContact,
      publish,
      requireReacceptOnLogin,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení selhalo');
      return;
    }
    setToast(publish ? 'Nová verze publikována' : 'Nová verze uložena');
    await refresh();
    if (res.version) loadForm(res.version);
  }

  async function saveDraft() {
    if (!token || !selected) {
      await saveNewVersion(false);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await nestAdminUpdatePortalTermsVersion(token, selected.id, {
      title,
      termsHtml,
      rulesHtml,
      operatorContact,
      requireReacceptOnLogin,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Uložení selhalo');
      return;
    }
    setToast('Verze aktualizována');
    await refresh();
  }

  async function togglePublish(row: PortalTermsVersionRow) {
    if (!token) return;
    setBusy(true);
    setError(null);
    const res = row.isPublished
      ? await nestAdminUnpublishPortalTermsVersion(token, row.id)
      : await nestAdminPublishPortalTermsVersion(token, row.id);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Akce selhala');
      return;
    }
    setToast(row.isPublished ? 'Verze skryta' : 'Verze publikována');
    await refresh();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-500">Nastavení</p>
          <h1 className="text-2xl font-bold text-zinc-900">Obchodní podmínky</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Správa verzí obchodních podmínek a pravidel portálu. Veřejná stránka:{' '}
            <Link href="/obchodni-podminky" className="font-semibold text-orange-600 hover:underline" target="_blank">
              /obchodni-podminky
            </Link>
          </p>
        </div>
        {published ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Aktuální verze: <strong>v{published.version}</strong>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Žádná publikovaná verze
          </div>
        )}
      </div>

      {toast ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800">
          {toast}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
          <div>
            <label htmlFor="terms-title" className="mb-1 block text-sm font-semibold text-zinc-800">
              Název dokumentu
            </label>
            <input
              id="terms-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          <SimpleRichEditor label="Obchodní podmínky" value={termsHtml} onChange={setTermsHtml} />
          <SimpleRichEditor label="Pravidla portálu" value={rulesHtml} onChange={setRulesHtml} />

          <div>
            <label htmlFor="operator-contact" className="mb-1 block text-sm font-semibold text-zinc-800">
              Kontakt na provozovatele
            </label>
            <textarea
              id="operator-contact"
              rows={4}
              value={operatorContact}
              onChange={(e) => setOperatorContact(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          <label className="flex items-start gap-2 text-sm text-zinc-800">
            <input
              type="checkbox"
              checked={requireReacceptOnLogin}
              onChange={(e) => setRequireReacceptOnLogin(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Vyžádat nový souhlas po přihlášení (uživatelé se starší verzí budou přesměrováni k
              opětovnému souhlasu)
            </span>
          </label>

          <div className="flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDraft()}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            >
              {selected ? 'Uložit změny' : 'Uložit novou verzi (koncept)'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveNewVersion(true)}
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Uložit a publikovat novou verzi
            </button>
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-500">Historie verzí</h2>
          <ul className="mt-3 max-h-[70vh] space-y-2 overflow-y-auto">
            {items.map((row) => (
              <li
                key={row.id}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  row.id === selectedId
                    ? 'border-orange-300 bg-orange-50'
                    : 'border-zinc-200 bg-zinc-50/50'
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => loadForm(row)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-900">v{row.version}</span>
                    {row.isPublished ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                        Publikováno
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-bold uppercase text-zinc-600">
                        Skryto
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-600">{row.title}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">{formatDateTime(row.updatedAt)}</p>
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void togglePublish(row)}
                  className="mt-2 w-full rounded-lg border border-zinc-200 bg-white py-1 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
                >
                  {row.isPublished ? 'Skrýt' : 'Publikovat'}
                </button>
              </li>
            ))}
            {items.length === 0 ? (
              <li className="text-sm text-zinc-500">Zatím žádné verze.</li>
            ) : null}
          </ul>
        </aside>
      </div>
    </div>
  );
}
