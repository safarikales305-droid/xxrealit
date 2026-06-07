'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestAdminShareGateVideoDelete,
  nestAdminShareGateVideosList,
  nestAdminShareGateVideoUpdate,
  nestAdminShareGateVideoUpload,
  nestApiConfigured,
  type ShareGateVideoAdminDto,
} from '@/lib/nest-client';

const TARGET_TYPES = [
  { value: 'ALL', label: 'Všechny sdílené odkazy' },
  { value: 'CLASSIC_LISTING', label: 'Klasický inzerát' },
  { value: 'SHORTS_LISTING', label: 'Shorts inzerát' },
  { value: 'TIP_LISTING', label: 'Tip na nemovitost' },
  { value: 'TIP_SHORTS', label: 'Tipařský Shorts tip' },
] as const;

const MAX_VIDEO_MB = 120;

function targetLabel(value: string): string {
  return TARGET_TYPES.find((t) => t.value === value)?.label ?? value;
}

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminShareGateVideosPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [rows, setRows] = useState<ShareGateVideoAdminDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadTargetType, setUploadTargetType] = useState<string>('ALL');
  const [uploadActive, setUploadActive] = useState(true);
  const [uploadSortOrder, setUploadSortOrder] = useState('0');
  const [uploadMinWatch, setUploadMinWatch] = useState('5');
  const [uploadButtonText, setUploadButtonText] = useState('Pokračovat na inzerát');
  const [uploadActiveFrom, setUploadActiveFrom] = useState('');
  const [uploadActiveTo, setUploadActiveTo] = useState('');
  const [uploadVideoFile, setUploadVideoFile] = useState<File | null>(null);
  const [uploadPosterFile, setUploadPosterFile] = useState<File | null>(null);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [editing, setEditing] = useState<ShareGateVideoAdminDto | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editTargetType, setEditTargetType] = useState('ALL');
  const [editActive, setEditActive] = useState(true);
  const [editSortOrder, setEditSortOrder] = useState('0');
  const [editMinWatch, setEditMinWatch] = useState('5');
  const [editButtonText, setEditButtonText] = useState('Pokračovat na inzerát');
  const [editActiveFrom, setEditActiveFrom] = useState('');
  const [editActiveTo, setEditActiveTo] = useState('');
  const [editVideoFile, setEditVideoFile] = useState<File | null>(null);
  const [editPosterFile, setEditPosterFile] = useState<File | null>(null);
  const [editClearPoster, setEditClearPoster] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const list = await nestAdminShareGateVideosList(token);
    if (!list) {
      setLoadError('Nepodařilo se načíst reklamní videa.');
      setRows([]);
      return;
    }
    setRows(list);
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

  function openEdit(row: ShareGateVideoAdminDto) {
    setEditing(row);
    setEditTitle(row.title);
    setEditTargetType(row.targetType);
    setEditActive(row.isActive);
    setEditSortOrder(String(row.sortOrder ?? 0));
    setEditMinWatch(String(row.minWatchSeconds ?? 5));
    setEditButtonText(row.buttonText || 'Pokračovat na inzerát');
    setEditActiveFrom(toDatetimeLocal(row.activeFrom));
    setEditActiveTo(toDatetimeLocal(row.activeTo));
    setEditVideoFile(null);
    setEditPosterFile(null);
    setEditClearPoster(false);
    setEditMsg(null);
  }

  function closeEdit() {
    setEditing(null);
    setEditMsg(null);
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadMsg(null);
    if (!token) return;
    const title = uploadTitle.trim();
    if (!title) {
      setUploadMsg('Vyplňte název.');
      return;
    }
    if (!uploadVideoFile) {
      setUploadMsg('Vyberte video (MP4, WebM, MOV).');
      return;
    }
    if (uploadVideoFile.size > MAX_VIDEO_MB * 1024 * 1024) {
      setUploadMsg(`Video je větší než ${MAX_VIDEO_MB} MB.`);
      return;
    }
    const fd = new FormData();
    fd.append('video', uploadVideoFile);
    if (uploadPosterFile) fd.append('poster', uploadPosterFile);
    fd.append('title', title);
    fd.append('targetType', uploadTargetType);
    fd.append('isActive', uploadActive ? 'true' : 'false');
    fd.append('sortOrder', uploadSortOrder.trim() || '0');
    fd.append('minWatchSeconds', uploadMinWatch.trim() || '5');
    fd.append('buttonText', uploadButtonText.trim() || 'Pokračovat na inzerát');
    if (uploadActiveFrom.trim()) fd.append('activeFrom', uploadActiveFrom.trim());
    if (uploadActiveTo.trim()) fd.append('activeTo', uploadActiveTo.trim());

    setUploading(true);
    const r = await nestAdminShareGateVideoUpload(token, fd);
    setUploading(false);
    if (!r.ok) {
      setUploadMsg(r.error ?? 'Upload selhal.');
      return;
    }
    setUploadMsg('Reklamní video bylo nahráno.');
    setUploadTitle('');
    setUploadVideoFile(null);
    setUploadPosterFile(null);
    await refresh();
  }

  async function onSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !editing) return;
    setEditMsg(null);

    const title = editTitle.trim();
    if (!title) {
      setEditMsg('Vyplňte název.');
      return;
    }
    if (editVideoFile && editVideoFile.size > MAX_VIDEO_MB * 1024 * 1024) {
      setEditMsg(`Video je větší než ${MAX_VIDEO_MB} MB.`);
      return;
    }

    const sortOrder = Number.parseInt(editSortOrder, 10);
    const minWatchSeconds = Number.parseInt(editMinWatch, 10);

    setEditSaving(true);
    const r = await nestAdminShareGateVideoUpdate(
      token,
      editing.id,
      {
        title,
        targetType: editTargetType,
        isActive: editActive,
        sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        minWatchSeconds:
          Number.isFinite(minWatchSeconds) && minWatchSeconds >= 1 ? minWatchSeconds : 5,
        buttonText: editButtonText.trim() || 'Pokračovat na inzerát',
        activeFrom: editActiveFrom.trim() || null,
        activeTo: editActiveTo.trim() || null,
        clearPoster: editClearPoster,
      },
      { video: editVideoFile, poster: editPosterFile },
    );
    setEditSaving(false);

    if (!r.ok) {
      setEditMsg(r.error ?? 'Uložení selhalo.');
      return;
    }

    setSaveSuccessMsg('Reklamní video bylo upraveno');
    closeEdit();
    await refresh();
    window.setTimeout(() => setSaveSuccessMsg(null), 4000);
  }

  async function onToggleActive(row: ShareGateVideoAdminDto) {
    if (!token) return;
    setBusyId(row.id);
    const r = await nestAdminShareGateVideoUpdate(token, row.id, { isActive: !row.isActive });
    setBusyId(null);
    if (!r.ok) setLoadError(r.error ?? 'Uložení selhalo');
    else await refresh();
  }

  async function onDelete(row: ShareGateVideoAdminDto) {
    if (!token) return;
    if (!window.confirm(`Smazat „${row.title}"?`)) return;
    setBusyId(row.id);
    const r = await nestAdminShareGateVideoDelete(token, row.id);
    setBusyId(null);
    if (!r.ok) setLoadError(r.error ?? 'Smazání selhalo');
    else await refresh();
  }

  if (!nestApiConfigured()) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-zinc-600">
        Nastavte API URL pro administraci.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Reklamní videa pro sdílené odkazy</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Zobrazí se nepřihlášeným uživatelům před otevřením sdíleného inzerátu nebo tipu.
          </p>
        </div>
        <Link
          href="/admin"
          className="rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
        >
          ← Administrace
        </Link>
      </div>

      {loadError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      {saveSuccessMsg ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {saveSuccessMsg}
        </p>
      ) : null}

      <form
        onSubmit={onUpload}
        className="mb-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-zinc-900">Nahrát nové video</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700">Název</span>
            <input
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
              required
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Typ obsahu</span>
            <select
              value={uploadTargetType}
              onChange={(e) => setUploadTargetType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            >
              {TARGET_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Pořadí (sortOrder)</span>
            <input
              type="number"
              min={0}
              value={uploadSortOrder}
              onChange={(e) => setUploadSortOrder(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Min. sekund před zavřením</span>
            <input
              type="number"
              min={1}
              max={120}
              value={uploadMinWatch}
              onChange={(e) => setUploadMinWatch(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Text tlačítka</span>
            <input
              value={uploadButtonText}
              onChange={(e) => setUploadButtonText(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Aktivní od (volitelné)</span>
            <input
              type="datetime-local"
              value={uploadActiveFrom}
              onChange={(e) => setUploadActiveFrom(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-zinc-700">Aktivní do (volitelné)</span>
            <input
              type="datetime-local"
              value={uploadActiveTo}
              onChange={(e) => setUploadActiveTo(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700">Video (MP4, WebM, MOV)</span>
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              onChange={(e) => setUploadVideoFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
              required
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="font-medium text-zinc-700">Poster (volitelný náhled)</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setUploadPosterFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={uploadActive}
              onChange={(e) => setUploadActive(e.target.checked)}
            />
            Aktivní hned po nahrání
          </label>
        </div>
        {uploadMsg ? (
          <p className="mt-3 text-sm text-zinc-700" role="status">
            {uploadMsg}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={uploading}
          className="mt-4 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {uploading ? 'Nahrávám…' : 'Nahrát video'}
        </button>
      </form>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3">Název</th>
              <th className="px-4 py-3">Typ</th>
              <th className="px-4 py-3">Pořadí</th>
              <th className="px-4 py-3">Min. s</th>
              <th className="px-4 py-3">Stav</th>
              <th className="px-4 py-3">Akce</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                  Zatím žádná reklamní videa.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-zinc-900">{row.title}</td>
                  <td className="px-4 py-3 text-zinc-600">{targetLabel(row.targetType)}</td>
                  <td className="px-4 py-3 tabular-nums">{row.sortOrder}</td>
                  <td className="px-4 py-3 tabular-nums">{row.minWatchSeconds}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        row.isActive
                          ? 'rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800'
                          : 'rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600'
                      }
                    >
                      {row.isActive ? 'Zapnuto' : 'Vypnuto'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => openEdit(row)}
                        className="rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50"
                      >
                        Upravit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void onToggleActive(row)}
                        className="rounded-lg border border-zinc-300 px-2.5 py-1 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {row.isActive ? 'Vypnout' : 'Zapnout'}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.id}
                        onClick={() => void onDelete(row)}
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
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

      {editing ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-share-gate-title"
        >
          <form
            onSubmit={(e) => void onSaveEdit(e)}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h2 id="edit-share-gate-title" className="text-lg font-semibold text-zinc-900">
                Upravit reklamní video
              </h2>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-lg px-2 py-1 text-sm text-zinc-500 hover:bg-zinc-100"
                aria-label="Zavřít"
              >
                ×
              </button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-zinc-700">Název</span>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Typ zobrazení</span>
                <select
                  value={editTargetType}
                  onChange={(e) => setEditTargetType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                >
                  {TARGET_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Pořadí</span>
                <input
                  type="number"
                  min={0}
                  value={editSortOrder}
                  onChange={(e) => setEditSortOrder(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Min. sekund před zavřením</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={editMinWatch}
                  onChange={(e) => setEditMinWatch(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-zinc-700">Text tlačítka</span>
                <input
                  value={editButtonText}
                  onChange={(e) => setEditButtonText(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Aktivní od</span>
                <input
                  type="datetime-local"
                  value={editActiveFrom}
                  onChange={(e) => setEditActiveFrom(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-zinc-700">Aktivní do</span>
                <input
                  type="datetime-local"
                  value={editActiveTo}
                  onChange={(e) => setEditActiveTo(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input
                  type="checkbox"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                />
                Aktivní (zobrazovat na sdílených odkazech)
              </label>

              <div className="sm:col-span-2 rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-600">
                <p className="font-medium text-zinc-700">Aktuální soubory</p>
                <p className="mt-1 break-all">
                  Video:{' '}
                  <a
                    href={nestAbsoluteAssetUrl(editing.videoUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-orange-700 underline"
                  >
                    otevřít
                  </a>
                </p>
                {editing.posterUrl ? (
                  <p className="mt-1 break-all">
                    Poster:{' '}
                    <a
                      href={nestAbsoluteAssetUrl(editing.posterUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-700 underline"
                    >
                      náhled
                    </a>
                  </p>
                ) : (
                  <p className="mt-1">Poster: žádný</p>
                )}
              </div>

              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-zinc-700">Nahradit video (volitelné)</span>
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
                  onChange={(e) => setEditVideoFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-sm"
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                <span className="font-medium text-zinc-700">Nahradit poster (volitelné)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  onChange={(e) => {
                    setEditPosterFile(e.target.files?.[0] ?? null);
                    if (e.target.files?.[0]) setEditClearPoster(false);
                  }}
                  className="mt-1 w-full text-sm"
                />
              </label>
              {editing.posterUrl ? (
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={editClearPoster}
                    onChange={(e) => setEditClearPoster(e.target.checked)}
                  />
                  Odstranit stávající poster
                </label>
              ) : null}
            </div>

            {editMsg ? (
              <p className="mt-3 text-sm text-red-700" role="alert">
                {editMsg}
              </p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={editSaving}
                className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {editSaving ? 'Ukládám…' : 'Uložit změny'}
              </button>
              <button
                type="button"
                onClick={closeEdit}
                className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Zrušit
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
