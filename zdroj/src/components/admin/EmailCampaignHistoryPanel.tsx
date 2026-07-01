'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestAdminDuplicateEmailCampaign,
  nestAdminEmailCampaignsList,
  type EmailCampaignHistoryRow,
} from '@/lib/nest-client';
import { EmailCampaignDetailModal } from './EmailCampaignDetailModal';
import { EmailCampaignEditorModal } from './EmailCampaignEditorModal';

const STATUS_LABEL: Record<string, string> = {
  draft: 'Koncept',
  scheduled: 'Naplánováno',
  running: 'Odesílá se',
  paused: 'Pozastaveno',
  completed: 'Dokončeno',
  sent: 'Dokončeno',
  failed: 'Chyba',
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('cs-CZ');
  } catch {
    return iso;
  }
}

type Props = {
  token: string;
  adminEmail?: string;
  refreshKey?: number;
};

export function EmailCampaignHistoryPanel({ token, adminEmail, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<EmailCampaignHistoryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editCampaignId, setEditCampaignId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    const data = await nestAdminEmailCampaignsList(token);
    setRows(data);
    setBusy(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function duplicate(id: string) {
    const r = await nestAdminDuplicateEmailCampaign(token, id);
    if (r.error) {
      setErr(r.error);
      return;
    }
    void load();
    if (r.campaign?.id) setEditCampaignId(r.campaign.id);
  }

  return (
    <section className="mt-8 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-zinc-900">Historie kampaní</h2>
        <button
          type="button"
          onClick={() => void load()}
          disabled={busy}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-semibold hover:bg-zinc-50"
        >
          Obnovit
        </button>
      </div>

      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-3 py-2">Název</th>
              <th className="px-3 py-2">Spuštění</th>
              <th className="px-3 py-2">Příjemci</th>
              <th className="px-3 py-2">Odesláno</th>
              <th className="px-3 py-2">Chyby</th>
              <th className="px-3 py-2">Stav</th>
              <th className="px-3 py-2"> </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-zinc-500">
                  {busy ? 'Načítám…' : 'Zatím žádné kampaně.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 hover:bg-orange-50/30">
                  <td className="px-3 py-2 font-semibold text-zinc-900">{row.title}</td>
                  <td className="px-3 py-2 text-zinc-600">{fmtDate(row.startedAt ?? row.createdAt)}</td>
                  <td className="px-3 py-2">{row.recipientCount}</td>
                  <td className="px-3 py-2 text-emerald-700">{row.sentCount}</td>
                  <td className="px-3 py-2 text-red-600">{row.failedCount}</td>
                  <td className="px-3 py-2">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold">
                      {STATUS_LABEL[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs font-semibold hover:bg-zinc-50"
                        onClick={() => setDetailId(row.id)}
                      >
                        Detail
                      </button>
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs font-semibold hover:bg-zinc-50"
                        onClick={() => void duplicate(row.id)}
                      >
                        Duplikovat
                      </button>
                      <button
                        type="button"
                        className="rounded border border-orange-300 bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-900"
                        onClick={async () => {
                          const r = await nestAdminDuplicateEmailCampaign(token, row.id);
                          if (r.error) setErr(r.error);
                          else if (r.campaign?.id) setEditCampaignId(r.campaign.id);
                        }}
                      >
                        Upravit jako novou
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {detailId ? (
        <EmailCampaignDetailModal
          token={token}
          campaignId={detailId}
          onClose={() => setDetailId(null)}
          onDuplicate={(id) => {
            setDetailId(null);
            void duplicate(id);
          }}
          onEditAsNew={async (id) => {
            setDetailId(null);
            const r = await nestAdminDuplicateEmailCampaign(token, id);
            if (r.error) setErr(r.error);
            else if (r.campaign?.id) setEditCampaignId(r.campaign.id);
          }}
        />
      ) : null}

      {editCampaignId ? (
        <EmailCampaignEditorModal
          token={token}
          adminEmail={adminEmail}
          initial={{ audience: { mode: 'all_imported' } }}
          campaignId={editCampaignId}
          onClose={() => setEditCampaignId(null)}
          onSaved={() => void load()}
        />
      ) : null}
    </section>
  );
}
