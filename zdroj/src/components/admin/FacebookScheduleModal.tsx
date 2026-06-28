'use client';

import { useEffect, useState } from 'react';
import type { SocialPublishRepeatType } from '@/lib/social-autopost-admin-api';
import { SOCIAL_REPEAT_TYPE_LABELS } from '@/lib/social-autopost-admin-api';

export type FacebookScheduleFormValues = {
  firstRunAt: string;
  repeatType: SocialPublishRepeatType;
  repeatIntervalDays: string;
  endMode: 'none' | 'maxRuns' | 'repeatUntil';
  maxRuns: string;
  repeatUntil: string;
  requireActive: boolean;
  requireApproved: boolean;
  /** auto | reel | video — jen pro shorts */
  shortsPublishMode: 'auto' | 'reel' | 'video';
};

function defaultFirstRunLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() + 30, 0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultFacebookScheduleForm(): FacebookScheduleFormValues {
  return {
    firstRunAt: defaultFirstRunLocal(),
    repeatType: 'NONE',
    repeatIntervalDays: '7',
    endMode: 'none',
    maxRuns: '10',
    repeatUntil: '',
    requireActive: true,
    requireApproved: true,
    shortsPublishMode: 'auto',
  };
}

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  count: number;
  busy?: boolean;
  initial?: Partial<FacebookScheduleFormValues>;
  onClose: () => void;
  onSubmit: (values: FacebookScheduleFormValues) => void;
};

export function FacebookScheduleModal({
  open,
  title,
  subtitle,
  count,
  busy,
  initial,
  onClose,
  onSubmit,
}: Props) {
  const [form, setForm] = useState<FacebookScheduleFormValues>(defaultFacebookScheduleForm());

  useEffect(() => {
    if (open) {
      setForm({ ...defaultFacebookScheduleForm(), ...initial });
    }
  }, [open, initial]);

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
        <p className="mt-2 text-xs font-medium text-[#1877f2]">
          {count} {count === 1 ? 'inzerát' : count < 5 ? 'inzeráty' : 'inzerátů'}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Datum a čas prvního publikování
            </label>
            <input
              type="datetime-local"
              required
              value={form.firstRunAt}
              onChange={(e) => setForm((f) => ({ ...f, firstRunAt: e.target.value }))}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#1877f2]/55 focus:ring-2 focus:ring-[#1877f2]/15"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Opakování</label>
            <select
              value={form.repeatType}
              onChange={(e) =>
                setForm((f) => ({ ...f, repeatType: e.target.value as SocialPublishRepeatType }))
              }
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#1877f2]/55"
            >
              {(Object.keys(SOCIAL_REPEAT_TYPE_LABELS) as SocialPublishRepeatType[]).map((key) => (
                <option key={key} value={key}>
                  {SOCIAL_REPEAT_TYPE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          {form.repeatType === 'CUSTOM_DAYS' ? (
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Vlastní interval (dny)
              </label>
              <input
                type="number"
                min={1}
                required
                value={form.repeatIntervalDays}
                onChange={(e) => setForm((f) => ({ ...f, repeatIntervalDays: e.target.value }))}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-[#1877f2]/55"
              />
            </div>
          ) : null}

          {form.repeatType !== 'NONE' ? (
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Konec opakování</p>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="endMode"
                  checked={form.endMode === 'none'}
                  onChange={() => setForm((f) => ({ ...f, endMode: 'none' }))}
                />
                Bez limitu
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="endMode"
                  checked={form.endMode === 'maxRuns'}
                  onChange={() => setForm((f) => ({ ...f, endMode: 'maxRuns' }))}
                />
                Počet opakování
              </label>
              {form.endMode === 'maxRuns' ? (
                <input
                  type="number"
                  min={1}
                  value={form.maxRuns}
                  onChange={(e) => setForm((f) => ({ ...f, maxRuns: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              ) : null}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="endMode"
                  checked={form.endMode === 'repeatUntil'}
                  onChange={() => setForm((f) => ({ ...f, endMode: 'repeatUntil' }))}
                />
                Opakovat do data
              </label>
              {form.endMode === 'repeatUntil' ? (
                <input
                  type="datetime-local"
                  value={form.repeatUntil}
                  onChange={(e) => setForm((f) => ({ ...f, repeatUntil: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requireActive}
                onChange={(e) => setForm((f) => ({ ...f, requireActive: e.target.checked }))}
              />
              Publikovat jen aktivní inzeráty
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.requireApproved}
                onChange={(e) => setForm((f) => ({ ...f, requireApproved: e.target.checked }))}
              />
              Publikovat jen schválené inzeráty
            </label>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Shorts / video inzeráty
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="shortsPublishMode"
                checked={form.shortsPublishMode === 'auto'}
                onChange={() => setForm((f) => ({ ...f, shortsPublishMode: 'auto' }))}
              />
              Podle globálního nastavení
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="shortsPublishMode"
                checked={form.shortsPublishMode === 'reel'}
                onChange={() => setForm((f) => ({ ...f, shortsPublishMode: 'reel' }))}
              />
              Publikovat jako Facebook Reel
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="shortsPublishMode"
                checked={form.shortsPublishMode === 'video'}
                onChange={() => setForm((f) => ({ ...f, shortsPublishMode: 'video' }))}
              />
              Publikovat jako běžný video příspěvek
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              Zrušit
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-[#1877f2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166fe0] disabled:opacity-50"
            >
              {busy ? 'Ukládám…' : 'Uložit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
