'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  confirmCooperationCancel,
  fetchCooperationCancel,
  fetchProfileReminder,
  fetchWorkGuideAdmin,
  restoreCooperation,
  updateProfileReminder,
  updateWorkGuideAdmin,
  type WorkerCooperationCancelInfo,
  type WorkerProfileReminderInfo,
  type WorkerWorkGuideAdmin,
} from '@/lib/portal-worker-communication-api';

type Props = {
  workerId: string;
  token: string | null;
};

export function WorkerAdminCommunicationPanel({ workerId, token }: Props) {
  const [reminder, setReminder] = useState<WorkerProfileReminderInfo | null>(null);
  const [cooperation, setCooperation] = useState<WorkerCooperationCancelInfo | null>(null);
  const [guide, setGuide] = useState<WorkerWorkGuideAdmin | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, c, g] = await Promise.all([
      fetchProfileReminder(token, workerId),
      fetchCooperationCancel(token, workerId),
      fetchWorkGuideAdmin(token, workerId),
    ]);
    if (!('error' in r && r.error)) setReminder(r as WorkerProfileReminderInfo);
    if (!('error' in c && c.error)) setCooperation(c as WorkerCooperationCancelInfo);
    if (!('error' in g && g.error)) setGuide(g as WorkerWorkGuideAdmin);
  }, [token, workerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleReminder(enabled: boolean) {
    setBusy(true);
    const r = await updateProfileReminder(token, workerId, enabled);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Uložení selhalo');
      return;
    }
    await load();
    setMsg(enabled ? 'Výzvy k dokončení profilu zapnuty.' : 'Výzvy vypnuty.');
  }

  async function saveGuide() {
    if (!guide) return;
    setBusy(true);
    const r = await updateWorkGuideAdmin(token, workerId, {
      enabled: guide.guide.enabled,
      steps: guide.guide.steps.map((s, i) => ({
        title: s.title,
        body: s.body,
        sortOrder: i,
      })),
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Uložení postupu selhalo');
      return;
    }
    if ('guide' in r && r.guide) {
      setGuide({ guide: r.guide, templates: 'templates' in r ? (r.templates as WorkerWorkGuideAdmin['templates']) : [] });
    }
    setMsg('Postup práce uložen.');
  }

  async function confirmCancel() {
    setBusy(true);
    const r = await confirmCooperationCancel(token, workerId);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Potvrzení selhalo');
      return;
    }
    await load();
    setMsg('Ukončení spolupráce potvrzeno.');
  }

  async function restore() {
    setBusy(true);
    const r = await restoreCooperation(token, workerId);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Obnovení selhalo');
      return;
    }
    await load();
    setMsg('Spolupráce obnovena.');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Link
          href={`/admin/pracovnici-portalu/${workerId}/chat`}
          className="rounded-lg bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
        >
          Chat
        </Link>
      </div>

      {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      {reminder ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Výzva k dokončení profilu</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={reminder.enabled}
                disabled={busy}
                onChange={(e) => void toggleReminder(e.target.checked)}
              />
              Zapnuto
            </label>
          </div>
          <p className="mt-2 text-sm">
            Profil:{' '}
            <strong className={reminder.profileComplete ? 'text-emerald-700' : 'text-amber-700'}>
              {reminder.profileComplete ? 'kompletní' : 'nekompletní'}
            </strong>
          </p>
          {!reminder.profileComplete && reminder.missing.length > 0 ? (
            <p className="mt-1 text-sm text-zinc-600">Chybí: {reminder.missing.join(', ')}</p>
          ) : null}
          <p className="mt-1 text-xs text-zinc-500">
            Poslední výzva:{' '}
            {reminder.lastReminderSentAt
              ? new Date(reminder.lastReminderSentAt).toLocaleString('cs-CZ')
              : 'zatím neodeslána'}{' '}
            · Počet výzev: {reminder.remindersSentCount}
          </p>
        </section>
      ) : null}

      {cooperation?.request ? (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900">Ukončení spolupráce</h2>
          <p className="mt-2 text-sm text-amber-900">
            Stav: <strong>{cooperation.request.status}</strong>
          </p>
          <p className="text-sm text-amber-900">
            Datum žádosti: {new Date(cooperation.request.requestedAt).toLocaleString('cs-CZ')}
          </p>
          {cooperation.request.reason ? (
            <p className="mt-2 text-sm text-amber-900">Důvod: {cooperation.request.reason}</p>
          ) : null}
          {cooperation.request.status === 'PENDING' ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmCancel()}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Potvrdit ukončení
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void restore()}
                className="rounded-lg border border-emerald-600 px-3 py-1.5 text-sm font-semibold text-emerald-800"
              >
                Obnovit spolupráci
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {guide ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Postup práce</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={guide.guide.enabled}
                onChange={(e) =>
                  setGuide({
                    ...guide,
                    guide: { ...guide.guide, enabled: e.target.checked },
                  })
                }
              />
              Zobrazit pracovníkovi
            </label>
          </div>
          {guide.guide.steps.map((step, idx) => (
            <div key={step.id} className="rounded-lg border border-zinc-100 p-3">
              <input
                value={step.title}
                onChange={(e) => {
                  const steps = [...guide.guide.steps];
                  steps[idx] = { ...steps[idx], title: e.target.value };
                  setGuide({ ...guide, guide: { ...guide.guide, steps } });
                }}
                className="mb-2 w-full rounded border px-2 py-1 text-sm font-semibold"
              />
              <textarea
                value={step.body}
                onChange={(e) => {
                  const steps = [...guide.guide.steps];
                  steps[idx] = { ...steps[idx], body: e.target.value };
                  setGuide({ ...guide, guide: { ...guide.guide, steps } });
                }}
                rows={2}
                className="w-full rounded border px-2 py-1 text-sm"
              />
              <button
                type="button"
                className="mt-1 text-xs text-red-600"
                onClick={() => {
                  const steps = guide.guide.steps.filter((_, i) => i !== idx);
                  setGuide({ ...guide, guide: { ...guide.guide, steps } });
                }}
              >
                Smazat krok
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-semibold text-[#e85d00]"
            onClick={() =>
              setGuide({
                ...guide,
                guide: {
                  ...guide.guide,
                  steps: [
                    ...guide.guide.steps,
                    {
                      id: `new-${Date.now()}`,
                      sortOrder: guide.guide.steps.length,
                      title: `Krok ${guide.guide.steps.length + 1}`,
                      body: '',
                    },
                  ],
                },
              })
            }
          >
            + Přidat krok
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveGuide()}
            className="block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Uložit postup
          </button>
        </section>
      ) : null}
    </div>
  );
}
