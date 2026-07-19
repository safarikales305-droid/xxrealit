'use client';

import { useCallback, useState } from 'react';
import { facebookDebuggerUrl } from '@/lib/listing-og-metadata';
import {
  nestAdminMetaCenterCampaignMetaUrlDiagnostics,
  nestAdminMetaCenterMetaAdsResources,
  type MetaAdsResourceCheck,
  type MetaUrlDiagnosticsResult,
} from '@/lib/nest-client';

type Props = {
  token: string | null;
  initialUrl?: string;
};

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block size-2.5 rounded-full ${ok ? 'bg-emerald-500' : 'bg-red-500'}`}
      aria-hidden
    />
  );
}

function PreviewCard({
  title,
  ogTitle,
  ogDescription,
  imageUrl,
}: {
  title: string;
  ogTitle: string | null;
  ogDescription: string | null;
  imageUrl: string | null;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</p>
      <div className="overflow-hidden rounded-lg border border-zinc-100 bg-zinc-50">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="" className="aspect-[1.91/1] w-full object-cover" />
        ) : (
          <div className="flex aspect-[1.91/1] items-center justify-center bg-zinc-200 text-xs text-zinc-500">
            Bez obrázku
          </div>
        )}
        <div className="space-y-1 p-3">
          <p className="text-[10px] uppercase text-zinc-400">xxrealit.cz</p>
          <p className="line-clamp-2 text-sm font-semibold text-zinc-900">
            {ogTitle ?? '—'}
          </p>
          <p className="line-clamp-3 text-xs text-zinc-600">{ogDescription ?? '—'}</p>
        </div>
      </div>
    </div>
  );
}

export function MetaUrlDiagnosticsPanel({ token, initialUrl = '' }: Props) {
  const [url, setUrl] = useState(initialUrl);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<MetaUrlDiagnosticsResult | null>(null);
  const [resources, setResources] = useState<{
    ok: boolean;
    checks: MetaAdsResourceCheck[];
    graphVersion: string | null;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const runDiagnostics = useCallback(async () => {
    if (!token || !url.trim()) return;
    setBusy(true);
    setErr(null);
    const [diag, res] = await Promise.all([
      nestAdminMetaCenterCampaignMetaUrlDiagnostics(token, url.trim()),
      nestAdminMetaCenterMetaAdsResources(token),
    ]);
    setBusy(false);
    setResult(diag);
    setResources(res);
    if (!diag.ok && diag.errors.length) {
      setErr(diag.errors.join(' · '));
    }
  }, [token, url]);

  const ogImage = result?.meta?.ogImage ?? result?.meta?.twitterImage ?? null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold text-zinc-900">Diagnostika URL</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Ověření veřejné dostupnosti, Open Graph tagů a chování Facebook/Google crawleru.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.xxrealit.cz/nemovitost/..."
            className="min-w-[280px] flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !token || !url.trim()}
            onClick={() => void runDiagnostics()}
            className="rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Testuji…' : 'Spustit diagnostiku'}
          </button>
          {url.trim() ? (
            <a
              href={facebookDebuggerUrl(url.trim())}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
            >
              Otestovat ve Facebook Sharing Debugger
            </a>
          ) : null}
        </div>
        {err ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {err}
          </p>
        ) : null}
      </section>

      {result ? (
        <>
          <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-zinc-900">Výsledky</h3>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <StatusDot ok={result.httpStatus === 200} />
                HTTP Status: {result.httpStatus ?? '—'}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={result.redirects.length === 0 || !result.requiresLogin} />
                Redirect: {result.redirects.length ? result.redirects.map((r) => `${r.status}→${r.url}`).join(', ') : 'žádný'}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={Boolean(result.canonical) && !result.canonicalHasQuery} />
                Canonical: {result.canonical ?? '—'}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={result.indexable} />
                Robots: {result.robots ?? 'index,follow (výchozí)'}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={Boolean(result.meta.ogTitle)} />
                OG title: {result.meta.ogTitle ?? '—'}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={Boolean(result.meta.ogDescription)} />
                OG description: {result.meta.ogDescription ?? '—'}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={Boolean(result.meta.ogImage) && result.ogImageReachable !== false} />
                OG image: {result.meta.ogImage ?? '—'}
                {result.ogImageHttpStatus != null ? ` (HTTP ${result.ogImageHttpStatus})` : ''}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={Boolean(result.meta.ogVideo)} />
                OG video: {result.meta.ogVideo ?? '—'}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={result.meta.twitterCard === 'summary_large_image'} />
                Twitter Card: {result.meta.twitterCard ?? '—'}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={result.meta.metaPixelIds.length > 0} />
                Meta Pixel v HTML: {result.meta.metaPixelIds.join(', ') || 'nenalezen'}
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={result.facebookCrawler.ok} />
                Facebook crawler OK
              </li>
              <li className="flex items-center gap-2">
                <StatusDot ok={result.googleCrawler.ok} />
                Google crawler OK
              </li>
            </ul>
          </section>

          {result.autoFixes.length > 0 ? (
            <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <h3 className="font-semibold text-amber-950">Automatické opravy</h3>
              <ul className="mt-2 space-y-2 text-sm text-amber-900">
                {result.autoFixes.map((fix) => (
                  <li key={fix.key}>
                    <strong>{fix.label}:</strong> {fix.action}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <PreviewCard
              title="Facebook Feed"
              ogTitle={result.meta.ogTitle}
              ogDescription={result.meta.ogDescription}
              imageUrl={ogImage}
            />
            <PreviewCard
              title="Instagram Feed"
              ogTitle={result.meta.ogTitle}
              ogDescription={result.meta.ogDescription}
              imageUrl={ogImage}
            />
            <PreviewCard
              title="Messenger"
              ogTitle={result.meta.ogTitle}
              ogDescription={result.meta.ogDescription}
              imageUrl={ogImage}
            />
            <PreviewCard
              title="WhatsApp"
              ogTitle={result.meta.ogTitle}
              ogDescription={result.meta.ogDescription}
              imageUrl={ogImage}
            />
          </section>
        </>
      ) : null}

      {resources ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold text-zinc-900">
            Meta API test {resources.graphVersion ? `(Graph ${resources.graphVersion})` : ''}
          </h3>
          <ul className="mt-3 space-y-2 text-sm">
            {resources.checks.map((check) => (
              <li key={check.key} className="flex items-start gap-2">
                <StatusDot ok={check.ok} />
                <span>
                  <strong>{check.label}</strong>
                  {check.id ? ` (${check.id})` : ''}: {check.message}
                  {check.httpStatus != null ? ` · HTTP ${check.httpStatus}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
