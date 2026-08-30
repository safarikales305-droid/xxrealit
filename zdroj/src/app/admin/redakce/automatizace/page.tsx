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
  type EditorialReelAutomationSettings,
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
    });
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
    </EditorialCenterShell>
  );
}
