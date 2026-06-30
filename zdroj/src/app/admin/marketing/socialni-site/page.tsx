'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AdminFacebookAutopostOAuth } from '@/components/admin/AdminFacebookAutopostOAuth';
import {
  formatGraphErrorDetail,
  nestAdminSocialAutopostFacebookPatch,
  nestAdminSocialAutopostGlobalPatch,
  nestAdminSocialAutopostPlatformPatch,
  nestAdminSocialAutopostSettingsGet,
  nestAdminSocialAutopostTestConnection,
  nestAdminSocialAutopostTestPublish,
  nestAdminSocialQueueList,
  nestAdminSocialQueueRetry,
  nestAdminSocialQueueSkip,
  nestAdminPostSocialPublishStatus,
  nestAdminPostsPublishNow,
  POST_SOCIAL_PLATFORM_LABELS,
  POST_SOCIAL_PUBLISH_TYPE_LABELS,
  SOCIAL_CONTENT_TYPE_LABELS,
  SOCIAL_PUBLISH_STATUS_LABELS,
  USER_ROLE_LABELS,
  type PostSocialPublishRow,
  type PlatformPlaceholderSettings,
  type SocialAutopostGlobalSettings,
  type SocialAutopostSettingsPublic,
  type SocialQueueRow,
} from '@/lib/social-autopost-admin-api';

type Tab = 'facebook' | 'instagram' | 'youtube' | 'tiktok' | 'video';

const ROLE_OPTIONS = Object.keys(USER_ROLE_LABELS);

const DEFAULT_GLOBAL: SocialAutopostGlobalSettings = {
  autoPublishNewListings: true,
  autoPublishNewPosts: true,
  publishShortsAsReels: true,
  publishClassicAsPhotoPost: true,
  hidePublicPrice: true,
  repeatPublishingEnabled: true,
  videoTeaserMaxSeconds: 5,
  videoTeaserEndSlideText: 'Více na XXREALIT.cz',
  videoTeaserEndSlideEnabled: true,
  publishVideosAsReels: true,
  publishImagesAsPhotoPost: true,
  fallbackToLinkOnMediaFailure: false,
  socialVideoUsePortalTeaserRule: true,
  socialVideoTeaserSeconds: null,
  socialVideoPublishFull: false,
};

const GLOBAL_FIELDS: Array<{ key: keyof SocialAutopostGlobalSettings; label: string }> = [
  { key: 'autoPublishNewListings', label: 'Publikovat nové inzeráty automaticky na sociální sítě' },
  { key: 'autoPublishNewPosts', label: 'Publikovat nové uživatelské příspěvky automaticky na sociální sítě' },
  { key: 'publishShortsAsReels', label: 'Publikovat Shorts/video inzeráty jako Reels/Shorts' },
  { key: 'publishVideosAsReels', label: 'Publikovat videa (příspěvky i inzeráty) jako Reels' },
  { key: 'publishClassicAsPhotoPost', label: 'Publikovat klasické inzeráty jako foto příspěvek' },
  { key: 'publishImagesAsPhotoPost', label: 'Publikovat obrázky jako foto příspěvek' },
  { key: 'hidePublicPrice', label: 'Nepublikovat cenu veřejně' },
  { key: 'repeatPublishingEnabled', label: 'Povolit opakované publikování (globálně)' },
  { key: 'videoTeaserEndSlideEnabled', label: 'Zapnout závěrečný slide „Více na XXREALIT.cz“ ve videu' },
  { key: 'fallbackToLinkOnMediaFailure', label: 'Při selhání uploadu média publikovat pouze odkaz' },
];

export default function AdminSocialAutopostPage() {
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [tab, setTab] = useState<Tab>('facebook');
  const [settings, setSettings] = useState<SocialAutopostSettingsPublic | null>(null);
  const [queue, setQueue] = useState<SocialQueueRow[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastPublishedUrl, setLastPublishedUrl] = useState<string | null>(null);
  const [lookupPostId, setLookupPostId] = useState('');
  const [postPublishRows, setPostPublishRows] = useState<PostSocialPublishRow[] | null>(null);
  const [postLookupError, setPostLookupError] = useState<string | null>(null);

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
  const global = settings?.global ?? DEFAULT_GLOBAL;

  async function saveGlobal() {
    if (!token || !settings) return;
    setBusy(true);
    setMsg(null);
    const next = await nestAdminSocialAutopostGlobalPatch(token, global);
    setBusy(false);
    if (!next) {
      setMsg('Uložení globálních nastavení se nezdařilo.');
      return;
    }
    setSettings(next);
    setMsg('Globální nastavení uloženo.');
  }

  async function loadPostPublishStatus() {
    if (!token || !lookupPostId.trim()) return;
    setBusy(true);
    setPostLookupError(null);
    setPostPublishRows(null);
    const res = await nestAdminPostSocialPublishStatus(token, lookupPostId.trim());
    setBusy(false);
    if (!res?.ok) {
      setPostLookupError(res?.error ?? 'Příspěvek nenalezen nebo chyba API.');
      return;
    }
    setPostPublishRows(res.platforms ?? []);
    setMsg(`Stav publikování pro příspěvek ${lookupPostId.trim()}.`);
  }

  async function retryPostPublish(postId: string) {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    const res = await nestAdminPostsPublishNow(token, [postId], { force: true });
    setBusy(false);
    if (!res?.ok) {
      setMsg('Opakované publikování se nezdařilo.');
      return;
    }
    setMsg('Příspěvek zařazen do fronty publikování.');
    await loadPostPublishStatus();
    await refresh();
  }

  async function saveVideoPublishing() {
    if (!token || !settings) return;
    setBusy(true);
    setMsg(null);
    const nextGlobal = await nestAdminSocialAutopostGlobalPatch(token, {
      socialVideoUsePortalTeaserRule: global.socialVideoUsePortalTeaserRule,
      socialVideoTeaserSeconds: global.socialVideoTeaserSeconds,
      socialVideoPublishFull: global.socialVideoPublishFull,
      publishVideosAsReels: global.publishVideosAsReels,
    });
    const fbPatch: Record<string, unknown> = {
      publishPostVideosAsReels: fb?.publishPostVideosAsReels !== false,
    };
    const nextFb = fb ? await nestAdminSocialAutopostFacebookPatch(token, fbPatch) : null;
    const ig = settings.instagram;
    const yt = settings.youtube;
    const tt = settings.tiktok;
    const [nextIg, nextYt, nextTt] = await Promise.all([
      nestAdminSocialAutopostPlatformPatch(token, 'instagram', {
        ...ig,
        publishShortsAsReels: ig.publishShortsAsReels,
      }),
      nestAdminSocialAutopostPlatformPatch(token, 'youtube', {
        ...yt,
        publishShortsAsReels: yt.publishShortsAsReels,
      }),
      nestAdminSocialAutopostPlatformPatch(token, 'tiktok', {
        ...tt,
        publishShortsAsReels: tt.publishShortsAsReels,
      }),
    ]);
    setBusy(false);
    if (!nextGlobal) {
      setMsg('Uložení nastavení videí se nezdařilo.');
      return;
    }
    setSettings({
      ...settings,
      global: nextGlobal.global,
      ...(nextFb ? { facebook: nextFb.facebook } : {}),
      ...(nextIg ? { instagram: nextIg.instagram } : {}),
      ...(nextYt ? { youtube: nextYt.youtube } : {}),
      ...(nextTt ? { tiktok: nextTt.tiktok } : {}),
    });
    setMsg('Nastavení publikování videí uloženo.');
  }

  async function saveFacebook() {
    if (!token || !fb) return;
    setBusy(true);
    setMsg(null);
    const patch: Record<string, unknown> = {
      enabled: fb.enabled,
      facebookEnabled: fb.enabled,
      publishPosts: fb.publishPosts,
      publishProperties: fb.publishProperties,
      publishShorts: fb.publishShorts,
      publishShortsAsReels: fb.publishShortsAsReels !== false,
      publishPostVideosAsReels: fb.publishPostVideosAsReels !== false,
      reelsFallbackToVideoPost: fb.reelsFallbackToVideoPost !== false,
      reelsFallbackToPhotoPost: fb.reelsFallbackToPhotoPost !== false,
      repeatPublishing: fb.repeatPublishing !== false,
      approvedOnly: fb.approvedOnly,
      publicPostsOnly: fb.publicPostsOnly,
      professionalsOnly: fb.professionalsOnly,
      allowedRoles: fb.allowedRoles,
    };
    const next = await nestAdminSocialAutopostFacebookPatch(token, patch);
    setBusy(false);
    if (!next) {
      setMsg('Uložení se nezdařilo.');
      return;
    }
    setSettings(next);
    setMsg('Nastavení uloženo.');
  }

  async function savePlatform(platform: 'instagram' | 'youtube' | 'tiktok') {
    if (!token || !settings) return;
    const platformSettings = settings[platform];
    setBusy(true);
    setMsg(null);
    const next = await nestAdminSocialAutopostPlatformPatch(token, platform, platformSettings);
    setBusy(false);
    if (!next) {
      setMsg('Uložení se nezdařilo.');
      return;
    }
    setSettings(next);
    setMsg('Nastavení uloženo.');
  }

  function platformField(
    platform: 'instagram' | 'youtube' | 'tiktok',
    key: keyof PlatformPlaceholderSettings,
    label: string,
  ) {
    const platformSettings = settings?.[platform];
    if (!platformSettings) return null;
    return (
      <label key={key} className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={Boolean(platformSettings[key])}
          disabled={key !== 'enabled' && !platformSettings.enabled}
          onChange={(e) =>
            setSettings((s) =>
              s ? { ...s, [platform]: { ...s[platform], [key]: e.target.checked } } : s,
            )
          }
        />
        {label}
      </label>
    );
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
          ? ''
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
        <p className="mt-2">
          <Link
            href="/admin/marketing/socialni-site/sablony"
            className="text-sm font-semibold text-orange-600 hover:underline"
          >
            Šablony publikování →
          </Link>
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

      <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">Globální nastavení</h2>
        <p className="text-sm text-zinc-600">
          Ceny se na veřejné sociální sítě nikdy neposílají — místo toho se použije text „Cena je dostupná po přihlášení na portálu XXREALIT.“
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {GLOBAL_FIELDS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={global[key] !== false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? { ...s, global: { ...global, [key]: e.target.checked } }
                      : s,
                  )
                }
              />
              {label}
            </label>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">
              Maximální délka video ukázky (sekundy)
            </span>
            <input
              type="number"
              min={1}
              max={60}
              value={global.videoTeaserMaxSeconds ?? 5}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? {
                        ...s,
                        global: {
                          ...global,
                          videoTeaserMaxSeconds: Number.parseInt(e.target.value, 10) || 5,
                        },
                      }
                    : s,
                )
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="mb-1 block font-medium text-zinc-700">Text na konci videa</span>
            <input
              type="text"
              value={global.videoTeaserEndSlideText ?? 'Více na XXREALIT.cz'}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? {
                        ...s,
                        global: { ...global, videoTeaserEndSlideText: e.target.value },
                      }
                    : s,
                )
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void saveGlobal()}
          className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          Uložit globální nastavení
        </button>
      </section>

      <div className="flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
        {(
          [
            ['facebook', 'Facebook'],
            ['video', 'Publikování videí'],
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
          {token ? (
            <Suspense fallback={<p className="text-sm text-zinc-500">Načítám propojení…</p>}>
              <AdminFacebookAutopostOAuth
                token={token}
                fb={fb}
                busy={busy}
                setBusy={setBusy}
                onSettingsChange={() => void refresh()}
                onMessage={setMsg}
              />
            </Suspense>
          ) : null}

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

          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ['publishPosts', 'Příspěvky uživatelů'],
                ['publishProperties', 'Klasické inzeráty'],
                ['publishShorts', 'Shorts / video inzeráty'],
                ['repeatPublishing', 'Opakované publikování'],
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

          <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4 space-y-2">
            <p className="text-sm font-semibold text-violet-900">Facebook Reels (shorts / video)</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fb.publishPostVideosAsReels !== false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          facebook: { ...s.facebook, publishPostVideosAsReels: e.target.checked },
                        }
                      : s,
                  )
                }
              />
              Video příspěvky uživatelů publikovat jako Facebook Reels
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fb.publishShortsAsReels !== false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? { ...s, facebook: { ...s.facebook, publishShortsAsReels: e.target.checked } }
                      : s,
                  )
                }
              />
              Shorts/video inzeráty publikovat jako Facebook Reels
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fb.reelsFallbackToVideoPost !== false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          facebook: { ...s.facebook, reelsFallbackToVideoPost: e.target.checked },
                        }
                      : s,
                  )
                }
              />
              Pokud Reels selže, publikovat jako běžný video příspěvek
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fb.reelsFallbackToPhotoPost !== false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          facebook: { ...s.facebook, reelsFallbackToPhotoPost: e.target.checked },
                        }
                      : s,
                  )
                }
              />
              Pokud video není dostupné, publikovat jako klasický příspěvek s fotkou
            </label>
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

      {tab === 'video' ? (
        <section className="space-y-6 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Publikování videí na sociální sítě</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Video příspěvky se publikují jako Reel/Short. Textové a foto příspěvky zůstávají běžnými posty.
              Na sociální sítě se nahrává ukázka videa podle pravidel portálu, pokud není zapnuto celé video.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={fb?.publishPostVideosAsReels !== false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? { ...s, facebook: { ...s.facebook, publishPostVideosAsReels: e.target.checked } }
                      : s,
                  )
                }
              />
              Facebook Reels (video příspěvky)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={global.publishVideosAsReels !== false}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, global: { ...global, publishVideosAsReels: e.target.checked } } : s,
                  )
                }
              />
              Globálně publikovat videa jako Reels/Shorts
            </label>
            {(['instagram', 'youtube', 'tiktok'] as const).map((platform) => (
              <label key={platform} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={settings?.[platform]?.publishShortsAsReels === true}
                  disabled={!settings?.[platform]?.enabled}
                  onChange={(e) =>
                    setSettings((s) =>
                      s
                        ? {
                            ...s,
                            [platform]: { ...s[platform], publishShortsAsReels: e.target.checked },
                          }
                        : s,
                    )
                  }
                />
                {POST_SOCIAL_PLATFORM_LABELS[platform.toUpperCase()] ?? platform} Reels/Shorts
                {!settings?.[platform]?.enabled ? (
                  <span className="text-xs text-zinc-500">(síť není zapnutá)</span>
                ) : null}
              </label>
            ))}
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-900">Ukázka videa (teaser)</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={global.socialVideoUsePortalTeaserRule !== false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          global: { ...global, socialVideoUsePortalTeaserRule: e.target.checked },
                        }
                      : s,
                  )
                }
              />
              Použít stejné pravidlo ukázky jako na portálu
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={global.socialVideoPublishFull === true}
                onChange={(e) =>
                  setSettings((s) =>
                    s ? { ...s, global: { ...global, socialVideoPublishFull: e.target.checked } } : s,
                  )
                }
              />
              Publikovat celé video (bez zkrácení)
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-zinc-700">
                Vlastní délka ukázky pro sociální sítě (sekundy, prázdné = z portálu)
              </span>
              <input
                type="number"
                min={1}
                max={120}
                disabled={global.socialVideoUsePortalTeaserRule !== false}
                value={global.socialVideoTeaserSeconds ?? ''}
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          global: {
                            ...global,
                            socialVideoTeaserSeconds: raw ? Number.parseInt(raw, 10) || null : null,
                          },
                        }
                      : s,
                  );
                }}
                className="w-full max-w-xs rounded-lg border border-zinc-200 px-3 py-2 disabled:opacity-50"
              />
            </label>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => void saveVideoPublishing()}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Uložit nastavení videí
          </button>

          <div className="border-t border-zinc-200 pt-5 space-y-3">
            <h3 className="text-base font-semibold">Stav publikování příspěvku</h3>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={lookupPostId}
                onChange={(e) => setLookupPostId(e.target.value)}
                placeholder="ID příspěvku (UUID)"
                className="min-w-[240px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy || !lookupPostId.trim()}
                onClick={() => void loadPostPublishStatus()}
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                Načíst stav
              </button>
            </div>
            {postLookupError ? (
              <p className="text-sm text-red-700">{postLookupError}</p>
            ) : null}
            {postPublishRows?.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-zinc-500">
                      <th className="py-2 pr-3">Síť</th>
                      <th className="py-2 pr-3">Formát</th>
                      <th className="py-2 pr-3">Stav</th>
                      <th className="py-2 pr-3">Ukázka (s)</th>
                      <th className="py-2 pr-3">Odkaz</th>
                      <th className="py-2 pr-3">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {postPublishRows.map((row) => (
                      <tr key={row.id} className="border-b border-zinc-100 align-top">
                        <td className="py-2 pr-3">
                          {POST_SOCIAL_PLATFORM_LABELS[row.platform] ?? row.platform}
                        </td>
                        <td className="py-2 pr-3">
                          {POST_SOCIAL_PUBLISH_TYPE_LABELS[row.publishType] ?? row.publishType}
                        </td>
                        <td className="py-2 pr-3">
                          {SOCIAL_PUBLISH_STATUS_LABELS[row.status] ?? row.status}
                          {row.errorMessage ? (
                            <p className="mt-1 text-xs text-red-600">{row.errorMessage}</p>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3">{row.videoPreviewSeconds ?? '—'}</td>
                        <td className="py-2 pr-3">
                          {row.externalUrl ? (
                            <a
                              href={row.externalUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-orange-600 hover:underline"
                            >
                              Otevřít Reel/Short
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {row.platform === 'FACEBOOK' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void retryPostPublish(row.postId)}
                              className="text-xs font-semibold text-orange-600"
                            >
                              Zopakovat
                            </button>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {tab !== 'facebook' && tab !== 'video' ? (
        <section className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-sm text-amber-800">
            {tab === 'instagram' && 'Instagram — připraveno pro budoucí integraci'}
            {tab === 'youtube' && 'YouTube — připraveno pro budoucí integraci'}
            {tab === 'tiktok' && 'TikTok — připraveno pro budoucí integraci'}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {platformField(tab, 'enabled', 'Zapnuto')}
            {platformField(tab, 'publishListings', 'Publikovat inzeráty')}
            {platformField(tab, 'publishPosts', 'Publikovat příspěvky')}
            {platformField(tab, 'publishShortsAsReels', 'Publikovat Shorts jako Reels')}
            {platformField(tab, 'repeatPublishing', 'Opakované publikování')}
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void savePlatform(tab)}
            className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            Uložit
          </button>
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
