'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminPostSoundsDelete,
  nestAdminPostSoundsList,
  nestAdminPostSoundsUpdate,
  nestAdminPostSoundsUpload,
  type PostSoundTrackDto,
} from '@/lib/nest-client';
import { PageLoadingSpinner } from '@/components/ui/page-loading';

const MAX_UPLOAD_MB = 25;

export default function AdminZvukyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [tracks, setTracks] = useState<PostSoundTrackDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArtist, setUploadArtist] = useState('');
  const [uploadActive, setUploadActive] = useState(true);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setListLoading(true);
    setLoadError(null);
    const list = await nestAdminPostSoundsList(token);
    setListLoading(false);
    if (!list) {
      setLoadError('Nepodařilo se načíst zvuky.');
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
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadMsg(null);
    if (!token) return;
    const title = uploadTitle.trim();
    if (!title) {
      setUploadMsg('Vyplňte název zvuku.');
      return;
    }
    if (!uploadFile) {
      setUploadMsg('Vyberte audio soubor (MP3, WAV, M4A).');
      return;
    }
    if (uploadFile.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setUploadMsg(`Soubor je větší než ${MAX_UPLOAD_MB} MB.`);
      return;
    }
    const fd = new FormData();
    fd.append('file', uploadFile);
    fd.append('title', title);
    if (uploadArtist.trim()) fd.append('artist', uploadArtist.trim());
    fd.append('isActive', uploadActive ? 'true' : 'false');
    setUploading(true);
    const r = await nestAdminPostSoundsUpload(token, fd);
    setUploading(false);
    if (!r.ok) {
      setUploadMsg(r.error ?? 'Upload selhal.');
      return;
    }
    setUploadMsg('Zvuk byl nahrán.');
    setUploadTitle('');
    setUploadArtist('');
    setUploadFile(null);
    await refresh();
  }

  async function toggleActive(track: PostSoundTrackDto) {
    if (!token) return;
    setBusyId(track.id);
    await nestAdminPostSoundsUpdate(token, track.id, { isActive: !track.isActive });
    setBusyId(null);
    await refresh();
  }

  async function onDelete(id: string) {
    if (!token || !window.confirm('Smazat tento zvuk?')) return;
    setBusyId(id);
    await nestAdminPostSoundsDelete(token, id);
    setBusyId(null);
    await refresh();
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <PageLoadingSpinner label="Načítám administraci…" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Zvuky k příspěvkům</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Hudba a zvuky, které mohou uživatelé přidat k video příspěvkům.
          </p>
        </div>
        <Link href="/admin" className="text-sm font-semibold text-orange-600 hover:underline">
          ← Admin
        </Link>
      </div>

      <form onSubmit={(e) => void onUpload(e)} className="mb-8 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-bold text-zinc-900">Nahrát zvuk</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <input
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="Název"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            value={uploadArtist}
            onChange={(e) => setUploadArtist(e.target.value)}
            placeholder="Interpret (volitelné)"
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            type="file"
            accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,.mp3,.wav,.m4a"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            className="text-sm md:col-span-2"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={uploadActive}
              onChange={(e) => setUploadActive(e.target.checked)}
            />
            Aktivní
          </label>
        </div>
        <button
          type="submit"
          disabled={uploading}
          className="mt-4 rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {uploading ? 'Nahrávám…' : 'Nahrát'}
        </button>
        {uploadMsg ? <p className="mt-2 text-sm text-zinc-700">{uploadMsg}</p> : null}
      </form>

      {loadError ? <p className="mb-4 text-sm text-red-600">{loadError}</p> : null}
      {listLoading ? (
        <PageLoadingSpinner label="Načítám zvuky…" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-3">Název</th>
                <th className="px-3 py-3">Interpret</th>
                <th className="px-3 py-3">Stav</th>
                <th className="px-3 py-3">Akce</th>
              </tr>
            </thead>
            <tbody>
              {tracks.map((track) => (
                <tr key={track.id} className="border-b">
                  <td className="px-3 py-3 font-medium">{track.title}</td>
                  <td className="px-3 py-3">{track.artist || '—'}</td>
                  <td className="px-3 py-3">{track.isActive === false ? 'Neaktivní' : 'Aktivní'}</td>
                  <td className="px-3 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === track.id}
                        onClick={() => void toggleActive(track)}
                        className="rounded border px-2 py-1 text-xs"
                      >
                        {track.isActive === false ? 'Zapnout' : 'Vypnout'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === track.id}
                        onClick={() => void onDelete(track.id)}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-700"
                      >
                        Smazat
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {tracks.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-zinc-500">Zatím žádné zvuky.</p>
          ) : null}
        </div>
      )}
    </main>
  );
}
