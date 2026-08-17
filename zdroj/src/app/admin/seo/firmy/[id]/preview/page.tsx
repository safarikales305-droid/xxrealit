'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminCompanySeoPreview } from '@/lib/company-seo-admin-client';

export default function AdminCompanySeoPreviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!isLoading && (!apiAccessToken || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, apiAccessToken, user, router]);

  useEffect(() => {
    if (!apiAccessToken || !params?.id) return;
    void nestAdminCompanySeoPreview(apiAccessToken, params.id).then(setPreview);
  }, [apiAccessToken, params?.id]);

  const p = preview?.preview as Record<string, unknown> | undefined;
  const seoPage = preview?.seoPage as Record<string, unknown> | undefined;
  const publicUrl = preview?.publicUrl as string | undefined;

  return (
    <div className="max-w-3xl">
      <Link href="/admin/seo/firmy" className="text-sm font-semibold text-orange-700 hover:underline">
        ← SEO firmy
      </Link>
      <h1 className="mt-4 text-xl font-bold text-zinc-900">Náhled firemní SEO stránky</h1>
      {!preview ? (
        <p className="mt-4 text-sm text-zinc-500">Načítám náhled…</p>
      ) : (
        <div className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-5">
          <Row label="Title" value={String(p?.title ?? '')} />
          <Row label="Meta description" value={String(p?.metaDescription ?? '')} />
          <Row label="URL" value={publicUrl ?? ''} />
          <Row label="H1" value={String(p?.h1 ?? '')} />
          <Row label="SEO score" value={String(p?.seoScore ?? seoPage?.seoScore ?? '')} />
          <Row label="Krátký popis" value={String(p?.shortDescription ?? '')} />
          <div>
            <p className="text-xs font-semibold uppercase text-zinc-500">Dlouhý popis</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{String(p?.longDescription ?? '')}</p>
          </div>
          {p?.jsonLd ? (
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-500">JSON-LD</p>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-zinc-50 p-3 text-xs">
                {JSON.stringify(p.jsonLd, null, 2)}
              </pre>
            </div>
          ) : null}
          {publicUrl ? (
            <Link href={publicUrl} className="inline-block text-sm font-semibold text-orange-700 hover:underline">
              Otevřít veřejnou stránku
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-zinc-500">{label}</p>
      <p className="mt-1 text-sm text-zinc-800">{value || '—'}</p>
    </div>
  );
}
