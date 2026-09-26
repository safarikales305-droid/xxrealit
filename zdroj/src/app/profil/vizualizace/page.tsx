'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { API_BASE_URL } from '@/lib/api';
import { getAuthHeaders } from '@/lib/nest-client';
import {
  aiVisualizationDownloadUrl,
  type AiVisualizationView,
} from '@/lib/ai-visualization-client';

export default function ProfilVizualizacePage() {
  const { apiAccessToken, isAuthenticated } = useAuth();
  const [items, setItems] = useState<AiVisualizationView[]>([]);

  useEffect(() => {
    if (!isAuthenticated || !API_BASE_URL) return;
    void fetch(`${API_BASE_URL}/ai-visualization/me`, { headers: getAuthHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { items?: AiVisualizationView[] } | null) => setItems(data?.items ?? []));
  }, [isAuthenticated, apiAccessToken]);

  if (!isAuthenticated) {
    return (
      <p className="text-sm text-zinc-600">
        <Link href="/prihlaseni?redirect=/profil/vizualizace" className="font-semibold text-orange-700">
          Přihlaste se
        </Link>{' '}
        pro zobrazení mých vizualizací.
      </p>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-zinc-900">Moje vizualizace</h1>
      <p className="mt-1 text-sm text-zinc-600">AI rekonstrukce vytvořené na XXREALIT.</p>
      <ul className="mt-6 space-y-4">
        {items.map((v) => (
          <li key={v.id} className="rounded-2xl border border-zinc-200 p-4">
            <div className="flex gap-3">
              {v.resultPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.resultPreviewUrl} alt="" className="h-20 w-28 rounded-lg object-cover" />
              ) : null}
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-semibold text-zinc-900">{v.style ?? '—'} · {v.propertyType ?? '—'}</p>
                <p className="text-xs text-zinc-500">{new Date(v.createdAt).toLocaleString('cs-CZ')}</p>
                {v.status === 'COMPLETED' ? (
                  <a
                    href={aiVisualizationDownloadUrl(v.id)}
                    className="mt-2 inline-block text-xs font-bold text-orange-700"
                    onClick={(e) => {
                      e.preventDefault();
                      void fetch(aiVisualizationDownloadUrl(v.id), { headers: getAuthHeaders() }).then(async (res) => {
                        if (!res.ok) return;
                        const blob = await res.blob();
                        const a = document.createElement('a');
                        a.href = URL.createObjectURL(blob);
                        a.download = `viz-${v.id}.png`;
                        a.click();
                      });
                    }}
                  >
                    Stáhnout
                  </a>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      {items.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-500">
          Zatím nemáte žádné vizualizace.{' '}
          <Link href="/ai-vizualizace" className="font-semibold text-orange-700">
            Vytvořit první
          </Link>
        </p>
      ) : null}
    </div>
  );
}
