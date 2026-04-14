'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import { nestAuthHeaders } from '@/lib/nest-client';

type CompanyAd = {
  id: string;
  imageUrl: string;
  title: string;
  description: string;
  ctaText: string;
  targetUrl: string;
  categories: string[];
  isActive: boolean;
};

type FormState = {
  imageUrl: string;
  title: string;
  description: string;
  ctaText: string;
  targetUrl: string;
  categories: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  imageUrl: '',
  title: '',
  description: '',
  ctaText: 'Napište nám poptávku',
  targetUrl: '',
  categories: 'pozemek,vystavba-domu,novostavba',
  isActive: true,
};

export function CompanyAdsManager() {
  const { user, apiAccessToken } = useAuth();
  const [items, setItems] = useState<CompanyAd[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isCompany = user?.role === 'COMPANY';
  const canUse = Boolean(API_BASE_URL && apiAccessToken && isCompany);
  const endpoint = useMemo(() => (API_BASE_URL ? `${API_BASE_URL}/company-ads` : ''), []);

  if (!isCompany) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Panel stavební firmy</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Správa reklam je dostupná pouze pro účty s rolí COMPANY.
          </p>
        </section>
      </main>
    );
  }

  async function reload() {
    if (!canUse) return;
    const res = await fetch(`${endpoint}/me`, {
      cache: 'no-store',
      headers: { ...nestAuthHeaders(apiAccessToken), Accept: 'application/json' },
    });
    if (!res.ok) return;
    const data = (await res.json().catch(() => [])) as CompanyAd[];
    setItems(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void reload();
  }, [canUse]);

  async function handleUpload(file: File) {
    if (!API_BASE_URL || !apiAccessToken) return;
    const fd = new FormData();
    fd.append('files', file);
    const res = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      headers: nestAuthHeaders(apiAccessToken),
      body: fd,
    });
    const data = (await res.json().catch(() => ({}))) as { urls?: string[] };
    const first = Array.isArray(data.urls) ? data.urls[0] : null;
    if (typeof first === 'string' && first.trim()) {
      setForm((prev) => ({ ...prev, imageUrl: first.trim() }));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canUse) return;
    setBusy(true);
    const body = {
      imageUrl: form.imageUrl.trim(),
      title: form.title.trim(),
      description: form.description.trim(),
      ctaText: form.ctaText.trim(),
      targetUrl: form.targetUrl.trim(),
      categories: form.categories
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0),
      isActive: form.isActive,
    };
    const method = editingId ? 'PATCH' : 'POST';
    const url = editingId ? `${endpoint}/${encodeURIComponent(editingId)}` : endpoint;
    await fetch(url, {
      method,
      headers: {
        ...nestAuthHeaders(apiAccessToken),
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    setBusy(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    setPreviewUrl(null);
    await reload();
  }

  async function remove(id: string) {
    if (!canUse) return;
    await fetch(`${endpoint}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { ...nestAuthHeaders(apiAccessToken), Accept: 'application/json' },
    });
    await reload();
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Moje reklamy</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Reklamy se párují hlavně na stavební pozemky a související kategorie (výstavba domů, novostavba, dřevostavby).
        </p>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Přidat reklamu</h2>
        <form className="grid gap-3" onSubmit={onSubmit}>
          <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Nadpis reklamy" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} />
          <textarea className="min-h-20 rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Popis reklamy" value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
          <div className="grid gap-3 md:grid-cols-2">
            <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="CTA text" value={form.ctaText} onChange={(e) => setForm((prev) => ({ ...prev, ctaText: e.target.value }))} />
            <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Cílový odkaz (profil firmy)" value={form.targetUrl} onChange={(e) => setForm((prev) => ({ ...prev, targetUrl: e.target.value }))} />
          </div>
          <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="Kategorie/tagy (čárkou), např. pozemek,vystavba-domu" value={form.categories} onChange={(e) => setForm((prev) => ({ ...prev, categories: e.target.value }))} />
          <input className="rounded-lg border border-zinc-300 px-3 py-2 text-sm" placeholder="URL obrázku reklamy" value={form.imageUrl} onChange={(e) => setForm((prev) => ({ ...prev, imageUrl: e.target.value }))} />
          <label className="text-sm">
            <span className="mb-1 block text-zinc-700">Nahrát obrázek reklamy</span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setPreviewUrl(URL.createObjectURL(file));
                void handleUpload(file);
              }}
            />
          </label>
          {previewUrl || form.imageUrl ? (
            <img src={previewUrl ?? form.imageUrl} alt="Náhled reklamy" className="h-32 w-full max-w-sm rounded-xl object-cover" />
          ) : null}
          <label className="flex items-center gap-2 text-sm text-zinc-700">
            <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))} />
            Reklama je aktivní
          </label>
          <button type="submit" disabled={busy || !canUse} className="w-fit rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
            {editingId ? 'Uložit změny' : 'Vytvořit reklamu'}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Seznam reklam</h2>
        <div className="mt-3 grid gap-3">
          {items.map((ad) => (
            <article key={ad.id} className="rounded-xl border border-zinc-200 p-3">
              <p className="text-xs uppercase text-zinc-500">{ad.categories.join(', ')}</p>
              <h3 className="mt-1 font-semibold">{ad.title}</h3>
              <p className="text-sm text-zinc-600">{ad.description}</p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-zinc-300 px-3 py-1 text-sm"
                  onClick={() => {
                    setEditingId(ad.id);
                    setForm({
                      imageUrl: ad.imageUrl,
                      title: ad.title,
                      description: ad.description,
                      ctaText: ad.ctaText,
                      targetUrl: ad.targetUrl,
                      categories: ad.categories.join(','),
                      isActive: ad.isActive,
                    });
                    setPreviewUrl(null);
                  }}
                >
                  Upravit
                </button>
                <button type="button" className="rounded-lg border border-red-300 px-3 py-1 text-sm text-red-600" onClick={() => void remove(ad.id)}>
                  Smazat
                </button>
              </div>
            </article>
          ))}
          {items.length === 0 ? <p className="text-sm text-zinc-500">Zatím nemáte žádné reklamy.</p> : null}
        </div>
      </section>
    </main>
  );
}
