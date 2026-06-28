'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  FacebookScheduleModal,
  type FacebookScheduleFormValues,
  defaultFacebookScheduleForm,
} from '@/components/admin/FacebookScheduleModal';
import {
  SCHEDULE_PLANNER_STATUS_EMOJI,
  SCHEDULE_PLANNER_STATUS_LABELS,
  SOCIAL_PUBLISH_STATUS_LABELS,
  SOCIAL_REPEAT_TYPE_LABELS,
  SOCIAL_TRIGGER_SOURCE_LABELS,
  nestAdminScheduleDelete,
  nestAdminScheduleDetail,
  nestAdminSchedulePause,
  nestAdminSchedulePublishNow,
  nestAdminScheduleResume,
  nestAdminScheduleUpdate,
  nestAdminSchedulesList,
  type SchedulePlannerDashboard,
  type SchedulePlannerDetail,
  type SchedulePlannerRow,
} from '@/lib/social-autopost-admin-api';

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

function scheduleToForm(row: SchedulePlannerRow): FacebookScheduleFormValues {
  const form = defaultFacebookScheduleForm();
  const d = new Date(row.nextRunAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  form.firstRunAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  form.repeatType = row.repeatType;
  form.repeatIntervalDays = String(row.repeatIntervalDays ?? 7);
  form.requireActive = row.requireActive;
  form.requireApproved = row.requireApproved;
  if (row.repeatUntil) {
    form.endMode = 'repeatUntil';
    const u = new Date(row.repeatUntil);
    form.repeatUntil = `${u.getFullYear()}-${pad(u.getMonth() + 1)}-${pad(u.getDate())}`;
  } else if (row.maxRuns) {
    form.endMode = 'maxRuns';
    form.maxRuns = String(row.maxRuns);
  }
  if (row.shortsPublishAsReel === true) form.shortsPublishMode = 'reel';
  else if (row.shortsPublishAsReel === false) form.shortsPublishMode = 'video';
  else form.shortsPublishMode = 'auto';
  return form;
}

function scheduleFormToPatch(form: FacebookScheduleFormValues) {
  const repeatType = form.repeatType;
  return {
    firstRunAt: new Date(form.firstRunAt).toISOString(),
    repeatType,
    repeatIntervalDays:
      repeatType === 'CUSTOM_DAYS' ? Number.parseInt(form.repeatIntervalDays, 10) || 1 : null,
    repeatUntil:
      form.endMode === 'repeatUntil' && form.repeatUntil
        ? new Date(form.repeatUntil).toISOString()
        : null,
    maxRuns:
      form.endMode === 'maxRuns' && form.maxRuns ? Number.parseInt(form.maxRuns, 10) || null : null,
    requireActive: form.requireActive,
    requireApproved: form.requireApproved,
    shortsPublishAsReel:
      form.shortsPublishMode === 'reel' ? true : form.shortsPublishMode === 'video' ? false : null,
  };
}

type Props = {
  token: string | null;
  onNotify?: (msg: string, successUrl?: string | null) => void;
  onDataChange?: () => void;
};

export function FacebookScheduledPlannerPanel({ token, onNotify, onDataChange }: Props) {
  const [rows, setRows] = useState<SchedulePlannerRow[]>([]);
  const [dashboard, setDashboard] = useState<SchedulePlannerDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<SchedulePlannerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editRow, setEditRow] = useState<SchedulePlannerRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const r = await nestAdminSchedulesList(token);
    setRows(r?.items ?? []);
    setDashboard(r?.dashboard ?? null);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(id);
  }, [token, refresh]);

  async function openDetail(row: SchedulePlannerRow) {
    if (!token) return;
    setDetailLoading(true);
    setDetail(null);
    const r = await nestAdminScheduleDetail(token, row.id);
    if (r) setDetail(r);
    setDetailLoading(false);
  }

  async function runAction(
    scheduleId: string,
    action: 'publish' | 'pause' | 'resume' | 'delete',
    title: string,
  ) {
    if (!token) return;
    if (action === 'delete' && !window.confirm('Opravdu smazat tento plán?')) return;
    setBusyId(scheduleId);
    let ok = false;
    let err: string | undefined;
    let url: string | undefined;

    if (action === 'publish') {
      const r = await nestAdminSchedulePublishNow(token, scheduleId);
      ok = Boolean(r?.ok);
      err = r?.error;
      url = r?.publishedUrl;
    } else if (action === 'pause') {
      const r = await nestAdminSchedulePause(token, scheduleId);
      ok = Boolean(r?.ok);
    } else if (action === 'resume') {
      const r = await nestAdminScheduleResume(token, scheduleId);
      ok = Boolean(r?.ok);
    } else {
      const r = await nestAdminScheduleDelete(token, scheduleId);
      ok = Boolean(r?.ok);
      setDetail(null);
    }

    setBusyId(null);
    if (ok) {
      onNotify?.(
        action === 'publish' ? '✅ Publikováno na Facebook.' : `${title} — hotovo`,
        url ?? null,
      );
      await refresh();
      onDataChange?.();
      if (detail?.schedule.id === scheduleId && action !== 'delete') {
        void openDetail(detail.schedule);
      }
    } else {
      onNotify?.(
        action === 'publish'
          ? `❌ Publikace selhala.\nDůvod:\n${err ?? 'neznámá chyba'}`
          : `${title} selhalo: ${err ?? 'neznámá chyba'}`,
      );
    }
  }

  async function saveEdit(form: FacebookScheduleFormValues) {
    if (!token || !editRow) return;
    setBusyId(editRow.id);
    const r = await nestAdminScheduleUpdate(token, editRow.id, scheduleFormToPatch(form));
    setBusyId(null);
    setEditRow(null);
    if (r) {
      onNotify?.('Plán byl upraven.');
      await refresh();
      onDataChange?.();
    } else {
      onNotify?.('Úprava plánu selhala.');
    }
  }

  const dash = dashboard;

  return (
    <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-zinc-900">📅 Naplánované publikace</h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="text-sm font-semibold text-[#1877f2] hover:underline disabled:opacity-50"
        >
          {loading ? 'Obnovuji…' : 'Obnovit'}
        </button>
      </div>

      {dash ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {(
            [
              ['Naplánováno dnes', dash.scheduledToday],
              ['Tento týden', dash.scheduledThisWeek],
              ['Čeká', dash.waiting],
              ['Publikováno dnes', dash.publishedToday],
              ['Selhalo', dash.failed],
              ['Reels', dash.reels],
              ['Příspěvky', dash.posts],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
              <p className="text-xl font-bold tabular-nums text-zinc-900">{value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-[960px] w-full text-left text-sm">
          <thead>
            <tr className="border-b text-[10px] font-bold uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3">Inzerát</th>
              <th className="py-2 pr-3">Typ</th>
              <th className="py-2 pr-3">Vytvořeno</th>
              <th className="py-2 pr-3">Plánováno</th>
              <th className="py-2 pr-3">Opakování</th>
              <th className="py-2 pr-3">Poslední</th>
              <th className="py-2 pr-3">Další</th>
              <th className="py-2 pr-3">Stav</th>
              <th className="py-2 pr-3">Zbývá</th>
              <th className="py-2 pr-3">Autor</th>
              <th className="py-2 pr-3">Stránka</th>
              <th className="py-2">Akce</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-zinc-100 align-top hover:bg-zinc-50/80 cursor-pointer"
                onClick={() => void openDetail(row)}
              >
                <td className="py-2 pr-3 max-w-[160px]">
                  <p className="line-clamp-2 font-medium text-zinc-900">{row.propertyTitle}</p>
                  {row.lastError ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-red-600">{row.lastError}</p>
                  ) : null}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-xs">{row.publishType}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-xs">{formatDt(row.planCreatedAt)}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-xs">{formatDt(row.scheduledAt)}</td>
                <td className="py-2 pr-3 text-xs">
                  {SOCIAL_REPEAT_TYPE_LABELS[row.repeatType] ?? row.repeatType}
                  {row.repeatType === 'CUSTOM_DAYS' && row.repeatIntervalDays
                    ? ` (${row.repeatIntervalDays} dní)`
                    : ''}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-xs">
                  {formatDt(row.lastPublishedAt ?? row.lastRunAt)}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-xs">{formatDt(row.nextRunAt)}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-xs">
                  {SCHEDULE_PLANNER_STATUS_EMOJI[row.displayStatus]}{' '}
                  {SCHEDULE_PLANNER_STATUS_LABELS[row.displayStatus]}
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-xs font-medium text-[#1877f2]">
                  {row.countdown}
                </td>
                <td className="py-2 pr-3 text-xs">
                  {row.author?.name ?? row.author?.email ?? '—'}
                </td>
                <td className="py-2 pr-3 text-xs max-w-[100px] truncate" title={row.facebookPageName}>
                  {row.facebookPageName}
                </td>
                <td className="py-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-col gap-1 min-w-[7rem]">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      className="text-left text-xs font-semibold text-[#1877f2]"
                      onClick={() => void runAction(row.id, 'publish', 'Publikovat')}
                    >
                      Publikovat teď
                    </button>
                    <button
                      type="button"
                      className="text-left text-xs text-zinc-700"
                      onClick={() => setEditRow(row)}
                    >
                      Upravit
                    </button>
                    {row.enabled ? (
                      <button
                        type="button"
                        className="text-left text-xs text-amber-800"
                        onClick={() => void runAction(row.id, 'pause', 'Pozastavení')}
                      >
                        Pozastavit
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="text-left text-xs text-emerald-800"
                        onClick={() => void runAction(row.id, 'resume', 'Obnovení')}
                      >
                        Obnovit
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-left text-xs text-red-700"
                      onClick={() => void runAction(row.id, 'delete', 'Smazání')}
                    >
                      Smazat
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && !loading ? (
          <p className="mt-4 text-sm text-zinc-500">Žádné naplánované publikace.</p>
        ) : null}
      </div>

      {(detail || detailLoading) && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal
        >
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-xl">
            <div className="border-b px-6 py-4">
              <h3 className="text-lg font-semibold">Detail plánu publikování</h3>
              {detail ? (
                <p className="mt-1 text-sm text-zinc-600">{detail.schedule.propertyTitle}</p>
              ) : null}
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {detailLoading ? (
                <p className="text-sm text-zinc-500">Načítání…</p>
              ) : detail ? (
                <div className="space-y-4">
                  <dl className="grid gap-2 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-zinc-500">Vytvořeno</dt>
                      <dd>{formatDt(detail.schedule.planCreatedAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Autor</dt>
                      <dd>
                        {detail.schedule.author?.name ?? detail.schedule.author?.email ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Další běh</dt>
                      <dd>{formatDt(detail.schedule.nextRunAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Facebook stránka</dt>
                      <dd>{detail.schedule.facebookPageName}</dd>
                    </div>
                  </dl>

                  <div>
                    <h4 className="mb-2 text-sm font-semibold">Historie pokusů</h4>
                    {detail.history.length === 0 ? (
                      <p className="text-sm text-zinc-500">Zatím žádné záznamy.</p>
                    ) : (
                      <ul className="space-y-3">
                        {detail.history.map((h) => (
                          <li key={h.id} className="rounded-lg border border-zinc-100 bg-zinc-50 p-3 text-xs">
                            <p>
                              <span className="font-semibold">
                                {SOCIAL_PUBLISH_STATUS_LABELS[h.status] ?? h.status}
                              </span>{' '}
                              · {formatDt(h.createdAt)} ·{' '}
                              {SOCIAL_TRIGGER_SOURCE_LABELS[h.triggerSource] ?? h.triggerSource}
                            </p>
                            {h.externalPostId ? (
                              <p className="mt-1 font-mono">Post ID: {h.externalPostId}</p>
                            ) : null}
                            {h.publishedUrl ? (
                              <a
                                href={h.publishedUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-1 inline-block text-[#1877f2] hover:underline"
                              >
                                Otevřít příspěvek
                              </a>
                            ) : null}
                            {h.lastError ? (
                              <p className="mt-1 text-red-700">{h.lastError}</p>
                            ) : null}
                            {h.lastApiResponse ? (
                              <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all text-[10px] text-zinc-600">
                                {JSON.stringify(h.lastApiResponse, null, 2).slice(0, 600)}
                              </pre>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="border-t px-6 py-4">
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}

      <FacebookScheduleModal
        open={editRow != null}
        title="Upravit plán publikování"
        count={1}
        busy={busyId != null}
        initial={editRow ? scheduleToForm(editRow) : undefined}
        onClose={() => setEditRow(null)}
        onSubmit={(form) => void saveEdit(form)}
      />
    </section>
  );
}
