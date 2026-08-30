'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MoreVertical } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  AutoStatusBanner,
  EditorialCenterShell,
} from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestEditorialCategories,
  nestEditorialDashboard,
  type ContentSourceCategory,
  type EditorialCenterDashboard,
} from '@/lib/editorial-center-client';

function StatCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-zinc-900">{value}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-600">{hint}</p> : null}
    </div>
  );
}

export default function RedakceOverviewPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [dash, setDash] = useState<EditorialCenterDashboard | null>(null);
  const [categories, setCategories] = useState<ContentSourceCategory[]>([]);

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(() => {
    if (!apiAccessToken) return;
    void Promise.all([
      nestEditorialDashboard(apiAccessToken),
      nestEditorialCategories(apiAccessToken),
    ]).then(([d, c]) => {
      if (d) setDash(d);
      if (c) setCategories(c);
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
    <EditorialCenterShell
      title="Přehled"
      subtitle="Stav zdrojů, importů a automatického publikování na jednom místě."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <AutoStatusBanner active={dash?.autoPublishingActive ?? false} label="Auto publikování" />
        <AutoStatusBanner active={dash?.reelAutomationActive ?? false} label="Facebook Reels" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="YouTube kanály"
          value={dash?.activeYoutubeChannels ?? '—'}
          hint={`${dash?.videosImportedToday ?? 0} nových videí dnes`}
        />
        <StatCard
          title="RSS zdroje"
          value={dash?.activeRssSources ?? '—'}
          hint={`${dash?.articlesImportedToday ?? 0} článků dnes`}
        />
        <StatCard title="Obsah ve Shorts" value={dash?.shortsContentCount ?? '—'} />
        <StatCard
          title="Facebook Reels týden"
          value={dash?.facebookReelsThisWeek ?? '—'}
          hint={
            dash?.lastReelAt
              ? `Poslední: ${new Date(dash.lastReelAt).toLocaleString('cs-CZ')}`
              : undefined
          }
        />
      </div>

      {dash && dash.syncErrors > 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {dash.syncErrors} zdrojů hlásí chybu synchronizace. Zkontrolujte YouTube kanály nebo RSS.
        </p>
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-zinc-900">Kategorie zdrojů</h2>
        <p className="mt-1 text-sm text-zinc-600">{categories.length} aktivních kategorií</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {categories.slice(0, 8).map((c) => (
            <span key={c.id} className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700">
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </EditorialCenterShell>
  );
}
