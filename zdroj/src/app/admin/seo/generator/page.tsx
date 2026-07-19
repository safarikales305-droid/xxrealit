'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminSeoContentGenerate,
  nestAdminSeoContentStatus,
  nestAdminSeoContentUpdate,
  type SeoPageContentRow,
} from '@/lib/nest-client';

const INTENTS = [
  'prodej-domu',
  'prodej-bytu',
  'pronajem-bytu',
  'prodej-pozemku',
  'prodej-chaty',
  'prodej-garaze',
  'prodej-komercnich-prostor',
  'developerske-projekty',
  'realitni-kancelar',
] as const;

export default function AdminSeoGeneratorPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [intentSlug, setIntentSlug] = useState<(typeof INTENTS)[number]>('prodej-domu');
  const [locationSlug, setLocationSlug] = useState('pardubice');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<SeoPageContentRow | null>(null);

  const generate = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await nestAdminSeoContentGenerate(token, {
        intentSlug,
        locationSlug,
        useAi: true,
      });
      if (res) {
        setDraft(res);
        setMsg('Návrh vygenerován — upravte a uložte nebo publikujte.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Generování selhalo');
    } finally {
      setBusy(false);
    }
  }, [token, intentSlug, locationSlug]);

  async function save() {
    if (!token || !draft) return;
    setBusy(true);
    try {
      const res = await nestAdminSeoContentUpdate(token, draft.id, {
        title: draft.title,
        description: draft.description,
        keywords: draft.keywords,
        h1: draft.h1,
        h2: draft.h2,
        bodyText: draft.bodyText,
        faq: draft.faq,
        canonical: draft.canonical,
        robots: draft.robots,
        ogTitle: draft.ogTitle,
        ogDescription: draft.ogDescription,
        ogImage: draft.ogImage,
        twitterCard: draft.twitterCard,
        schemaJson: draft.schemaJson,
        internalLinks: draft.internalLinks,
      });
      if (res) {
        setDraft(res);
        setMsg('Uloženo.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Uložení selhalo');
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string) {
    if (!token || !draft) return;
    setBusy(true);
    try {
      const res = await nestAdminSeoContentStatus(token, draft.id, status);
      if (res) {
        setDraft(res);
        setMsg(status === 'PUBLISHED' ? 'Publikováno.' : status === 'DRAFT' ? 'Zamítnuto.' : 'Stav aktualizován.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Chyba');
    } finally {
      setBusy(false);
    }
  }

  if (!isLoading && (!token || user?.role !== 'ADMIN')) {
    router.replace('/');
    return null;
  }

  return (
    <>
      <p className="mb-4 text-sm text-zinc-600">
        Workflow: Návrh → Kontrola → Schválení → Publikace. AI generuje šablonový text z ověřených dat.
      </p>

      <section className="mb-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Intent</label>
            <select
              value={intentSlug}
              onChange={(e) => setIntentSlug(e.target.value as (typeof INTENTS)[number])}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            >
              {INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Slug lokality</label>
            <input
              value={locationSlug}
              onChange={(e) => setLocationSlug(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="pardubice"
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'Generuji…' : 'Vygenerovat návrh'}
        </button>
        {msg ? <p className="text-sm text-zinc-700">{msg}</p> : null}
      </section>

      {draft ? (
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">Editor návrhu</h2>
            <div className="flex flex-wrap gap-2">
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
                onClick={() => void setStatus('DRAFT')}
                disabled={busy}
                className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700"
              >
                Zamítnout
              </button>
              <Link
                href={`/admin/seo/stranky/${draft.id}`}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm text-white"
              >
                Plný editor →
              </Link>
            </div>
          </div>

          <Field label="SEO Title" value={draft.title ?? ''} onChange={(v) => setDraft({ ...draft, title: v })} />
          <Field
            label="Meta Description"
            value={draft.description ?? ''}
            onChange={(v) => setDraft({ ...draft, description: v })}
            rows={3}
          />
          <Field label="H1" value={draft.h1 ?? ''} onChange={(v) => setDraft({ ...draft, h1: v })} />
          <Field label="H2" value={draft.h2 ?? ''} onChange={(v) => setDraft({ ...draft, h2: v })} />
          <Field
            label="Úvodní text / obsah"
            value={draft.bodyText ?? ''}
            onChange={(v) => setDraft({ ...draft, bodyText: v })}
            rows={6}
          />
          <Field label="Canonical" value={draft.canonical ?? ''} onChange={(v) => setDraft({ ...draft, canonical: v })} />
          <Field label="Robots" value={draft.robots ?? ''} onChange={(v) => setDraft({ ...draft, robots: v })} />
          <Field label="OG Title" value={draft.ogTitle ?? ''} onChange={(v) => setDraft({ ...draft, ogTitle: v })} />
          <Field
            label="OG Description"
            value={draft.ogDescription ?? ''}
            onChange={(v) => setDraft({ ...draft, ogDescription: v })}
            rows={2}
          />
          <Field label="OG Image" value={draft.ogImage ?? ''} onChange={(v) => setDraft({ ...draft, ogImage: v })} />
          <div>
            <label className="mb-1 block text-sm font-medium">FAQ (JSON)</label>
            <textarea
              value={JSON.stringify(draft.faq ?? [], null, 2)}
              onChange={(e) => {
                try {
                  setDraft({ ...draft, faq: JSON.parse(e.target.value) });
                } catch {
                  /* ignore parse while typing */
                }
              }}
              rows={8}
              className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Schema JSON-LD</label>
            <textarea
              value={JSON.stringify(draft.schemaJson ?? {}, null, 2)}
              onChange={(e) => {
                try {
                  setDraft({ ...draft, schemaJson: JSON.parse(e.target.value) });
                } catch {
                  /* ignore */
                }
              }}
              rows={10}
              className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
            />
          </div>
          <p className="text-xs text-zinc-500">
            Návrh URL: /{draft.intentSlug}/{draft.location?.slug ?? locationSlug} · Skóre: {draft.qualityScore}
          </p>
        </section>
      ) : null}
    </>
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
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
        />
      )}
    </div>
  );
}
