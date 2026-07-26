'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ProgrammaticSeoPage } from '@/components/seo/ProgrammaticSeoPage';
import { nestAdminSeoPagePreview } from '@/lib/nest-client';
import type { ProgrammaticSeoPageData } from '@/lib/seo/programmatic-seo';

type PreviewData = ProgrammaticSeoPageData & {
  contentId?: string;
  contentStatus?: string;
};

export default function AdminSeoPagePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setError(null);
    try {
      const res = await nestAdminSeoPagePreview(token, id);
      if (!res) {
        setError('Náhled nelze načíst.');
        return;
      }
      setData(res as PreviewData);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chyba načítání náhledu');
    }
  }, [token, id]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!token || user?.role !== 'ADMIN') return null;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
        <button type="button" onClick={() => void load()} className="ml-3 underline">
          Zkusit znovu
        </button>
      </div>
    );
  }

  if (!data) return <p className="text-sm text-zinc-500">Načítám náhled…</p>;

  const publicPath = data.path;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
        <div>
          <p className="font-semibold text-amber-900">Admin náhled (včetně DRAFT)</p>
          <p className="text-amber-800">
            Stav: {data.contentStatus ?? '—'} · robots: {data.seo?.robots ?? '—'} · noindex:{' '}
            {data.seo?.noindex ? 'ano' : 'ne'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/seo/stranky/${id}`} className="rounded-lg border border-amber-700 px-3 py-1 text-amber-900">
            Upravit
          </Link>
          {publicPath ? (
            <Link href={publicPath} target="_blank" className="rounded-lg bg-amber-700 px-3 py-1 text-white">
              Veřejná URL
            </Link>
          ) : null}
        </div>
      </div>

      <details className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 text-xs">
        <summary className="cursor-pointer font-semibold text-zinc-700">Diagnostický panel (metadata)</summary>
        <dl className="mt-2 grid gap-1 sm:grid-cols-2">
          <dt className="text-zinc-500">Title</dt>
          <dd>{data.title}</dd>
          <dt className="text-zinc-500">Description</dt>
          <dd>{data.description}</dd>
          <dt className="text-zinc-500">Canonical</dt>
          <dd>{data.seo?.canonical}</dd>
          <dt className="text-zinc-500">H1</dt>
          <dd>{data.h1}</dd>
          <dt className="text-zinc-500">Inzerátů</dt>
          <dd>{data.totalCount}</dd>
        </dl>
      </details>

      <div className="rounded-xl border border-zinc-200 bg-white">
        <ProgrammaticSeoPage data={data} />
      </div>
    </div>
  );
}
