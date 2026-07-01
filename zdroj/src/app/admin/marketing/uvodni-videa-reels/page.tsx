'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  SOCIAL_INTRO_PROPERTY_TYPE_LABELS,
  nestAdminCreateIntroVideo,
  nestAdminDeleteIntroVideo,
  nestAdminListIntroVideos,
  nestAdminReplaceIntroVideo,
  nestAdminUpdateIntroVideo,
  type SocialIntroVideoRow,
} from '@/lib/social-autopost-admin-api';

/** Stejný limit jako na backendu (FileInterceptor limits.fileSize). */
const INTRO_VIDEO_MAX_BYTES = 120 * 1024 * 1024;

const ACCEPTED_VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/avi',
  'video/mpeg',
]);

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateVideoFile(file: File): string | null {
  const type = file.type.trim().toLowerCase();
  const name = file.name.toLowerCase();
  const looksLikeVideo =
    type.startsWith('video/') ||
    ACCEPTED_VIDEO_TYPES.has(type) ||
    /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(name);

  if (!looksLikeVideo) {
    return 'Vyberte platný video soubor (MP4, WebM, MOV nebo jiné běžné video).';
  }
  if (file.size > INTRO_VIDEO_MAX_BYTES) {
    return `Soubor je příliš velký (max. ${formatFileSize(INTRO_VIDEO_MAX_BYTES)}).`;
  }
  if (file.size <= 0) {
    return 'Soubor je prázdný.';
  }
  return null;
}

export default function AdminReelIntroVideosPage() {
  const { user, apiAccessToken, isLoading } = useAuth();
  const fileInputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<SocialIntroVideoRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [propertyType, setPropertyType] = useState('DUM');
  const [priority, setPriority] = useState('0');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    if (!apiAccessToken) return;
    const list = await nestAdminListIntroVideos(apiAccessToken);
    setRows(list);
  }, [apiAccessToken]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') return;
    void load();
  }, [user, isLoading, load]);

  function onFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!file) {
      setSelectedFile(null);
      return;
    }
    const validationError = validateVideoFile(file);
    if (validationError) {
      setSelectedFile(null);
      setErr(validationError);
      return;
    }
    setSelectedFile(file);
    setErr(null);
  }

  function openFilePicker() {
    fileRef.current?.click();
  }

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function onUpload() {
    if (!apiAccessToken) return;
    if (!selectedFile) {
      setErr('Vyberte video soubor.');
      return;
    }
    const validationError = validateVideoFile(selectedFile);
    if (validationError) {
      setErr(validationError);
      return;
    }

    setBusy(true);
    setErr(null);
    setMsg(null);

    const form = new FormData();
    form.set('video', selectedFile);
    form.set('title', title.trim() || (SOCIAL_INTRO_PROPERTY_TYPE_LABELS[propertyType] ?? propertyType));
    form.set('propertyType', propertyType);
    form.set('priority', priority);
    form.set('active', 'true');

    const r = await nestAdminCreateIntroVideo(apiAccessToken, form);
    setBusy(false);

    if (!r.ok) {
      setErr(r.error ?? 'Nahrání selhalo');
      return;
    }

    setMsg('Úvodní video uloženo.');
    setTitle('');
    setPriority('0');
    clearSelectedFile();
    await load();
  }

  async function toggleActive(row: SocialIntroVideoRow) {
    if (!apiAccessToken) return;
    await nestAdminUpdateIntroVideo(apiAccessToken, row.id, { active: !row.active });
    await load();
  }

  async function removeRow(id: string) {
    if (!apiAccessToken || !window.confirm('Smazat úvodní video?')) return;
    await nestAdminDeleteIntroVideo(apiAccessToken, id);
    await load();
  }

  async function replaceVideo(row: SocialIntroVideoRow, file: File) {
    if (!apiAccessToken) return;
    const validationError = validateVideoFile(file);
    if (validationError) {
      setErr(validationError);
      return;
    }
    setBusy(true);
    setErr(null);
    const form = new FormData();
    form.set('video', file);
    const r = await nestAdminReplaceIntroVideo(apiAccessToken, row.id, form);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Nahrazení videa selhalo');
      return;
    }
    setMsg(`Video „${row.title}“ aktualizováno.`);
    await load();
  }

  if (!user || user.role !== 'ADMIN') {
    return <p className="p-8 text-sm text-zinc-600">Pouze pro administrátory.</p>;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link href="/admin/marketing/socialni-site" className="text-[#e85d00] hover:underline">
              ← Sociální sítě
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">Úvodní videa k Reelům</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Video se automaticky vloží před ukázku inzerátu při publikování na Facebook Reel podle typu
            nemovitosti. Délka ukázky inzerátu se řídí nastavením portálu.
          </p>
        </div>
      </div>

      <section className="mb-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Nahrát nové video</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Název</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
              placeholder="Např. Úvod pro domy"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Typ nemovitosti</span>
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
            >
              {Object.entries(SOCIAL_INTRO_PROPERTY_TYPE_LABELS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Priorita</span>
            <input
              type="number"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
            />
          </label>
          <div className="block text-sm">
            <span className="font-medium text-zinc-700">Video (MP4)</span>
            <input
              id={fileInputId}
              ref={fileRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/*,.mp4,.webm,.mov"
              className="sr-only"
              onChange={onFileInputChange}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openFilePicker}
                disabled={busy}
                className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                Vybrat soubor
              </button>
              {selectedFile ? (
                <>
                  <span className="text-sm text-zinc-700">
                    {selectedFile.name}{' '}
                    <span className="text-zinc-500">({formatFileSize(selectedFile.size)})</span>
                  </span>
                  <button
                    type="button"
                    onClick={clearSelectedFile}
                    className="text-xs text-red-600 underline"
                  >
                    Odebrat
                  </button>
                </>
              ) : (
                <span className="text-sm text-zinc-500">Zatím není vybrán žádný soubor</span>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              MP4, WebM nebo MOV · max. {formatFileSize(INTRO_VIDEO_MAX_BYTES)}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy || !selectedFile}
          onClick={() => void onUpload()}
          className="mt-4 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Nahrávám…' : 'Nahrát video'}
        </button>
        {msg ? <p className="mt-3 text-sm text-green-700">{msg}</p> : null}
        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">Aktivní úvodní videa</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                <th className="px-4 py-3">Název</th>
                <th className="px-4 py-3">Typ</th>
                <th className="px-4 py-3">Délka</th>
                <th className="px-4 py-3">Priorita</th>
                <th className="px-4 py-3">Stav</th>
                <th className="px-4 py-3">Náhled</th>
                <th className="px-4 py-3">Akce</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-zinc-500">
                    Zatím žádná úvodní videa.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-zinc-100 align-top">
                    <td className="px-4 py-3 font-medium text-zinc-900">{row.title}</td>
                    <td className="px-4 py-3">
                      {SOCIAL_INTRO_PROPERTY_TYPE_LABELS[row.propertyType] ?? row.propertyType}
                    </td>
                    <td className="px-4 py-3">
                      {row.durationSeconds != null ? `${row.durationSeconds.toFixed(1)} s` : '—'}
                    </td>
                    <td className="px-4 py-3">{row.priority}</td>
                    <td className="px-4 py-3">{row.active ? 'Aktivní' : 'Neaktivní'}</td>
                    <td className="px-4 py-3">
                      <video
                        src={row.videoUrl}
                        controls
                        preload="metadata"
                        className="h-24 w-14 rounded-lg bg-black object-cover"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleActive(row)}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50"
                        >
                          {row.active ? 'Deaktivovat' : 'Aktivovat'}
                        </button>
                        <ReplaceVideoButton
                          disabled={busy}
                          onPick={(file) => void replaceVideo(row, file)}
                        />
                        <button
                          type="button"
                          onClick={() => void removeRow(row.id)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                        >
                          Smazat
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ReplaceVideoButton({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime,video/*,.mp4,.webm,.mov"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPick(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-50"
      >
        Nahradit video
      </button>
    </>
  );
}
