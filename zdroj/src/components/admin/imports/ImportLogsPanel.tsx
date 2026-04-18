'use client';

import type { AdminImportLogRow } from '@/lib/nest-client';

type Props = {
  logs: AdminImportLogRow[];
};

export function ImportLogsPanel({ logs }: Props) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 text-base font-semibold">Import logy</h2>
      <div className="space-y-2">
        {logs.map((log) => (
          <div key={log.id} className="rounded-lg border border-zinc-200 p-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">
                {(log.source?.portalLabel ?? log.portal)} / {(log.source?.categoryLabel ?? log.method)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 ${
                  log.status === 'ok'
                    ? 'bg-emerald-100 text-emerald-800'
                    : log.status === 'warn'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-red-100 text-red-800'
                }`}
              >
                {log.status}
              </span>
            </div>
            <p className="mt-1 text-zinc-600">
              New {log.importedNew}, Updated {log.importedUpdated}, Skipped {log.skipped}, Disabled {log.disabled}
            </p>
            {log.message ? <p className="mt-1 text-zinc-700">{log.message}</p> : null}
            {log.error ? <p className="mt-1 text-red-700">{log.error}</p> : null}
            <p className="text-zinc-500">{new Date(log.createdAt).toLocaleString('cs-CZ')}</p>
          </div>
        ))}
        {logs.length === 0 ? <p className="text-sm text-zinc-500">Zatím bez logů.</p> : null}
      </div>
    </section>
  );
}
