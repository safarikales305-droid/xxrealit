'use client';

const STATUS_LABELS: Record<string, string> = {
  NOT_PUBLISHED: 'Nepublikováno',
  PENDING: 'Čeká na publikování',
  PUBLISHED: 'Publikováno',
  FAILED: 'Publikace selhala',
  REPEAT_ACTIVE: 'Opakování aktivní',
  DISABLED: 'Vypnuto',
};

type SocialSummary = {
  autoPublishEnabled: boolean;
  publishedNetworks: string[];
  disabledMessage: string | null;
  networks: Array<{
    platform: string;
    label: string;
    status: string;
    publishedUrl: string | null;
    lastError: string | null;
  }>;
  logs: Array<{
    id: string;
    createdAt: string;
    platform: string;
    publishKind: string | null;
    status: string;
    publishedUrl: string | null;
    lastError: string | null;
    triggeredBy: string | null;
  }>;
};

type Props = {
  summary: SocialSummary;
};

export function ListingPublishStatusPanel({ summary }: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-zinc-900">Stav publikování na sociální sítě</h3>
      {!summary.autoPublishEnabled ? (
        <p className="mt-3 text-sm text-zinc-600">Publikování na sociální sítě je vypnuté.</p>
      ) : summary.publishedNetworks.length > 0 ? (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950">
          <p className="font-medium">📣 Váš inzerát byl publikován na sociálních sítích:</p>
          <ul className="mt-2 list-disc pl-5">
            {summary.publishedNetworks.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-600">Publikování je zapnuté — stav jednotlivých sítí níže.</p>
      )}

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {summary.networks.map((network) => (
          <div key={network.platform} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-zinc-900">{network.label}</span>
              <span className="text-xs text-zinc-600">{STATUS_LABELS[network.status] ?? network.status}</span>
            </div>
            {network.publishedUrl ? (
              <a
                href={network.publishedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-xs text-sky-700 underline"
              >
                {network.publishedUrl}
              </a>
            ) : null}
            {network.lastError ? <p className="mt-1 text-xs text-red-700">{network.lastError}</p> : null}
          </div>
        ))}
      </div>

      {summary.logs.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-zinc-800">Log publikování</summary>
          <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs text-zinc-600">
            {summary.logs.map((log) => (
              <li key={log.id} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                <div>
                  {new Date(log.createdAt).toLocaleString('cs-CZ')} · {log.platform} · {log.status}
                  {log.publishKind ? ` · ${log.publishKind}` : ''}
                </div>
                {log.publishedUrl ? <div className="truncate text-sky-700">{log.publishedUrl}</div> : null}
                {log.lastError ? <div className="text-red-700">{log.lastError}</div> : null}
                {log.triggeredBy ? <div>Spustil: {log.triggeredBy}</div> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
