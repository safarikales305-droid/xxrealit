'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestFetchMe,
  nestTiparCreatePost,
  nestTiparMyPosts,
  type TiparPostRow,
} from '@/lib/nest-client';

export default function ProfilTipyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [posts, setPosts] = useState<TiparPostRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    city: '',
    propertyPrice: '',
    videoUrl: '',
    sourceUrl: '',
    ownerNote: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    contactUnlockPrice: '100',
    isShorts: false,
    images: '',
  });

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!apiAccessToken) return;
    void (async () => {
      const me = await nestFetchMe(apiAccessToken);
      if (!me?.isTipar) {
        router.replace('/profil');
        return;
      }
      setPosts(await nestTiparMyPosts(apiAccessToken));
    })();
  }, [apiAccessToken, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!apiAccessToken) return;
    setBusy(true);
    setError(null);
    const images = form.images
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    const r = await nestTiparCreatePost(apiAccessToken, {
      title: form.title,
      description: form.description,
      city: form.city,
      propertyPrice: form.propertyPrice ? Number(form.propertyPrice) : undefined,
      videoUrl: form.videoUrl || undefined,
      sourceUrl: form.sourceUrl || undefined,
      ownerNote: form.ownerNote || undefined,
      contactName: form.contactName,
      contactPhone: form.contactPhone,
      contactEmail: form.contactEmail,
      contactUnlockPrice: Number(form.contactUnlockPrice) || 100,
      isShorts: form.isShorts,
      images,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Uložení tipu selhalo');
      return;
    }
    setShowForm(false);
    setPosts(await nestTiparMyPosts(apiAccessToken));
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/profil" className="text-sm text-zinc-500 hover:underline">
            ← Profil
          </Link>
          <h1 className="mt-1 text-2xl font-semibold">Moje tipy</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
        >
          {showForm ? 'Zavřít formulář' : 'Vytvořit tip'}
        </button>
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {showForm ? (
        <form onSubmit={(e) => void submit(e)} className="mb-8 space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
          <input
            required
            placeholder="Název tipu"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <textarea
            required
            placeholder="Popis nemovitosti"
            rows={4}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              placeholder="Lokalita"
              value={form.city}
              onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              placeholder="Cena nemovitosti (Kč)"
              type="number"
              min={0}
              value={form.propertyPrice}
              onChange={(e) => setForm((f) => ({ ...f, propertyPrice: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="URL videa (pro Shorts)"
            value={form.videoUrl}
            onChange={(e) => setForm((f) => ({ ...f, videoUrl: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="URL fotek (jedna na řádek)"
            rows={2}
            value={form.images}
            onChange={(e) => setForm((f) => ({ ...f, images: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <input
            placeholder="Odkaz na zdroj"
            value={form.sourceUrl}
            onChange={(e) => setForm((f) => ({ ...f, sourceUrl: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Vlastní poznámka"
            rows={2}
            value={form.ownerNote}
            onChange={(e) => setForm((f) => ({ ...f, ownerNote: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <input
              placeholder="Kontakt — jméno"
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              placeholder="Telefon"
              value={form.contactPhone}
              onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
            <input
              placeholder="E-mail"
              value={form.contactEmail}
              onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </div>
          <input
            placeholder="Cena za odemčení kontaktu (Kč)"
            type="number"
            min={0}
            value={form.contactUnlockPrice}
            onChange={(e) => setForm((f) => ({ ...f, contactUnlockPrice: e.target.value }))}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isShorts}
              onChange={(e) => setForm((f) => ({ ...f, isShorts: e.target.checked }))}
            />
            Zobrazit jako Shorts tip na nemovitost
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-full bg-[#e85d00] px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Ukládám…' : 'Publikovat tip'}
          </button>
        </form>
      ) : null}

      <ul className="space-y-3">
        {posts.map((p) => (
          <li key={p.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <Link href={`/tipar/${p.id}`} className="font-semibold text-zinc-900 hover:underline">
                  {p.title}
                </Link>
                <p className="mt-1 text-xs text-zinc-500">
                  {p.city}
                  {p.isShorts ? ' · Shorts' : ''} · odemčení {p.contactUnlockPrice} Kč ·{' '}
                  {p.unlockCount ?? 0}× odemčeno
                </p>
              </div>
              {p.isShorts ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                  Tip na nemovitost
                </span>
              ) : null}
            </div>
          </li>
        ))}
        {posts.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500">
            Zatím nemáte žádné tipy.
          </li>
        ) : null}
      </ul>
    </main>
  );
}
