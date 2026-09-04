'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { AutoStatusBanner, EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestEditorialDashboard,
  nestEditorialReelSettings,
  nestEditorialUpdateReelSettings,
  nestEditorialYoutubePublishSummary,
  nestEditorialYoutubeStatus,
  nestYoutubeOAuthConnectUrl,
  type EditorialReelAutomationSettings,
  type YouTubeConnectionStatus,
} from '@/lib/editorial-center-client';
import {
  nestAdminNewsSettings,
  nestAdminUpdateNewsSettings,
  type NewsAutomationSettings,
} from '@/lib/news-editorial-client';

export default function RedakceAutomatizacePage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [news, setNews] = useState<NewsAutomationSettings | null>(null);
  const [reel, setReel] = useState<EditorialReelAutomationSettings | null>(null);
  const [dashAuto, setDashAuto] = useState(false);
  const [youtube, setYoutube] = useState<YouTubeConnectionStatus | null>(null);
  const [youtubeConnectError, setYoutubeConnectError] = useState<string | null>(null);
  const [youtubeSummary, setYoutubeSummary] = useState<{
    lastUploadAt: string | null;
    lastUploadVideoId: string | null;
    lastError: string | null;
  } | null>(null);

  const loadYoutube = () => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestEditorialYoutubeStatus(apiAccessToken),
      nestEditorialYoutubePublishSummary(apiAccessToken),
    ]).then(([s, summary]) => {
      if (s) setYoutube(s);
      if (summary) setYoutubeSummary(summary);
    });
  };

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestAdminNewsSettings(apiAccessToken),
      nestEditorialReelSettings(apiAccessToken),
      nestEditorialDashboard(apiAccessToken),
    ]).then(([n, r, d]) => {
      if (n) setNews(n);
      if (r) setReel(r);
      if (d) setDashAuto(d.autoPublishingActive);
      loadYoutube();
    });
  }, [apiAccessToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('youtube')) loadYoutube();
  }, [apiAccessToken]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="Automatické publikování" subtitle="YouTube → Shorts, Facebook a Reel kompilace.">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
          <AutoStatusBanner active={dashAuto} label="YouTube → Shorts" />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={news?.youtubeMonitoringEnabled ?? false}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAdminUpdateNewsSettings(apiAccessToken, {
                  youtubeMonitoringEnabled: e.target.checked,
                }).then(setNews);
              }}
            />
            Sledovat YouTube kanály
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={news?.youtubeCreatePortalPost !== false}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestAdminUpdateNewsSettings(apiAccessToken, {
                  youtubeCreatePortalPost: e.target.checked,
                }).then(setNews);
              }}
            />
            Publikovat do Shorts feedu
          </label>
        </div>

        <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
          <AutoStatusBanner active={reel?.enabled ?? false} label="Facebook Reel kompilace" />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={reel?.enabled ?? false}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestEditorialUpdateReelSettings(apiAccessToken, { enabled: e.target.checked }).then(setReel);
              }}
            />
            Automaticky vytvářet Reels
          </label>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <label>
              Reel po videích
              <input
                type="number"
                min={2}
                max={10}
                value={reel?.videosPerReel ?? 5}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                onChange={(e) => {
                  if (!apiAccessToken) return;
                  void nestEditorialUpdateReelSettings(apiAccessToken, {
                    videosPerReel: Number(e.target.value),
                  }).then(setReel);
                }}
              />
            </label>
            <label>
              Max. čekání (h)
              <input
                type="number"
                min={1}
                max={168}
                value={reel?.maxWaitHours ?? 24}
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1"
                onChange={(e) => {
                  if (!apiAccessToken) return;
                  void nestEditorialUpdateReelSettings(apiAccessToken, {
                    maxWaitHours: Number(e.target.value),
                  }).then(setReel);
                }}
              />
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <AutoStatusBanner
          active={Boolean(youtube?.autoPublishReady && reel?.autoPublishYoutube)}
          label="YOUTUBE — vlastní Reels"
        />
        <h2 className="mt-3 font-semibold text-zinc-900">YouTube publikování</h2>
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <span className="text-zinc-500">Připojený kanál:</span>{' '}
            <span className="font-medium">{youtube?.channelTitle ?? '—'}</span>
          </p>
          {youtube?.channelId ? (
            <p className="text-xs text-zinc-500">Channel ID: {youtube.channelId}</p>
          ) : null}
          <p>
            Upload oprávnění:{' '}
            <span className={youtube?.uploadScopeOk ? 'text-emerald-700' : 'text-red-700'}>
              {youtube?.uploadScopeOk ? 'OK' : 'CHYBÍ'}
            </span>
          </p>
          <p>
            Refresh token:{' '}
            <span className={youtube?.refreshTokenOk ? 'text-emerald-700' : 'text-red-700'}>
              {youtube?.refreshTokenOk ? 'OK' : 'CHYBÍ'}
            </span>
          </p>
          {youtube?.channelMismatch ? (
            <p className="text-red-700">Připojený kanál neodpovídá očekávanému XXREALIT kanálu.</p>
          ) : null}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={reel?.autoPublishYoutube ?? false}
              disabled={!youtube?.autoPublishReady}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestEditorialUpdateReelSettings(apiAccessToken, {
                  autoPublishYoutube: e.target.checked,
                }).then(setReel);
              }}
            />
            Automaticky publikovat vlastní Reels na YouTube
          </label>
          <label className="block">
            <span className="mb-1 block font-medium">Výchozí viditelnost</span>
            <select
              className="w-full max-w-xs rounded-lg border border-zinc-300 px-3 py-2"
              value={reel?.youtubePrivacyStatus ?? 'private'}
              onChange={(e) => {
                if (!apiAccessToken) return;
                void nestEditorialUpdateReelSettings(apiAccessToken, {
                  youtubePrivacyStatus: e.target.value as 'public' | 'unlisted' | 'private',
                }).then(setReel);
              }}
            >
              <option value="private">Private (test)</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public</option>
            </select>
          </label>
          <p className="text-xs text-zinc-500">
            Poslední upload:{' '}
            {youtubeSummary?.lastUploadAt
              ? new Date(youtubeSummary.lastUploadAt).toLocaleString('cs-CZ')
              : '—'}
          </p>
          {youtubeSummary?.lastError ? (
            <p className="text-xs text-red-600">Poslední chyba: {youtubeSummary.lastError}</p>
          ) : null}
          {apiAccessToken ? (
            <button
              type="button"
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              onClick={() => {
                if (!apiAccessToken) return;
                setYoutubeConnectError(null);
                void nestYoutubeOAuthConnectUrl(apiAccessToken).then((result) => {
                  if (result.url) window.location.href = result.url;
                  else setYoutubeConnectError(result.error ?? 'YouTube OAuth selhalo.');
                });
              }}
            >
              Připojit / obnovit oprávnění YouTube
            </button>
          ) : null}
          {youtubeConnectError ? (
            <p className="mt-2 text-sm text-red-700">{youtubeConnectError}</p>
          ) : null}
        </div>
      </div>
    </EditorialCenterShell>
  );
}
