'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { getClientTokenFromCookie } from '@/lib/api';
import {
  nestAdminShortsMusicDelete,
  nestAdminShortsMusicList,
  nestAdminShortsMusicUpdate,
  nestAdminShortsMusicUpload,
  nestApiConfigured,
  type ShortsMusicTrackDto,
} from '@/lib/nest-client';

const MAX_UPLOAD_MB = 25;

export default function AdminHudbaPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [tracks, setTracks] = useState<ShortsMusicTrackDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploadActive, setUploadActive] = useState(true);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const list = await nestAdminShortsMusicList(token);
    if (!list) {
      setLoadError('Nepodařilo se načíst skladby (API / oprávnění ADMIN).');
      setTracks([]);
      return;
    }
    setTracks(list);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') {
      void refresh();
    }
  }, [token, user?.role, refresh]);

  useEffect(() => {
    const stored = getClientTokenFromCookie();
    console.log('TOKEN:', stored);
  }, []);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadMsg(null);
    if (!token) return;
    const title = uploadTitle.trim();
    if (!title) {
      setUploadMsg('Vyplňte název skladby.');
      return;
    }
    if (!uploadFile) {
      setUploadMsg('Vyberte audio soubor (MP3, WAV, M4A).');
      return;
    }
    const ext = uploadFile.name.toLowerCase();
    if (!ext.endsWith('.mp3') && !ext.endsWith('.wav') && !ext.endsWith('.m4a')) {
      setUploadMsg('Povolené přípony: .mp3, .wav, .m4a');
      return;
    }
    if (uploadFile.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadMsg(`Soubor je větší než ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('title', title);
    if (uploadDescription.trim()) {
      fd.append('description', uploadDescription.trim());
    }
    fd.append('isActive', uploadActive ? 'true' : 'false');
    setUploading(true);
    const r = await nestAdminShortsMusicUpload(token, fd);
    setUploading(false);
    if (!r.ok) {
      setUploadMsg(r.error ?? 'Upload selhal.');
      return;
    }
    setUploadMsg('Skladba byla nahrána.');
    setUploadTitle('');
    setUploadDescription('');
    setUploadFile(null);
    setUploadActive(true);
    await refresh();
  }

  async function onToggleActive(t: ShortsMusicTrackDto) {
    if (!token) return;
    setBusyId(t.id);
    const r = await nestAdminShortsMusicUpdate(token, t.id, { isActive: !t.isActive });
    setBusyId(null);
    if (!r.ok) setLoadError(r.error ?? 'Uložení selhalo');
    else await refresh();
  }

  async function onSaveTitle(t: ShortsMusicTrackDto, title: string) {
    if (!token) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === t.title) return;
    setBusyId(t.id);
    const r = await nestAdminShortsMusicUpdate(token, t.id, { title: trimmed });
    setBusyId(null);
    if (!r.ok) setLoadError(r.error ?? 'Uložení názvu selhalo');
    else await refresh();
  }

  async function onSaveDescription(t: ShortsMusicTrackDto, description: string) {
    if (!token) return;
    setBusyId(t.id);
    const r = await nestAdminShortsMusicUpdate(token, t.id, {
      description: description.trim() ? description.trim() : null,
    });
    setBusyId(null);
    if (!r.ok) setLoadError(r.error ?? 'Uložení popisu selhalo');
    else await refresh();
  }

  async function onDelete(t: ShortsMusicTrackDto) {
    if (!token) return;
    if (!window.confirm(`Smazat skladbu „${t.title}“? Tato akce je nevratná.`)) return;
    setBusyId(t.id);
    const r = await nestAdminShortsMusicDelete(token, t.id);
    setBusyId(null);
    if (!r.ok) setLoadError(r.error ?? 'Smazání selhalo');
    else await refresh();
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-600">
        Načítání…
      </div>
    );
  }

  if (!token || !user || user.role !== 'ADMIN') {
    return null;
  }

  const apiOk = nestApiConfigured();

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="text-lg font-bold tracking-tight text-[#e85d00] hover:text-[#ff6a00]"
            >
              XXrealit
            </Link>
            <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-800">
              Admin
            </span>
            <span className="text-sm font-medium text-zinc-600">Hudba pro shorts</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              ← Hlavní admin
            </Link>
            <Link
              href="/"
              className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              Prohlížet nemovitosti
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8">
        {!apiOk ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Nastavte <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_URL</code> na Nest
            backend.
          </p>
        ) : null}

        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {loadError}
          </p>
        ) : null}

        <section>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">Hudební knihovna (shorts)</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Nahrané skladby se zobrazí přihlášeným uživatelům při generování shorts videa z fotek u
            nového inzerátu. Neaktivní položky se v nabídce neobjeví.
          </p>

          <form
            onSubmit={(e) => void onUpload(e)}
            className="mt-6 max-w-xl space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
          >
            <h2 className="text-base font-semibold text-zinc-900">Nahrát novou skladbu</h2>
            <div>
              <label htmlFor="m-title" className="mb-1 block text-sm font-medium text-zinc-700">
                Název skladby *
              </label>
              <input
                id="m-title"
                value={uploadTitle}
                onChange={(e) => setUploadTitle(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15"
              />
            </div>
            <div>
              <label htmlFor="m-desc" className="mb-1 block text-sm font-medium text-zinc-700">
                Popis (volitelné)
              </label>
              <textarea
                id="m-desc"
                rows={2}
                value={uploadDescription}
                onChange={(e) => setUploadDescription(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm outline-none focus:border-[#ff6a00]/55 focus:ring-2 focus:ring-[#ff6a00]/15"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-800">
              <input
                type="checkbox"
                checked={uploadActive}
                onChange={(e) => setUploadActive(e.target.checked)}
                className="size-4 rounded border-zinc-300 text-[#ff6a00] focus:ring-[#ff6a00]/30"
              />
              Aktivní (zobrazit uživatelům)
            </label>
            <div>
              <label htmlFor="m-file" className="mb-1 block text-sm font-medium text-zinc-700">
                Soubor (MP3, WAV, M4A, max {MAX_UPLOAD_MB} MB)
              </label>
              <input
                id="m-file"
                type="file"
                accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/m4a"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-lg file:border-0 file:bg-orange-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-orange-600"
              />
            </div>
            {uploadMsg ? (
              <p
                className={
                  uploadMsg.includes('nahrána')
                    ? 'text-sm font-medium text-emerald-700'
                    : 'text-sm font-medium text-red-600'
                }
                role="status"
              >
                {uploadMsg}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={uploading || !apiOk}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-95 disabled:opacity-50"
            >
              {uploading ? 'Nahrávám…' : 'Nahrát skladbu'}
            </button>
          </form>
        </section>

        <section>
          <h2 className="mb-4 text-lg font-semibold tracking-tight">Seznam skladeb</h2>
          {tracks.length === 0 ? (
            <p className="text-sm text-zinc-500">Zatím žádné skladby.</p>
          ) : (
            <div className="space-y-4">
              {tracks.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  busy={busyId === t.id}
                  onToggleActive={() => void onToggleActive(t)}
                  onSaveTitle={(title) => void onSaveTitle(t, title)}
                  onSaveDescription={(desc) => void onSaveDescription(t, desc)}
                  onDelete={() => void onDelete(t)}
                />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function TrackRow({
  track,
  busy,
  onToggleActive,
  onSaveTitle,
  onSaveDescription,
  onDelete,
}: {
  track: ShortsMusicTrackDto;
  busy: boolean;
  onToggleActive: () => void;
  onSaveTitle: (title: string) => void;
  onSaveDescription: (description: string) => void;
  onDelete: () => void;
}) {
  const [editTitle, setEditTitle] = useState(track.title);
  const [editDescription, setEditDescription] = useState(track.description ?? '');

  useEffect(() => {
    setEditTitle(track.title);
  }, [track.title]);

  useEffect(() => {
    setEditDescription(track.description ?? '');
  }, [track.description]);

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                track.isActive !== false
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-zinc-200 text-zinc-700'
              }`}
            >
              {track.isActive !== false ? 'Aktivní' : 'Neaktivní'}
            </span>
            {typeof track.durationSec === 'number' && track.durationSec > 0 ? (
              <span className="text-xs text-zinc-500">~{track.durationSec} s</span>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Název</label>
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm font-medium text-zinc-900"
              />
            </div>
            <button
              type="button"
              disabled={busy || editTitle.trim() === track.title}
              onClick={() => onSaveTitle(editTitle)}
              className="shrink-0 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-40"
            >
              Uložit název
            </button>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-zinc-500">Popis</label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              rows={2}
              className="mt-0.5 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm text-zinc-800"
            />
            <button
              type="button"
              disabled={busy || (editDescription.trim() || '') === (track.description ?? '').trim()}
              onClick={() => onSaveDescription(editDescription)}
              className="mt-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 disabled:opacity-40"
            >
              Uložit popis
            </button>
          </div>
          {track.uploadedBy?.email ? (
            <p className="text-xs text-zinc-400">Nahrál: {track.uploadedBy.email}</p>
          ) : null}
          <audio src={track.fileUrl} controls className="mt-2 w-full max-w-md" />
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <button
            type="button"
            disabled={busy}
            onClick={onToggleActive}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
          >
            {track.isActive !== false ? 'Deaktivovat' : 'Aktivovat'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onDelete}
            className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Smazat
          </button>
        </div>
      </div>
    </article>
  );
}
