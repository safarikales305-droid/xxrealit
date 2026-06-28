'use client';

import {
  FACEBOOK_POST_TYPE_LABELS,
  PROPERTY_FACEBOOK_STATUS_LABELS,
  SOCIAL_PUBLISH_STATUS_LABELS,
  SOCIAL_TRIGGER_SOURCE_LABELS,
  type PropertyPublishLogRow,
} from '@/lib/social-autopost-admin-api';

function formatApiResponse(raw: unknown): string {
  if (raw == null) return '—';
  try {
    const s = typeof raw === 'string' ? raw : JSON.stringify(raw);
    return s.length > 120 ? `${s.slice(0, 120)}…` : s;
  } catch {
    return '—';
  }
}

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

type Props = {
  open: boolean;
  title: string;
  loading?: boolean;
  rows: PropertyPublishLogRow[];
  onClose: () => void;
};

export function FacebookPublishLogModal({ open, title, loading, rows, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal
    >
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
        <div className="border-b border-zinc-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <p className="mt-1 text-sm text-zinc-500">Historie publikování na Facebook stránku XXREALIT</p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-sm text-zinc-500">Načítání…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-zinc-500">Zatím žádné záznamy.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                    <th className="pb-2 pr-3">Datum</th>
                    <th className="pb-2 pr-3">Typ</th>
                    <th className="pb-2 pr-3">Stav</th>
                    <th className="pb-2 pr-3">Post ID</th>
                    <th className="pb-2 pr-3">Odkaz</th>
                    <th className="pb-2 pr-3">Zdroj</th>
                    <th className="pb-2 pr-3">Kdo</th>
                    <th className="pb-2 pr-3">Čas zprac.</th>
                    <th className="pb-2 pr-3">Graph API</th>
                    <th className="pb-2">Chyba</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100 align-top">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDt(row.createdAt)}</td>
                      <td className="py-2 pr-3">
                        {row.facebookPostType
                          ? (FACEBOOK_POST_TYPE_LABELS[row.facebookPostType] ?? row.facebookPostType)
                          : '—'}
                      </td>
                      <td className="py-2 pr-3">
                        {SOCIAL_PUBLISH_STATUS_LABELS[row.status] ?? row.status}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{row.externalPostId ?? '—'}</td>
                      <td className="py-2 pr-3">
                        {row.publishedUrl ? (
                          <a
                            href={row.publishedUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#1877f2] hover:underline"
                          >
                            Otevřít
                          </a>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {SOCIAL_TRIGGER_SOURCE_LABELS[row.triggerSource] ?? row.triggerSource}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {row.triggeredBy?.name ?? row.triggeredBy?.email ?? '—'}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-xs">
                        {formatDt(row.processedAt ?? row.createdAt)}
                      </td>
                      <td className="py-2 pr-3 max-w-[200px] truncate font-mono text-[10px] text-zinc-600" title={formatApiResponse(row.lastApiResponse)}>
                        {formatApiResponse(row.lastApiResponse)}
                      </td>
                      <td className="py-2 text-xs text-red-700">{row.lastError ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
          >
            Zavřít
          </button>
        </div>
      </div>
    </div>
  );
}

export { PROPERTY_FACEBOOK_STATUS_LABELS };
