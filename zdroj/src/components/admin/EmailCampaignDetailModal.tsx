'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestAdminEmailCampaignDetail,
  nestAdminEmailCampaignRecipients,
  nestAdminEmailCampaignSentEmail,
  type EmailCampaignDetail,
  type EmailCampaignRecipientRow,
} from '@/lib/nest-client';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Čeká',
  sent: 'Odesláno',
  failed: 'Chyba',
  opened: 'Otevřeno',
  clicked: 'Kliknuto',
  skipped: 'Bez e-mailu',
  unsubscribed: 'Odhlášeno',
  registered: 'Registrováno',
};

const FILTER_OPTIONS = [
  { id: '', label: 'Všichni' },
  { id: 'sent', label: 'Odesláno' },
  { id: 'failed', label: 'Chyba' },
  { id: 'pending', label: 'Čeká' },
  { id: 'opened', label: 'Otevřeno' },
  { id: 'skipped', label: 'Bez e-mailu' },
] as const;

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
  campaignId: string;
  onClose: () => void;
  onDuplicate?: (id: string) => void;
  onEditAsNew?: (id: string) => void;
};

export function EmailCampaignDetailModal({
  token,
  campaignId,
  onClose,
  onDuplicate,
  onEditAsNew,
}: Props) {
  const [campaign, setCampaign] = useState<EmailCampaignDetail | null>(null);
  const [recipients, setRecipients] = useState<EmailCampaignRecipientRow[]>([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [tab, setTab] = useState<'recipients' | 'email'>('recipients');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadCampaign = useCallback(async () => {
    const r = await nestAdminEmailCampaignDetail(token, campaignId);
    if (r.campaign) setCampaign(r.campaign);
    else setErr(r.error ?? 'Kampaň nenalezena');
  }, [token, campaignId]);

  const loadRecipients = useCallback(async () => {
    setBusy(true);
    const r = await nestAdminEmailCampaignRecipients(token, campaignId, {
      status: filter || undefined,
      page,
      limit: 30,
    });
    setRecipients(r.items);
    setTotal(r.total);
    setHasMore(r.hasMore);
    if (r.error) setErr(r.error);
    setBusy(false);
  }, [token, campaignId, filter, page]);

  const loadSentEmail = useCallback(async () => {
    const r = await nestAdminEmailCampaignSentEmail(token, campaignId);
    if (r.email) {
      setPreviewSubject(r.email.subject);
      setPreviewHtml(r.email.htmlBody);
    } else if (campaign?.steps?.[0]) {
      setPreviewSubject(campaign.steps[0].subject);
      setPreviewHtml(campaign.steps[0].htmlContent);
    }
  }, [token, campaignId, campaign]);

  useEffect(() => {
    void loadCampaign();
  }, [loadCampaign]);

  useEffect(() => {
    void loadRecipients();
  }, [loadRecipients]);

  useEffect(() => {
    if (tab === 'email') void loadSentEmail();
  }, [tab, loadSentEmail]);

  async function showRecipientEmail(recipientId: string) {
    const r = await nestAdminEmailCampaignSentEmail(token, campaignId, { recipientId });
    if (r.email) {
      setPreviewSubject(r.email.subject);
      setPreviewHtml(r.email.htmlBody);
      setTab('email');
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4">
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">{campaign?.title ?? 'Detail kampaně'}</h2>
            <p className="text-xs text-zinc-500">
              Příjemců: {campaign?.recipientCount ?? '—'} · Odesláno: {campaign?.logCount ?? '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold"
          >
            Zavřít
          </button>
        </header>

        <div className="flex shrink-0 gap-2 border-b border-zinc-100 px-4 py-2 sm:px-6">
          <button
            type="button"
            onClick={() => setTab('recipients')}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === 'recipients' ? 'bg-orange-600 text-white' : 'border'
            }`}
          >
            Zobrazit příjemce
          </button>
          <button
            type="button"
            onClick={() => setTab('email')}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
              tab === 'email' ? 'bg-orange-600 text-white' : 'border'
            }`}
          >
            Zobrazit odeslaný e-mail
          </button>
          <button
            type="button"
            onClick={() => onDuplicate?.(campaignId)}
            className="ml-auto rounded-lg border px-3 py-1.5 text-sm font-semibold"
          >
            Duplikovat kampaň
          </button>
          <button
            type="button"
            onClick={() => onEditAsNew?.(campaignId)}
            className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-900"
          >
            Upravit jako novou
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {err ? <p className="mb-3 text-sm text-red-600">{err}</p> : null}

          {tab === 'recipients' ? (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {FILTER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id || 'all'}
                    type="button"
                    onClick={() => {
                      setFilter(opt.id);
                      setPage(0);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      filter === opt.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto rounded-xl border">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-bold uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Jméno</th>
                      <th className="px-3 py-2">E-mail</th>
                      <th className="px-3 py-2">Telefon</th>
                      <th className="px-3 py-2">Zdroj</th>
                      <th className="px-3 py-2">Stav</th>
                      <th className="px-3 py-2">Odesláno</th>
                      <th className="px-3 py-2">Chyba</th>
                      <th className="px-3 py-2"> </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recipients.map((r) => (
                      <tr key={r.id} className="border-t border-zinc-100">
                        <td className="px-3 py-2">{r.fullName || '—'}</td>
                        <td className="px-3 py-2">{r.email || '—'}</td>
                        <td className="px-3 py-2">{r.phone || '—'}</td>
                        <td className="px-3 py-2">{r.sourceLabel}</td>
                        <td className="px-3 py-2">{STATUS_LABEL[r.status] ?? r.status}</td>
                        <td className="px-3 py-2">{fmtDate(r.latestLogSentAt ?? r.lastSentAt)}</td>
                        <td className="px-3 py-2 text-red-600">{r.errorMessage ?? '—'}</td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-xs font-semibold text-orange-700 hover:underline"
                            onClick={() => void showRecipientEmail(r.id)}
                          >
                            E-mail
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-2 text-sm">
                <span className="text-zinc-500">Celkem: {total}</span>
                <button
                  type="button"
                  disabled={page === 0 || busy}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="rounded border px-2 py-1 disabled:opacity-40"
                >
                  Předchozí
                </button>
                <button
                  type="button"
                  disabled={!hasMore || busy}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border px-2 py-1 disabled:opacity-40"
                >
                  Další
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewMode('desktop')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    previewMode === 'desktop' ? 'bg-zinc-900 text-white' : 'border'
                  }`}
                >
                  Desktop náhled
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewMode('mobile')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                    previewMode === 'mobile' ? 'bg-zinc-900 text-white' : 'border'
                  }`}
                >
                  Mobilní náhled
                </button>
              </div>
              <p className="font-semibold text-zinc-800">{previewSubject || 'Předmět'}</p>
              <div
                className={`overflow-auto rounded-xl border bg-zinc-50 p-2 ${
                  previewMode === 'mobile' ? 'mx-auto max-w-[375px]' : 'w-full'
                }`}
              >
                {previewHtml ? (
                  <iframe
                    title="Náhled odeslaného e-mailu"
                    srcDoc={previewHtml}
                    className="w-full border-0 bg-white"
                    style={{ minHeight: previewMode === 'mobile' ? 520 : 480 }}
                  />
                ) : (
                  <p className="p-4 text-sm text-zinc-500">Zatím není uložený odeslaný e-mail.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
