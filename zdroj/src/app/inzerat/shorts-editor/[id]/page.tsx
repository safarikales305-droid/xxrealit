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
  nestPostShortsRegenerate,
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
  /** Změny, které vyžadují nové video (fotky, pořadí, cover, hudba, text ve videu). */
  const [pendingRegen, setPendingRegen] = useState(false);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [previewTrackUrl, setPreviewTrackUrl] = useState<string | null>(null);

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
    setPendingRegen(false);
    setOkMsg(null);
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

  function trackPreviewUrl(t: ShortsMusicTrackDto): string {
    const u = (t.previewUrl || t.audioUrl || t.fileUrl || '').trim();
    if (!u) return '';
    return imgSrc(u);
  }

  async function persistForm(): Promise<boolean> {
    if (!apiAccessToken || !data) return false;
    if (!data.media.length) {
      setErr('Shorts musí mít alespoň jednu fotku.');
      return false;
    }
    setBusy('save');
    setErr(null);
    setOkMsg(null);
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
      return false;
    }
    if (r.data) setData(r.data);
    return true;
  }

  async function saveDraftOrPublished() {
    const ok = await persistForm();
    if (!ok || !apiAccessToken || !data) return;
    if (data.status === 'published' && pendingRegen) {
      setBusy('preview');
      setErr(null);
      const rg = await nestPostShortsRegenerate(apiAccessToken, data.id);
      setBusy(null);
      if (!rg.ok) {
        setErr(rg.error ?? 'Přegenerování selhalo');
        return;
      }
      if (rg.data) setData(rg.data);
      setPendingRegen(false);
      setOkMsg('Změny jsou uložené a video v feedu je aktualizované.');
      window.setTimeout(() => setOkMsg(null), 5000);
      return;
    }
    setOkMsg(
      data.status === 'published'
        ? 'Text a nastavení jsou uložené.'
        : 'Koncept je uložený.',
    );
    window.setTimeout(() => setOkMsg(null), 4000);
  }

  async function runRegenerate(askConfirm: boolean) {
    if (!apiAccessToken || !data) return;
    if (!data.media.length) {
      setErr('Bez fotek nelze generovat video.');
      return;
    }
    if (
      askConfirm &&
      !window.confirm(
        'Přegenerovat shorts video na serveru z aktuálních fotek a hudby? Může to trvat desítky sekund.',
      )
    ) {
      return;
    }
    setErr(null);
    setOkMsg(null);
    const saved = await persistForm();
    if (!saved) return;
    setBusy('preview');
    const r = await nestPostShortsRegenerate(apiAccessToken, data.id);
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Přegenerování selhalo');
      return;
    }
    if (r.data) setData(r.data);
    setPendingRegen(false);
    setOkMsg('Video je znovu vygenerované.');
    window.setTimeout(() => setOkMsg(null), 5000);
  }

  async function markReady() {
    if (!apiAccessToken || !data || data.status === 'published') return;
    const saved = await persistForm();
    if (!saved) return;
    setBusy('ready');
    const r = await nestPatchShortsListing(apiAccessToken, data.id, { status: 'ready' });
    setBusy(null);
    if (!r.ok) {
      setErr(r.error ?? 'Změna stavu selhala');
      return;
    }
    if (r.data) setData(r.data);
    setOkMsg('Stav „připraveno“ je uložený.');
    window.setTimeout(() => setOkMsg(null), 4000);
  }

  async function publish() {
    if (!apiAccessToken || !data) return;
    if (!window.confirm('Zveřejnit shorts do feedu?')) return;
    setBusy('publish');
    setErr(null);
    await persistForm();
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
    if (r.data) {
      setData(r.data);
      setPendingRegen(true);
    }
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
        {pendingRegen ? (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            Máte neuložené změny ovlivňující video (fotky, pořadí, cover, hudba, název v překryvu).
            {isPublished
              ? ' U zveřejněného shorts stiskněte „Uložit změny“ — uloží se nastavení a spustí se přegenerování videa do feedu — nebo použijte „Přegenerovat shorts“.'
              : ' Po úpravách vygenerujte náhled videa tlačítkem níže.'}
          </p>
        ) : isPublished ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-950">
            Tento shorts je zveřejněný. Úpravy textu a fotek v detailu se propsí po uložení; video ve
            feedu se obnoví po úspěšném přegenerování.
          </p>
        ) : null}
        {data.videoRenderStatus === 'failed' && (data.videoRenderError || '').trim() ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
            Poslední generování videa selhalo. Ve feedu zůstává předchozí funkční verze.{' '}
            <span className="font-mono text-xs opacity-80">
              {(data.videoRenderError ?? '').slice(0, 280)}
            </span>
          </p>
        ) : null}
        {okMsg ? (
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            {okMsg}
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
            onChange={(e) => {
              setTitle(e.target.value);
              setPendingRegen(true);
            }}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
          <label className="mt-3 block text-sm font-medium text-zinc-700">Popis</label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              setPendingRegen(true);
            }}
            rows={4}
            className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
          />
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Hudba z knihovny</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Skladba z knihovny má přednost před vestavěným motivem. Hudba je volitelná.
          </p>
          {tracks.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">Žádné aktivní skladby — použijte vestavěný motiv.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {tracks.map((t) => {
                const active = musicTrackId === t.id;
                const prev = trackPreviewUrl(t);
                const dur = t.duration ?? t.durationSec;
                return (
                  <li
                    key={t.id}
                    className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${
                      active
                        ? 'border-emerald-400 bg-emerald-50/60'
                        : 'border-zinc-100 bg-zinc-50/80'
                    }`}
                  >
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold">{t.title}</p>
                      {(t.artist ?? '').trim() ? (
                        <p className="text-xs text-zinc-500">{t.artist}</p>
                      ) : null}
                      {typeof dur === 'number' ? (
                        <p className="text-[10px] text-zinc-400">{dur}s</p>
                      ) : null}
                    </div>
                    {prev ? (
                      <button
                        type="button"
                        className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50"
                        onClick={() => setPreviewTrackUrl(prev)}
                      >
                        Náhled
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                      onClick={() => {
                        setMusicTrackId(t.id);
                        setPendingRegen(true);
                      }}
                    >
                      Vybrat
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {previewTrackUrl ? (
            <div className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <p className="text-xs font-medium text-zinc-600">Přehrávání náhledu</p>
              <audio
                key={previewTrackUrl}
                src={previewTrackUrl}
                controls
                className="mt-2 w-full max-w-md"
                autoPlay
              />
              <button
                type="button"
                className="mt-2 text-xs text-zinc-600 underline"
                onClick={() => setPreviewTrackUrl(null)}
              >
                Zavřít přehrávač
              </button>
            </div>
          ) : null}
          <label className="mt-4 block text-sm font-medium text-zinc-700">Nebo vestavěná hudba</label>
          <select
            value={musicBuiltinKey}
            onChange={(e) => {
              setMusicBuiltinKey(e.target.value);
              setPendingRegen(true);
            }}
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
                if (r.ok && r.data) {
                  setData(r.data);
                  setPendingRegen(true);
                } else setErr(r.error ?? 'Úprava hudby selhala');
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
                          if (r.ok && r.data) {
                            setData(r.data);
                            setPendingRegen(true);
                          } else setErr(r.error ?? 'Cover selhalo');
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
                        if (r.ok && r.data) {
                          setData(r.data);
                          setPendingRegen(true);
                        }
                      });
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="rounded-full border border-red-200 px-2 py-1 text-xs text-red-700"
                  onClick={() =>
                    void nestDeleteShortsMediaItem(apiAccessToken, data.id, m.id).then((r) => {
                      if (r.ok && r.data) {
                        setData(r.data);
                        setPendingRegen(true);
                      } else setErr(r.error ?? 'Smazání selhalo');
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
                  if (r.ok && r.data) {
                    setData(r.data);
                    setPendingRegen(true);
                  } else setErr(r.error ?? 'Upload selhal');
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
                      setPendingRegen(true);
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
              key={`${feedPreview.videoUrl}:${data.renderVersion ?? 0}`}
              src={feedPreview.videoUrl}
              controls
              className="mt-4 aspect-[9/16] w-full max-w-xs rounded-xl bg-black"
            />
          ) : (
            <p className="mt-2 text-sm text-zinc-600">
              Zatím žádné video — použijte „Vygenerovat náhled“ nebo „Přegenerovat shorts“.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Náhled ve feedu (karta)</h2>
          {feedPreview?.videoUrl ? (
            <div className="mt-4 max-w-xs overflow-hidden rounded-xl border border-zinc-200 bg-black shadow-md">
              <video
                key={`${feedPreview.videoUrl}:${data.renderVersion ?? 0}`}
                src={feedPreview.videoUrl}
                muted
                playsInline
                className="aspect-[9/16] w-full"
              />
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
            onClick={() => void saveDraftOrPublished()}
            className="rounded-full border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {busy === 'save' ? 'Ukládám…' : isPublished ? 'Uložit změny' : 'Uložit koncept'}
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
            onClick={() => void runRegenerate(true)}
            className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy === 'preview' ? 'Generuji…' : 'Přegenerovat shorts'}
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
