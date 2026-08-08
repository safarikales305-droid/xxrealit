'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  adminFetchAccommodationHero,
  adminSaveAccommodationHero,
  type AccommodationHeroCategory,
} from '@/lib/accommodation-client';

type HeroCategoryDraft = AccommodationHeroCategory & { _key: string };

function newCategory(): HeroCategoryDraft {
  return {
    _key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    id: '',
    label: '',
    imageUrl: '',
    imageAlt: '',
    href: '/ubytovani',
    sortOrder: 0,
    active: true,
  };
}

export function AdminAccommodationHeroPanel() {
  const { apiAccessToken } = useAuth();
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [heroImageAlt, setHeroImageAlt] = useState('');
  const [categories, setCategories] = useState<HeroCategoryDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiAccessToken) return;
    const data = await adminFetchAccommodationHero(apiAccessToken);
    setTitle(data.settings?.title ?? '');
    setSubtitle(data.settings?.subtitle ?? '');
    setHeroImageUrl(data.settings?.heroImageUrl ?? '');
    setHeroImageAlt(data.settings?.heroImageAlt ?? '');
    setCategories(
      data.categories.map((c) => ({
        ...c,
        _key: c.id,
      })),
    );
  }, [apiAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!apiAccessToken) return;
    setBusy(true);
    setMsg(null);
    try {
      await adminSaveAccommodationHero(apiAccessToken, {
        title,
        subtitle,
        heroImageUrl: heroImageUrl.trim() || null,
        heroImageAlt: heroImageAlt.trim() || null,
        categories: categories.map((c, index) => ({
          id: c.id || undefined,
          label: c.label,
          imageUrl: c.imageUrl,
          imageAlt: c.imageAlt,
          href: c.href,
          sortOrder: index,
          active: c.active,
        })),
      });
      setMsg('Hero Ubytování uložen.');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Uložení selhalo');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Ubytování — Hero</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Marketing / Ubytování / Hero — nadpisy, vyhledávání a kategorie na stránce /ubytovani.
          </p>
        </div>
        <Link href="/admin/ubytovani" className="text-sm font-medium text-orange-600 hover:underline">
          ← Správa ubytování
        </Link>
      </div>

      {msg ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-800">{msg}</div>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Hlavní texty</h2>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Nadpis</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Podnadpis</span>
          <textarea
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Hero obrázek (URL)</span>
            <input
              value={heroImageUrl}
              onChange={(e) => setHeroImageUrl(e.target.value)}
              placeholder="https://…"
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">Alt text hero obrázku</span>
            <input
              value={heroImageAlt}
              onChange={(e) => setHeroImageAlt(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Kategorie (obrázkové karty)</h2>
          <button
            type="button"
            onClick={() => setCategories((prev) => [...prev, newCategory()])}
            className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-800"
          >
            + Kategorie
          </button>
        </div>

        <div className="space-y-4">
          {categories.map((category, index) => (
            <div key={category._key} className="rounded-xl border border-zinc-200 p-3">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-zinc-800">#{index + 1}</p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={category.active}
                    onChange={(e) =>
                      setCategories((prev) =>
                        prev.map((c) => (c._key === category._key ? { ...c, active: e.target.checked } : c)),
                      )
                    }
                  />
                  Aktivní
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="mb-1 block text-zinc-600">Název</span>
                  <input
                    value={category.label}
                    onChange={(e) =>
                      setCategories((prev) =>
                        prev.map((c) => (c._key === category._key ? { ...c, label: e.target.value } : c)),
                      )
                    }
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-zinc-600">Odkaz</span>
                  <input
                    value={category.href}
                    onChange={(e) =>
                      setCategories((prev) =>
                        prev.map((c) => (c._key === category._key ? { ...c, href: e.target.value } : c)),
                      )
                    }
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-zinc-600">URL obrázku</span>
                  <input
                    value={category.imageUrl}
                    onChange={(e) =>
                      setCategories((prev) =>
                        prev.map((c) => (c._key === category._key ? { ...c, imageUrl: e.target.value } : c)),
                      )
                    }
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-zinc-600">Alt text</span>
                  <input
                    value={category.imageAlt ?? ''}
                    onChange={(e) =>
                      setCategories((prev) =>
                        prev.map((c) => (c._key === category._key ? { ...c, imageAlt: e.target.value } : c)),
                      )
                    }
                    className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() => setCategories((prev) => prev.filter((c) => c._key !== category._key))}
                className="mt-3 text-sm font-medium text-red-600 hover:underline"
              >
                Odstranit kategorii
              </button>
            </div>
          ))}
        </div>
      </section>

      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-3 text-sm font-bold text-white shadow disabled:opacity-60"
      >
        {busy ? 'Ukládám…' : 'Uložit hero'}
      </button>
    </div>
  );
}
