'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import {
  TIKTOK_JOB_STATUS_LABELS,
  nestTikTokCancelJob,
  nestTikTokCreateJob,
  nestTikTokDisconnect,
  nestTikTokListJobs,
  nestTikTokRetryJob,
  nestTikTokStatus,
  nestTikTokTestConnection,
  nestTikTokUpdateSettings,
  type TikTokConnectionStatus,
  type TikTokPublishJobRow,
} from '@/lib/tiktok-admin-api';

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

export default function AdminTikTokPage() {
  const { user, apiAccessToken, isLoading } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState<TikTokConnectionStatus | null>(null);
  const [jobs, setJobs] = useState<TikTokPublishJobRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [manualListingId, setManualListingId] = useState('');
  const [jobFilter, setJobFilter] = useState<string>('');

  const load = useCallback(async () => {
    if (!apiAccessToken) return;
    const [st, list] = await Promise.all([
      nestTikTokStatus(apiAccessToken),
      nestTikTokListJobs(apiAccessToken, jobFilter || undefined),
    ]);
    setStatus(st);
    setJobs(list);
  }, [apiAccessToken, jobFilter]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') return;
    void load();
  }, [user, isLoading, load]);

  useEffect(() => {
    const tiktok = params.get('tiktok');
    if (!tiktok) return;
    if (tiktok === 'connected') {
      setMsg('TikTok účet byl úspěšně propojen.');
    } else if (tiktok === 'error') {
      setErr(`Propojení selhalo: ${decodeURIComponent(params.get('reason') ?? 'neznámá chyba')}`);
    }
    router.replace('/admin/marketing/tiktok');
  }, [params, router]);

  async function connectTikTok() {
    window.location.href = '/api/tiktok/auth';
  }

  async function disconnectTikTok() {
    if (!apiAccessToken || !window.confirm('Odpojit TikTok účet portálu?')) return;
    setBusy(true);
    await nestTikTokDisconnect(apiAccessToken);
    setBusy(false);
    setMsg('TikTok účet odpojen.');
    await load();
  }

  async function testConnection() {
    if (!apiAccessToken) return;
    setBusy(true);
    setErr(null);
    const r = await nestTikTokTestConnection(apiAccessToken);
    setBusy(false);
    if (!r?.ok) {
      setErr('Test spojení selhal.');
      return;
    }
    setMsg(r.message + (r.creatorUsername ? ` (@${r.creatorUsername})` : ''));
  }

  async function saveSettings(patch: Partial<{ autoPublish: boolean; preferDirectPublish: boolean }>) {
    if (!apiAccessToken) return;
    setBusy(true);
    await nestTikTokUpdateSettings(apiAccessToken, patch);
    setBusy(false);
    await load();
  }

  async function publishListing(listingId: string) {
    if (!apiAccessToken || !listingId.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await nestTikTokCreateJob(apiAccessToken, listingId.trim());
    setBusy(false);
    if (!r?.ok) {
      setErr('Vytvoření publish jobu selhalo.');
      return;
    }
    setMsg('Video bylo zařazeno do fronty TikTok.');
    await load();
  }

  if (isLoading) return <p className="p-6 text-sm text-gray-500">Načítání…</p>;
  if (!user || user.role !== 'ADMIN') {
    return <p className="p-6 text-sm text-red-600">Přístup pouze pro administrátory.</p>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">TikTok</h1>
          <p className="mt-1 text-sm text-gray-600">
            Propojení oficiálního účtu XXREALIT a publikování videí z inzerátů.
          </p>
        </div>
        <Link
          href="/admin/marketing/tiktok/demo"
          className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-800 hover:bg-orange-100"
        >
          Demo pro recenzi →
        </Link>
      </div>

      {msg && <p className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">{msg}</p>}
      {err && <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{err}</p>}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Nastavení API</h2>
        <p className="mt-1 text-xs text-gray-500">
          Client Key a Secret se nastavují pouze v ENV na serveru — nikdy se neposílají do prohlížeče.
        </p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Client Key</dt>
            <dd className="font-mono">{status?.clientKeyMasked ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Client Secret</dt>
            <dd className="font-mono">{status?.clientSecretMasked ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Redirect URI</dt>
            <dd className="break-all font-mono text-xs">{status?.redirectUri ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">API Base URL</dt>
            <dd className="font-mono text-xs">{status?.baseUrl ?? '—'}</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Propojení účtu</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-gray-500">Stav</dt>
            <dd>{status?.connected ? '✓ Propojeno' : 'Nepropojeno'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Účet</dt>
            <dd>{status?.accountName ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Open ID</dt>
            <dd className="font-mono text-xs">{status?.openId ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Access token</dt>
            <dd className="font-mono text-xs">{status?.accessTokenMasked ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Platnost tokenu</dt>
            <dd>{formatDt(status?.expiresAt)}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Scope</dt>
            <dd className="text-xs">{status?.scope ?? '—'}</dd>
          </div>
        </dl>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !status?.configured}
            onClick={() => void connectTikTok()}
            className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Připojit TikTok
          </button>
          <button
            type="button"
            disabled={busy || !status?.connected}
            onClick={() => void disconnectTikTok()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            Odpojit TikTok
          </button>
          <button
            type="button"
            disabled={busy || !status?.connected}
            onClick={() => void testConnection()}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm disabled:opacity-50"
          >
            Otestovat spojení
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Automatické publikování</h2>
        <div className="mt-4 space-y-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={status?.settings.autoPublish ?? false}
              onChange={(e) => void saveSettings({ autoPublish: e.target.checked })}
              disabled={busy}
            />
            Automaticky publikovat nové inzeráty s videem na TikTok
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={status?.settings.preferDirectPublish ?? true}
              onChange={(e) => void saveSettings({ preferDirectPublish: e.target.checked })}
              disabled={busy}
            />
            Preferovat přímé publikování (video.publish), jinak inbox draft
          </label>
          <p className="text-xs text-gray-500">
            Zapněte také TikTok v sekci{' '}
            <Link href="/admin/marketing/socialni-site" className="text-orange-600 underline">
              Sociální sítě
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Ruční publikování</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={manualListingId}
            onChange={(e) => setManualListingId(e.target.value)}
            placeholder="ID inzerátu"
            className="min-w-[240px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void publishListing(manualListingId)}
            className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Publikovat na TikTok
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Fronta publikování</h2>
          <select
            value={jobFilter}
            onChange={(e) => setJobFilter(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Vše</option>
            {Object.entries(TIKTOK_JOB_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="pb-2 pr-3">Stav</th>
                <th className="pb-2 pr-3">Inzerát</th>
                <th className="pb-2 pr-3">Titulek</th>
                <th className="pb-2 pr-3">Pokusy</th>
                <th className="pb-2 pr-3">Chyba</th>
                <th className="pb-2 pr-3">Akce</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b align-top">
                  <td className="py-2 pr-3">
                    {TIKTOK_JOB_STATUS_LABELS[job.status] ?? job.status}
                    {job.isDraftInbox && job.status === 'UPLOADED' ? ' (inbox)' : ''}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{job.listingId}</td>
                  <td className="py-2 pr-3 max-w-xs truncate">{job.caption}</td>
                  <td className="py-2 pr-3">{job.attempts}</td>
                  <td className="py-2 pr-3 text-xs text-red-700">{job.errorMessage ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-wrap gap-1">
                      <a
                        href={`/admin/inzeraty?highlight=${encodeURIComponent(job.listingId)}`}
                        className="text-xs text-orange-600 underline"
                      >
                        Inzerát
                      </a>
                      {job.tiktokVideoUrl && (
                        <a
                          href={job.tiktokVideoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-orange-600 underline"
                        >
                          TikTok
                        </a>
                      )}
                      {(job.status === 'FAILED' || job.status === 'NEEDS_REAUTH') && (
                        <button
                          type="button"
                          className="text-xs text-orange-600 underline"
                          onClick={() => void nestTikTokRetryJob(apiAccessToken!, job.id).then(load)}
                        >
                          Znovu
                        </button>
                      )}
                      {job.status === 'WAITING' && (
                        <button
                          type="button"
                          className="text-xs text-gray-600 underline"
                          onClick={() => void nestTikTokCancelJob(apiAccessToken!, job.id).then(load)}
                        >
                          Zrušit
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-gray-500">
                    Žádné publish joby.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
