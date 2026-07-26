'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { SeoAiImproveDialog } from '@/components/admin/seo/SeoAiImproveDialog';
import {
  nestAdminSeoContentGet,
  nestAdminSeoContentStatus,
  nestAdminSeoContentUpdate,
  nestAdminSeoContentVersions,
  type SeoPageContentRow,
} from '@/lib/nest-client';

export default function AdminSeoStrankaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [row, setRow] = useState<SeoPageContentRow | null>(null);
  const [versions, setVersions] = useState<Array<{ id: string; version: number; note: string | null; createdAt: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [compareVersion, setCompareVersion] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    const [content, vers] = await Promise.all([
      nestAdminSeoContentGet(token, id),
      nestAdminSeoContentVersions(token, id),
    ]);
    setRow(content);
    setVersions(vers ?? []);
  }, [token, id]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!token || !row) return;
    setBusy(true);
    try {
      const res = await nestAdminSeoContentUpdate(token, row.id, row);
      if (res) {
        setRow(res);
        setMsg('Uloženo.');
        void load();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    if (!token || !row) return;
    setBusy(true);
    try {
      const res = await nestAdminSeoContentStatus(token, row.id, status);
      if (res) {
        setRow({ ...row, ...res });
        setMsg('Stav aktualizován.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  if (!token || user?.role !== 'ADMIN') return null;
  if (!row) return <p className="text-sm text-zinc-500">Načítám editor…</p>;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/admin/seo/stranky" className="text-sm text-zinc-500 hover:underline">
            ← SEO stránky
          </Link>
          <h2 className="mt-1 text-xl font-bold">{row.h1 ?? row.pageKey}</h2>
          <p className="text-sm text-zinc-500">
            /{row.intentSlug}/{row.location?.slug} · {row.status} · skóre {row.qualityScore}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SeoAiImproveDialog
            token={token}
            contentId={row.id}
            row={row}
            onApplied={(page) => {
              setRow(page);
              setMsg('AI návrh použit jako koncept. Zkontrolujte a publikujte ručně.');
            }}
          />
          <button type="button" onClick={() => void save()} disabled={busy} className="rounded-lg border px-3 py-1.5 text-sm">
            Uložit
          </button>
          <button
            type="button"
            onClick={() => void setStatus('PUBLISHED')}
            disabled={busy}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-sm text-white"
          >
            Publikovat
          </button>
          <button
            type="button"
            onClick={() => void setStatus('LOCKED')}
            disabled={busy}
            className="rounded-lg border px-3 py-1.5 text-sm"
          >
            Zamknout
          </button>
        </div>
      </div>

      {msg ? <p className="mb-4 rounded-lg border bg-white px-3 py-2 text-sm">{msg}</p> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <EditorSection title="Základní metadata">
            <Field label="Title" value={row.title ?? ''} onChange={(v) => setRow({ ...row, title: v })} />
            <Field label="Description" value={row.description ?? ''} onChange={(v) => setRow({ ...row, description: v })} rows={3} />
            <Field
              label="Keywords (čárkou)"
              value={(row.keywords ?? []).join(', ')}
              onChange={(v) => setRow({ ...row, keywords: v.split(',').map((s) => s.trim()).filter(Boolean) })}
            />
            <Field label="H1" value={row.h1 ?? ''} onChange={(v) => setRow({ ...row, h1: v })} />
            <Field label="H2" value={row.h2 ?? ''} onChange={(v) => setRow({ ...row, h2: v })} />
            <Field label="Text" value={row.bodyText ?? ''} onChange={(v) => setRow({ ...row, bodyText: v })} rows={8} />
          </EditorSection>

          <EditorSection title="Technické SEO">
            <Field label="Canonical" value={row.canonical ?? ''} onChange={(v) => setRow({ ...row, canonical: v })} />
            <Field label="Robots" value={row.robots ?? ''} onChange={(v) => setRow({ ...row, robots: v })} />
            <Field label="Přesměrování (redirectTo)" value={row.redirectTo ?? ''} onChange={(v) => setRow({ ...row, redirectTo: v })} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={row.noindex}
                onChange={(e) => setRow({ ...row, noindex: e.target.checked })}
              />
              Noindex
            </label>
          </EditorSection>

          <EditorSection title="Open Graph & Twitter">
            <Field label="OG Title" value={row.ogTitle ?? ''} onChange={(v) => setRow({ ...row, ogTitle: v })} />
            <Field label="OG Description" value={row.ogDescription ?? ''} onChange={(v) => setRow({ ...row, ogDescription: v })} rows={2} />
            <Field label="OG Image" value={row.ogImage ?? ''} onChange={(v) => setRow({ ...row, ogImage: v })} />
            <Field label="Twitter Card" value={row.twitterCard ?? ''} onChange={(v) => setRow({ ...row, twitterCard: v })} />
          </EditorSection>

          <EditorSection title="FAQ & Schema">
            <JsonField label="FAQ" value={row.faq} onChange={(v) => setRow({ ...row, faq: v })} />
            <JsonField label="Schema JSON-LD" value={row.schemaJson} onChange={(v) => setRow({ ...row, schemaJson: v })} />
            <JsonField label="Interní odkazy" value={row.internalLinks} onChange={(v) => setRow({ ...row, internalLinks: v })} />
            <JsonField label="Související lokality" value={row.relatedLocations} onChange={(v) => setRow({ ...row, relatedLocations: v })} />
            <JsonField label="Související stránky" value={row.relatedPages} onChange={(v) => setRow({ ...row, relatedPages: v })} />
            <JsonField label="ALT texty" value={row.altTexts} onChange={(v) => setRow({ ...row, altTexts: v })} />
          </EditorSection>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-zinc-200 bg-white p-4">
            <h3 className="font-semibold">Historie změn</h3>
            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto text-sm">
              {versions.map((v) => (
                <li key={v.id} className="flex justify-between gap-2 border-b border-zinc-100 pb-1">
                  <span>v{v.version}</span>
                  <button
                    type="button"
                    className="text-orange-600 hover:underline"
                    onClick={() => setCompareVersion(v.version)}
                  >
                    Porovnat
                  </button>
                </li>
              ))}
            </ul>
            {compareVersion ? (
              <p className="mt-2 text-xs text-zinc-500">Porovnání s verzí {compareVersion} — otevřete detail verze v API.</p>
            ) : null}
          </section>
        </aside>
      </div>
    </>
  );
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4">
      <h3 className="mb-3 font-semibold">{title}</h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  rows = 1,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      {rows > 1 ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className="w-full rounded-lg border px-3 py-2 text-sm" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border px-3 py-2 text-sm" />
      )}
    </div>
  );
}

function JsonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium">{label}</label>
      <textarea
        value={JSON.stringify(value ?? (Array.isArray(value) ? [] : {}), null, 2)}
        onChange={(e) => {
          try {
            onChange(JSON.parse(e.target.value));
          } catch {
            /* ignore */
          }
        }}
        rows={6}
        className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
      />
    </div>
  );
}
