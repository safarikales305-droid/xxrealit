'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  formatGraphErrorDetail,
  nestAdminSocialAutopostFacebookPatch,
  nestAdminSocialAutopostSettingsGet,
  nestAdminSocialAutopostTestConnection,
  nestAdminSocialAutopostTestPublish,
  nestAdminSocialQueueList,
  nestAdminSocialQueueRetry,
  nestAdminSocialQueueSkip,
  SOCIAL_CONTENT_TYPE_LABELS,
  SOCIAL_PUBLISH_STATUS_LABELS,
  USER_ROLE_LABELS,
  type SocialAutopostSettingsPublic,
  type SocialQueueRow,
} from '@/lib/social-autopost-admin-api';

type Tab = 'facebook' | 'instagram' | 'youtube' | 'tiktok';

const ROLE_OPTIONS = Object.keys(USER_ROLE_LABELS);

export default function AdminSocialAutopostPage() {
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [tab, setTab] = useState<Tab>('facebook');
  const [settings, setSettings] = useState<SocialAutopostSettingsPublic | null>(null);
  const [queue, setQueue] = useState<SocialQueueRow[]>([]);
  const [pageAccessToken, setPageAccessToken] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastPublishedUrl, setLastPublishedUrl] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const [s, q] = await Promise.all([
      nestAdminSocialAutopostSettingsGet(token),
      nestAdminSocialQueueList(token),
    ]);
    if (!s) {
      setLoadError('Nepodařilo se načíst nastavení sociálních sítí.');
      return;
    }
    setSettings(s);
    setQueue(q?.items ?? []);
    setLoadError(null);
  }, [token]);

  useEffect(() => {
    if (!isLoading && user?.role === 'ADMIN' && token) void refresh();
  }, [isLoading, user?.role, token, refresh]);

  if (isLoading) return <p className="p-6 text-sm text-zinc-500">Načítám…</p>;
  if (user?.role !== 'ADMIN') {
    return (
      <p className="p-6 text-sm text-zinc-600">
        Přístup pouze pro administrátory. <Link href="/admin">Zpět</Link>
      </p>
    );
  }

  const fb = settings?.facebook;

  async function saveFacebook() {
    if (!token || !fb) return;
    setBusy(true);
    setMsg(null);
    const patch: Record<string, unknown> = {
      enabled: fb.enabled,
      facebookEnabled: fb.enabled,
      pageId: fb.pageId,
      pageName: fb.pageName,
      tokenExpiresAt: fb.tokenExpiresAt,
      publishPosts: fb.publishPosts,
      publishProperties: fb.publishProperties,
      publishShorts: fb.publishShorts,
      approvedOnly: fb.approvedOnly,
      publicPostsOnly: fb.publicPostsOnly,
      professionalsOnly: fb.professionalsOnly,
      allowedRoles: fb.allowedRoles,
    };
    if (pageAccessToken.trim()) patch.pageAccessToken = pageAccessToken.trim();
    const next = await nestAdminSocialAutopostFacebookPatch(token, patch);
    setBusy(false);
    if (!next) {
      setMsg('Uložení se nezdařilo.');
      return;
    }
    setSettings(next);
    setPageAccessToken('');
    setMsg('Nastavení uloženo.');
  }

  async function runTestConnection() {
    if (!token) return;
    setBusy(true);
    const r = await nestAdminSocialAutopostTestConnection(token);
    setBusy(false);
    if (!r) {
      setMsg('Test připojení selhal (server nevrátil odpověď).');
      return;
    }
    if (r.ok) {
      const extra = r.tokenSource === 'me_accounts' ? ' (token doplněn z /me/accounts)' : '';
      setMsg(`Připojeno: ${r.pageName ?? fb?.pageName ?? 'OK'}${extra}`);
    } else {
      const detail = formatGraphErrorDetail(r.graphError) || r.error || 'Test selhal';
      setMsg(r.hint ? `${detail}\n\n${r.hint}` : detail);
    }
    void refresh();
  }

  async function runTestPublish() {
    if (!token) return;
    setBusy(true);
    setLastPublishedUrl(null);
    const r = await nestAdminSocialAutopostTestPublish(token);
    setBusy(false);
    if (r.ok && r.publishedUrl) {
      setLastPublishedUrl(r.publishedUrl);
      const idPart = r.externalPostId ? ` (ID: ${r.externalPostId})` : '';
      const tokenNote =
        r.tokenSource === 'me_accounts'
          ? '\n\nPoznámka: použit Page Access Token z /me/accounts — uložte ho do pole tokenu.'
          : '';
      setMsg(`✓ Publikováno${idPart}${tokenNote}`);
    } else {
      const detail =
        formatGraphErrorDetail(r.graphError) ||
        r.error ||
        r.httpError ||
        'Publikace selhala';
      setMsg(r.hint ? `${detail}\n\n${r.hint}` : detail);
    }
    void refresh();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-sm text-zinc-500">
          <Link href="/admin/bonusove-akce" className="hover:underline">
            Marketing
          </Link>{' '}
          / Sociální sítě
        </p>
        <h1 className="mt-1 text-2xl font-bold text-zinc-900">Sociální sítě — autoposting</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Automatické publikování příspěvků a inzerátů na Facebook stránku portálu XXREALIT.
        </p>
      </div>

      {loadError ? <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{loadError}</p> : null}
      {msg ? (
        <div className="rounded-xl bg-zinc-100 p-3 text-sm text-zinc-800">
          <p className="whitespace-pre-wrap">{msg}</p>
          {lastPublishedUrl ? (
            <a
              href={lastPublishedUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166fe0]"
            >
              Otevřít příspěvek na Facebooku
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
        {(
          [
            ['facebook', 'Facebook'],
            ['instagram', 'Instagram'],
            ['youtube', 'YouTube'],
            ['tiktok', 'TikTok'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === id ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'facebook' && fb ? (
        <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              checked={fb.enabled}
              onChange={(e) =>
                setSettings((s) =>
                  s ? { ...s, facebook: { ...s.facebook, enabled: e.target.checked } } : s,
                )
              }
            />
            Zapnout automatické publikování na Facebook
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Facebook Page ID</span>
              <input
                value={fb.pageId}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, facebook: { ...s.facebook, pageId: e.target.value } } : s,
                  )
                }
                className="mt-1 w-full rounded-xl border px-3 py-2"
                placeholder="123456789"
              />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-zinc-700">Název stránky</span>
              <input
                value={fb.pageName}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, facebook: { ...s.facebook, pageName: e.target.value } } : s,
                  )
                }
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="font-medium text-zinc-700">Page Access Token</span>
              <input
                type="password"
                value={pageAccessToken}
                onChange={(e) => setPageAccessToken(e.target.value)}
                className="mt-1 w-full rounded-xl border px-3 py-2"
                placeholder={fb.maskedToken ?? 'Nový token (ponechte prázdné pro zachování)'}
              />
              <p className="mt-1 text-xs text-zinc-500">
                {fb.tokenSet
                  ? `Uložený token: ${fb.maskedToken ?? '••••'}`
                  : 'Token zatím není nastaven (lze použít env FACEBOOK_PAGE_ACCESS_TOKEN)'}
                {fb.connected ? ' · Připojeno' : ''}
              </p>
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['publishPosts', 'Příspěvky uživatelů'],
                ['publishProperties', 'Klasické inzeráty'],
                ['publishShorts', 'Shorts / video inzeráty'],
                ['approvedOnly', 'Pouze schválené inzeráty'],
                ['publicPostsOnly', 'Pouze veřejné příspěvky (ne FB import)'],
                ['professionalsOnly', 'Jen profesionálové'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(fb[key])}
                  onChange={(e) =>
                    setSettings((s) =>
                      s ? { ...s, facebook: { ...s.facebook, [key]: e.target.checked } } : s,
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>

          <div>
            <p className="text-sm font-medium text-zinc-700">Jen vybrané role (prázdné = všechny)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((role) => {
                const on = fb.allowedRoles.includes(role);
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() =>
                      setSettings((s) => {
                        if (!s) return s;
                        const roles = on
                          ? s.facebook.allowedRoles.filter((r) => r !== role)
                          : [...s.facebook.allowedRoles, role];
                        return { ...s, facebook: { ...s.facebook, allowedRoles: roles } };
                      })
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      on ? 'bg-orange-100 text-orange-900' : 'bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {USER_ROLE_LABELS[role] ?? role}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveFacebook()}
              className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              Uložit
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runTestConnection()}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Test připojení
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runTestPublish()}
              className="rounded-xl border px-4 py-2 text-sm font-semibold"
            >
              Testovací příspěvek
            </button>
          </div>
        </section>
      ) : null}

      {tab !== 'facebook' ? (
        <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center text-sm text-zinc-600">
          {tab === 'instagram' && 'Instagram — připraveno později'}
          {tab === 'youtube' && 'YouTube — připraveno později'}
          {tab === 'tiktok' && 'TikTok — připraveno později'}
        </section>
      ) : null}

      {settings?.lastApiResponses?.length ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Poslední API odpovědi</h2>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
            {settings.lastApiResponses.map((log, i) => (
              <li key={`${log.at}-${i}`} className="rounded-lg border bg-zinc-50 p-2">
                <span className={log.ok ? 'text-emerald-700' : 'text-red-700'}>
                  {log.ok ? 'OK' : 'ERR'}
                </span>{' '}
                {log.action} · {new Date(log.at).toLocaleString('cs-CZ')}
                <pre className="mt-1 whitespace-pre-wrap break-all text-zinc-600">
                  {JSON.stringify(log.body, null, 2).slice(0, 800)}
                </pre>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Log publikování</h2>
          <button type="button" onClick={() => void refresh()} className="text-sm font-semibold text-orange-600">
            Obnovit
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-zinc-500">
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3">Typ</th>
                <th className="py-2 pr-3">Název</th>
                <th className="py-2 pr-3">Autor</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Pokusy</th>
                <th className="py-2 pr-3">Akce</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 align-top">
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString('cs-CZ')}
                  </td>
                  <td className="py-2 pr-3">{SOCIAL_CONTENT_TYPE_LABELS[row.contentType] ?? row.contentType}</td>
                  <td className="py-2 pr-3 max-w-[200px]">
                    <p className="line-clamp-2 font-medium">{row.contentTitle || row.contentId}</p>
                    {row.lastError ? (
                      <p className="mt-1 text-xs text-red-600">{row.lastError}</p>
                    ) : null}
                    {row.publishedUrl ? (
                      <a
                        href={row.publishedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-xs text-orange-600 hover:underline"
                      >
                        Facebook post →
                      </a>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{row.author?.name ?? '—'}</td>
                  <td className="py-2 pr-3">{SOCIAL_PUBLISH_STATUS_LABELS[row.status] ?? row.status}</td>
                  <td className="py-2 pr-3">{row.attempts}</td>
                  <td className="py-2 pr-3">
                    <div className="flex flex-col gap-1">
                      <button
                        type="button"
                        className="text-left text-xs font-semibold text-orange-600"
                        onClick={() => token && void nestAdminSocialQueueRetry(token, row.id).then(() => refresh())}
                      >
                        Publikovat znovu
                      </button>
                      <button
                        type="button"
                        className="text-left text-xs text-zinc-500"
                        onClick={() => token && void nestAdminSocialQueueSkip(token, row.id).then(() => refresh())}
                      >
                        Přeskočit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {queue.length === 0 ? <p className="mt-4 text-sm text-zinc-500">Fronta je prázdná.</p> : null}
        </div>
      </section>
    </div>
  );
}
