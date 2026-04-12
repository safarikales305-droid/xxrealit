'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestAddShortsMediaByUrl,
  nestDeleteShortsListing,
  nestDeleteShortsMediaItem,
  nestFetchShortsListing,
  nestListActiveShortsMusicTracks,
  nestPatchShortsListing,
  nestPatchShortsMediaItem,
  nestPostShortsPreview,
  nestPublishShortsListing,
  nestReorderShortsMedia,
  nestSetShortsCover,
  nestUploadShortsListingImage,
  type NestShortsListingDraft,
  type ShortsMusicTrackDto,
  type ShortVideo,
} from '@/lib/nest-client';

const MUSIC_BUILTIN = [
  { value: 'demo_soft', label: 'Demo jemná' },
  { value: 'demo_warm', label: 'Demo teplá' },
  { value: 'demo_pulse', label: 'Demo pulz' },
  { value: 'none', label: 'Bez hudby' },
] as const;

function imgSrc(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return nestAbsoluteAssetUrl(u) || u;
}

function videoSrc(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  return nestAbsoluteAssetUrl(u) || u;
}

export default function ShortsEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { apiAccessToken, isAuthenticated, isLoading } = useAuth();

  const [data, setData] = useState<NestShortsListingDraft | null>(null);
  const [tracks, setTracks] = useState<ShortsMusicTrackDto[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [musicTrackId, setMusicTrackId] = useState('');
  const [musicBuiltinKey, setMusicBuiltinKey] = useState('demo_soft');
  const [addUrl, setAddUrl] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiAccessToken || !id) return;
    setErr(null);
    const row = await nestFetchShortsListing(apiAccessToken, id);
    if (!row) {
      setErr('Koncept se nepodařilo načíst.');
      setData(null);
      return;
    }
    setData(row);
    setTitle(row.title);
    setDescription(row.description);
    setMusicTrackId(row.musicTrackId ?? '');
    setMusicBuiltinKey(row.musicBuiltinKey || 'demo_soft');
  }, [apiAccessToken, id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!apiAccessToken) return;
    void nestListActiveShortsMusicTracks(apiAccessToken).then(setTracks);
  }, [apiAccessToken]);

  const feedPreview: ShortVideo | null =
    data?.videoUrl && data.videoUrl.trim()
      ? {
          id: data.id,
          videoUrl: videoSrc(data.videoUrl),
          title: title || data.title,
          city: null,
          createdAt: data.updatedAt,
          imageUrl: data.coverImage ? imgSrc(data.coverImage) : null,
        }
      : null;

  async function saveText() {
    if (!apiAccessToken || !data) return;
    setBusy('save');
    setErr(null);
    const body: Record<string, unknown> = {
      title: title.trim(),
      description: description.trim(),
      musicTrackId: (musicTrackId ?? '').trim() || null,
      musicUrl: '',
      musicBuiltinKey,
    };
    if (data.status !== 'published') {
      body.status = 'draft';
    }
    const r = await nestPatchShortsListing(apiAccessToken, data.id, body);
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Uložení selhalo');
      return;
    }
    if (r.data) setData(r.data);
  }

  async function markReady() {
    if (!apiAccessToken || !data || data.status === 'published') return;
    setBusy('ready');
    const r = await nestPatchShortsListing(apiAccessToken, data.id, { status: 'ready' });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Změna stavu selhala');
      return;
    }
    if (r.data) setData(r.data);
  }

  async function runPreview() {
    if (!apiAccessToken || !data) return;
    if (!window.confirm('Vygenerovat náhled videa na serveru? Může to trvat desítky sekund.')) {
      return;
    }
    setBusy('preview');
    setErr(null);
    await saveText();
    const r = await nestPostShortsPreview(apiAccessToken, data.id);
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Náhled selhal');
      return;
    }
    if (r.data) setData(r.data);
  }

  async function publish() {
    if (!apiAccessToken || !data) return;
    if (!window.confirm('Zveřejnit shorts do feedu?')) return;
    setBusy('publish');
    setErr(null);
    await saveText();
    const r = await nestPublishShortsListing(apiAccessToken, data.id);
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Publikace selhala');
      return;
    }
    router.push(`/?tab=shorts${r.propertyId ? `&video=${encodeURIComponent(r.propertyId)}` : ''}`);
  }

  async function removeDraft() {
    if (!apiAccessToken || !data) return;
    const msg =
      data.status === 'published'
        ? 'Smazat tento shorts inzerát? Zmizí z profilu i z veřejného shorts feedu.'
        : 'Smazat koncept?';
    if (!window.confirm(msg)) return;
    const r = await nestDeleteShortsListing(apiAccessToken, data.id);
    if (!r.ok) {
      setErr(r.error ?? 'Smazání selhalo');
      return;
    }
    router.push('/profil');
  }

  async function onReorder(fromId: string, toId: string) {
    if (!apiAccessToken || !data) return;
    const ordered = [...data.media].sort((a, b) => a.order - b.order);
    const ids = ordered.map((m) => m.id);
    const fi = ids.indexOf(fromId);
    const ti = ids.indexOf(toId);
    if (fi < 0 || ti < 0) return;
    const next = [...ids];
    next.splice(fi, 1);
    next.splice(ti, 0, fromId);
    const r = await nestReorderShortsMedia(apiAccessToken, data.id, next);
    if (!r.ok) {
      setErr(r.error ?? 'Změna pořadí selhala');
      return;
    }
    if (r.data) setData(r.data);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-600">Načítání…</div>
    );
  }

  if (!isAuthenticated || !apiAccessToken) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-zinc-700">Pro editor shorts se přihlaste.</p>
        <Link href="/login" className="mt-4 inline-block text-[#e85d00] hover:underline">
          Přihlásit se
        </Link>
      </div>
    );
  }

  if (err && !data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16">
        <p className="text-red-600">{err}</p>
        <Link href="/profil" className="mt-4 inline-block text-[#e85d00] hover:underline">
          Zpět na profil
        </Link>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-zinc-600">
        Načítám editor…
      </div>
    );
  }

  const isPublished = data.status === 'published';
  const sortedMedia = [...data.media].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-20 text-zinc-900">
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        <Link href="/profil" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Profil
        </Link>
        <h1 className="mt-4 text-2xl font-bold">Editor shorts</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Stav: <strong>{data.status}</strong> · zdrojový inzerát{' '}
          <Link
            href={`/nemovitost/${data.sourceListingId}`}
            className="font-semibold text-[#e85d00] hover:underline"
          >
            otevřít klasik
          </Link>
          {isPublished && data.publishedPropertyId ? (
            <>
              {' '}
              ·{' '}
              <Link
                href={`/nemovitost/${data.publishedPropertyId}`}
                className="font-semibold text-[#e85d00] hover:underline"
              >
                veřejný shorts
              </Link>
            </>
          ) : null}
        </p>
        {isPublished ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-950">
            Tento shorts je zveřejněný. Úpravy textu se ihned propsí do detailu a feedu. Po změně
            fotek nebo hudby spusťte znovu <strong>Vygenerovat náhled</strong>, aby se obnovilo
            video ve feedu.
          </p>
        ) : null}
        {err ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </p>
        ) : null}
      </div>

      <div className="mx-auto mt-8 max-w-3xl space-y-8 px-4 sm:px-6">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Text</h2>
          <label className="mt-3 block text-sm font-medium text-zinc-700">Název</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Popis</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Hudba</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Vyberte skladbu z knihovny (má přednost) nebo vestavěný motiv.
          </p>
          <label className="mt-3 block text-sm font-medium text-zinc-700">Skladba z knihovny</label>
          <select
            value={musicTrackId}
            onChange={(e) => setMusicTrackId(e.target.value)}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          >
            <option value="">— žádná —</option>
            {tracks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <label className="mt-3 block text-sm font-medium text-zinc-700">Nebo vestavěná</label>
          <select
            value={musicBuiltinKey}
            onChange={(e) => setMusicBuiltinKey(e.target.value)}
            disabled={Boolean((musicTrackId ?? '').trim())}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm disabled:opacity-50"
          >
            {MUSIC_BUILTIN.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={Boolean(busy) || !(musicTrackId ?? '').trim() || !apiAccessToken}
            onClick={() => {
              if (!apiAccessToken) return;
              setMusicTrackId('');
              void nestPatchShortsListing(apiAccessToken, data.id, {
                musicTrackId: null,
                musicUrl: '',
                musicBuiltinKey: musicBuiltinKey || 'demo_soft',
              }).then((r) => {
                if (r.ok && r.data) setData(r.data);
                else setErr(r.error ?? 'Úprava hudby selhala');
              });
            }}
            className="mt-3 rounded-full border border-zinc-300 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            Odebrat skladbu z knihovny
          </button>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Fotky (přetáhněte řádky)</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Pro generování videa jsou potřeba alespoň 2 obrázky (nebo jeden — server ho zdvojí).
          </p>
          <ul className="mt-4 space-y-2">
            {sortedMedia.map((m) => (
              <li
                key={m.id}
                draggable
                onDragStart={() => setDragId(m.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragId && dragId !== m.id) void onReorder(dragId, m.id);
                  setDragId(null);
                }}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-100 bg-zinc-50/80 p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imgSrc(m.imageUrl)} alt="" className="size-14 rounded-lg object-cover" />
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-mono text-[10px] text-zinc-400">{m.id.slice(0, 8)}…</p>
                  {m.isCover ? (
                    <span className="font-semibold text-emerald-700">Cover</span>
                  ) : (
                    <button
                      type="button"
                      className="text-[#e85d00] hover:underline"
                      onClick={() =>
                        void nestSetShortsCover(apiAccessToken, data.id, m.id).then((r) => {
                          if (r.ok && r.data) setData(r.data);
                          else setErr(r.error ?? 'Cover selhalo');
                        })
                      }
                    >
                      Nastavit cover
                    </button>
                  )}
                </div>
                <label className="text-xs text-zinc-600">
                  Délka (s)
                  <input
                    type="number"
                    step="0.5"
                    min={0.5}
                    max={30}
                    defaultValue={m.duration}
                    className="ml-1 w-20 rounded border border-zinc-200 px-1"
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (!Number.isFinite(v)) return;
                      void nestPatchShortsMediaItem(apiAccessToken, data.id, m.id, {
                        duration: v,
                      }).then((r) => {
                        if (r.ok && r.data) setData(r.data);
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="rounded-full border border-red-200 px-2 py-1 text-xs text-red-700"
                  onClick={() =>
                    void nestDeleteShortsMediaItem(apiAccessToken, data.id, m.id).then((r) => {
                      if (r.ok && r.data) setData(r.data);
                      else setErr(r.error ?? 'Smazání selhalo');
                    })
                  }
                >
                  Smazat
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f || !apiAccessToken) return;
                void nestUploadShortsListingImage(apiAccessToken, data.id, f).then((r) => {
                  if (r.ok && r.data) setData(r.data);
                  else setErr(r.error ?? 'Upload selhal');
                });
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold"
            >
              Nahrát fotku
            </button>
            <div className="flex flex-1 gap-2">
              <input
                value={addUrl}
                onChange={(e) => setAddUrl(e.target.value)}
                placeholder="URL obrázku (https://…)"
                className="min-w-0 flex-1 rounded-full border border-zinc-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => {
                  void nestAddShortsMediaByUrl(apiAccessToken, data.id, addUrl.trim()).then((r) => {
                    if (r.ok && r.data) {
                      setData(r.data);
                      setAddUrl('');
                    } else setErr(r.error ?? 'Přidání URL selhalo');
                  });
                }}
                className="shrink-0 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Přidat URL
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Náhled videa</h2>
          {feedPreview?.videoUrl ? (
            <video
              key={feedPreview.videoUrl}
              src={feedPreview.videoUrl}
              controls
              className="mt-4 aspect-[9/16] w-full max-w-xs rounded-xl bg-black"
            />
          ) : (
            <p className="mt-2 text-sm text-zinc-600">
              Zatím žádné video — použijte „Vygenerovat náhled“.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Náhled ve feedu (karta)</h2>
          {feedPreview?.videoUrl ? (
            <div className="mt-4 max-w-xs overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-md">
              <video src={feedPreview.videoUrl} muted playsInline className="aspect-[9/16] w-full" />
              <div className="bg-white px-3 py-2 text-xs">
                <p className="font-semibold">{feedPreview.title}</p>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-zinc-600">Po vygenerování náhledu se zobrazí karta.</p>
          )}
        </section>

        <div className="flex flex-wrap gap-2 pb-10">
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void saveText()}
            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy === 'save' ? 'Ukládám…' : isPublished ? 'Uložit změny (text)' : 'Uložit koncept'}
          </button>
          {!isPublished ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void markReady()}
              className="rounded-full border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-950 disabled:opacity-50"
            >
              Označit jako připraveno
            </button>
          ) : null}
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void runPreview()}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'preview' ? 'Generuji…' : isPublished ? 'Obnovit video (feed)' : 'Vygenerovat náhled'}
          </button>
          {!isPublished ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => void publish()}
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {busy === 'publish' ? 'Publikuji…' : 'Zveřejnit'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={Boolean(busy)}
            onClick={() => void removeDraft()}
            className="rounded-full border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-700 disabled:opacity-50"
          >
            {isPublished ? 'Smazat shorts' : 'Smazat koncept'}
          </button>
        </div>
      </div>
    </div>
  );
}
