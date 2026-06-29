'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  VERIFICATION_FILE_MAX_BYTES,
  publicVerificationFileUrl,
  validateVerificationFilenameClient,
  type VerificationFileRow,
} from '@/lib/verification-files';

async function fetchList(): Promise<{ items: VerificationFileRow[]; error?: string }> {
  const res = await fetch('/api/nest/admin/verification-files', {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as { message?: string };
    return { items: [], error: raw.message ?? `HTTP ${res.status}` };
  }
  return (await res.json()) as { items: VerificationFileRow[] };
}

async function uploadFile(file: File): Promise<{ ok: boolean; error?: string }> {
  const err = validateVerificationFilenameClient(file.name);
  if (err) return { ok: false, error: err };
  if (file.size > VERIFICATION_FILE_MAX_BYTES) {
    return { ok: false, error: 'Maximální velikost je 1 MB.' };
  }

  const fd = new FormData();
  fd.append('file', file, file.name);

  const res = await fetch('/api/nest/admin/verification-files', {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) {
    const raw = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const msg = raw.message;
    return { ok: false, error: Array.isArray(msg) ? msg.join(', ') : msg ?? `HTTP ${res.status}` };
  }
  return { ok: true };
}

async function setActive(id: string, isActive: boolean) {
  const res = await fetch(`/api/nest/admin/verification-files/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isActive }),
  });
  return res.ok;
}

async function removeFile(id: string) {
  const res = await fetch(`/api/nest/admin/verification-files/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return res.ok;
}

export default function AdminVerificationFilesPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<VerificationFileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const r = await fetchList();
    setItems(r.items);
    if (r.error) setErr(r.error);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  async function onUpload(file: File) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await uploadFile(file);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Nahrání selhalo');
      return;
    }
    setMsg(`Soubor ${file.name} byl nahrán.`);
    await refresh();
  }

  async function copyUrl(filename: string) {
    const url = publicVerificationFileUrl(filename);
    try {
      await navigator.clipboard.writeText(url);
      setMsg('URL zkopírována do schránky.');
    } catch {
      setErr('Kopírování se nepodařilo.');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/nastaveni-registrace" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Nastavení
        </Link>
        <h1 className="mt-1 text-2xl font-bold">Ověřovací soubory</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Nahrajte ověřovací soubory pro TikTok, Google Search Console, Facebook a další služby. Budou dostupné z kořene
          webu, např.{' '}
          <code className="rounded bg-zinc-100 px-1">https://www.xxrealit.cz/nazev-souboru.txt</code>
        </p>
      </div>

      {msg ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</p> : null}
      {err ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Nahrát soubor</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Povolené přípony: .txt, .html · max. 1 MB · název se zachová přesně podle uploadu
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.html,text/plain,text/html"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="mt-3 rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Vybrat a nahrát soubor
        </button>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Nahrané soubory</h2>
        {items.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500">Zatím žádné ověřovací soubory.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-zinc-500">
                  <th className="py-2 pr-3">Soubor</th>
                  <th className="py-2 pr-3">Veřejná URL</th>
                  <th className="py-2 pr-3">Nahráno</th>
                  <th className="py-2 pr-3">Stav</th>
                  <th className="py-2">Akce</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const url = publicVerificationFileUrl(row.filename);
                  return (
                    <tr key={row.id} className="border-b border-zinc-100 align-top">
                      <td className="py-3 pr-3 font-mono text-xs">{row.filename}</td>
                      <td className="py-3 pr-3">
                        <a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-[#e85d00] hover:underline">
                          {url}
                        </a>
                      </td>
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleString('cs-CZ')}
                        <p className="text-xs text-zinc-500">{row.uploadedBy.name}</p>
                      </td>
                      <td className="py-3 pr-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={row.isActive}
                            disabled={busy}
                            onChange={async (e) => {
                              setBusy(true);
                              await setActive(row.id, e.target.checked);
                              setBusy(false);
                              await refresh();
                            }}
                          />
                          {row.isActive ? 'Aktivní' : 'Neaktivní'}
                        </label>
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded border px-2 py-1 text-xs font-semibold"
                            onClick={() => void copyUrl(row.filename)}
                          >
                            Kopírovat URL
                          </button>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded border px-2 py-1 text-xs font-semibold"
                          >
                            Otestovat
                          </a>
                          <button
                            type="button"
                            className="rounded border border-red-300 px-2 py-1 text-xs font-semibold text-red-700"
                            disabled={busy}
                            onClick={async () => {
                              if (!window.confirm(`Smazat soubor ${row.filename}?`)) return;
                              setBusy(true);
                              await removeFile(row.id);
                              setBusy(false);
                              await refresh();
                            }}
                          >
                            Smazat
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
