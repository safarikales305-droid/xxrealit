'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestEditorialCreateReelTemplate,
  nestEditorialDeleteReelTemplate,
  nestEditorialDuplicateReelTemplate,
  nestEditorialReelTemplates,
  nestEditorialSetDefaultReelTemplate,
  type EditorialReelTemplate,
} from '@/lib/editorial-center-client';

export default function ReelSablonyPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [templates, setTemplates] = useState<EditorialReelTemplate[]>([]);

  const load = () => {
    if (!apiAccessToken) return;
    void nestEditorialReelTemplates(apiAccessToken).then((t) => t && setTemplates(t));
  };

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(load, [apiAccessToken]);

  const createNew = async () => {
    if (!apiAccessToken) return;
    const t = await nestEditorialCreateReelTemplate(apiAccessToken, { name: 'Nová šablona' });
    if (t) router.push(`/admin/redakce/facebook-reels/sablony/${t.id}`);
  };

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="Reel šablony" subtitle="Správa vzhledu automatických Facebook Reels.">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/redakce/facebook-reels" className="text-sm text-orange-700 underline">
          ← Facebook Reels
        </Link>
        <button
          type="button"
          onClick={() => void createNew()}
          className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          + Nová šablona
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase text-zinc-500">
            <tr>
              <th className="px-4 py-3">Název</th>
              <th className="px-4 py-3">Délka segmentu</th>
              <th className="px-4 py-3">Segmentů</th>
              <th className="px-4 py-3">Hudba</th>
              <th className="px-4 py-3">Výchozí</th>
              <th className="px-4 py-3">Upraveno</th>
              <th className="px-4 py-3">Akce</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => (
              <tr key={t.id} className="border-b border-zinc-100">
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3">{t.segmentSec}s</td>
                <td className="px-4 py-3">{t.videosPerReel}</td>
                <td className="px-4 py-3 text-xs">{t.musicTrack?.title ?? 'žádná'}</td>
                <td className="px-4 py-3">{t.isDefault ? '✓' : '—'}</td>
                <td className="px-4 py-3 text-xs">{new Date(t.updatedAt).toLocaleString('cs-CZ')}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    <Link
                      href={`/admin/redakce/facebook-reels/sablony/${t.id}`}
                      className="rounded border border-zinc-300 px-2 py-1 text-xs"
                    >
                      Upravit
                    </Link>
                    {apiAccessToken ? (
                      <>
                        <button
                          type="button"
                          className="rounded border border-zinc-300 px-2 py-1 text-xs"
                          onClick={() =>
                            void nestEditorialDuplicateReelTemplate(apiAccessToken, t.id).then(load)
                          }
                        >
                          Duplikovat
                        </button>
                        {!t.isDefault ? (
                          <button
                            type="button"
                            className="rounded border border-zinc-300 px-2 py-1 text-xs"
                            onClick={() =>
                              void nestEditorialSetDefaultReelTemplate(apiAccessToken, t.id).then(load)
                            }
                          >
                            Výchozí
                          </button>
                        ) : null}
                        {!t.isDefault ? (
                          <button
                            type="button"
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                            onClick={() => {
                              if (!confirm('Smazat šablonu?')) return;
                              void nestEditorialDeleteReelTemplate(apiAccessToken, t.id).then(load);
                            }}
                          >
                            Smazat
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </EditorialCenterShell>
  );
}
