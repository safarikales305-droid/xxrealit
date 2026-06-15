'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminBonusCampaignCreate,
  nestAdminBonusCampaignDelete,
  nestAdminBonusCampaignsList,
  nestAdminBonusCampaignUpdate,
  type BonusCampaignAdminDto,
} from '@/lib/nest-client';
import {
  BONUS_ACTION_LABELS,
  nestAdminBonusClaimsList,
  nestAdminManualBonusGrant,
  nestAdminManualBonusRevoke,
  type BonusClaimAdminRow,
  type MarketingBonusActionType,
} from '@/lib/marketing-bonus';

const APPLIES_TO = [
  { value: 'BOTH', label: 'Inzerát i tip' },
  { value: 'LISTING', label: 'Vložení inzerátu' },
  { value: 'TIP', label: 'Vložení tipu' },
] as const;

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function appliesLabel(value: string): string {
  return APPLIES_TO.find((x) => x.value === value)?.label ?? value;
}

const ACTION_TYPES = Object.entries(BONUS_ACTION_LABELS) as Array<
  [MarketingBonusActionType, string]
>;

const emptyForm = {
  title: 'Bonus za první inzerát',
  description: '',
  ctaText: 'Založ účet, inzeruj a vydělávej',
  bonusText: 'Bonus 1 000 Kč kreditu při vložení inzerátu nebo tipu',
  amount: '1000',
  appliesTo: 'BOTH' as BonusCampaignAdminDto['appliesTo'],
  actionType: 'FIRST_AD' as MarketingBonusActionType,
  roles: [] as string[],
  isActive: true,
  activeFrom: '',
  activeTo: '',
  oncePerUser: true,
  maxTotalClaims: '',
  maxClaimsPerUser: '1',
  conditionMinCount: '1',
  customConditionText: '',
};

export default function AdminBonusCampaignsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [rows, setRows] = useState<BonusCampaignAdminDto[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [editing, setEditing] = useState<BonusCampaignAdminDto | null>(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);
  const [claims, setClaims] = useState<BonusClaimAdminRow[]>([]);
  const [claimsSummary, setClaimsSummary] = useState({ totalClaims: 0, totalCreditsGranted: 0 });
  const [manualUserId, setManualUserId] = useState('');
  const [manualAmount, setManualAmount] = useState('500');

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const list = await nestAdminBonusCampaignsList(token);
    if (!list) {
      setLoadError('Nepodařilo se načíst bonusové akce.');
      setRows([]);
      return;
    }
    setRows(list);
    const claimsData = await nestAdminBonusClaimsList(token);
    if (claimsData) {
      setClaims(claimsData.claims);
      setClaimsSummary(claimsData.summary);
    }
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  function openEdit(row: BonusCampaignAdminDto) {
    setEditing(row);
    setEditForm({
      title: row.title,
      description: row.description ?? '',
      ctaText: row.ctaText,
      bonusText: row.bonusText,
      amount: String(row.amount),
      appliesTo: row.appliesTo,
      actionType: (row.actionType as MarketingBonusActionType) || 'LEGACY_LISTING_TIP',
      roles: row.roles ?? [],
      isActive: row.isActive,
      activeFrom: toDatetimeLocal(row.activeFrom),
      activeTo: toDatetimeLocal(row.activeTo),
      oncePerUser: row.oncePerUser,
      maxTotalClaims: row.maxTotalClaims != null ? String(row.maxTotalClaims) : '',
      maxClaimsPerUser: String(row.maxClaimsPerUser ?? 1),
      conditionMinCount: String(row.conditionMinCount ?? 1),
      customConditionText: row.customConditionText ?? '',
    });
    setEditMsg(null);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setCreating(true);
    setFormMsg(null);
    const amount = Number.parseInt(form.amount.replace(/\s/g, ''), 10);
    if (!Number.isFinite(amount) || amount < 1) {
      setFormMsg('Zadejte platnou výši bonusu.');
      setCreating(false);
      return;
    }
    const r = await nestAdminBonusCampaignCreate(token, {
      title: form.title.trim(),
      description: form.description.trim(),
      ctaText: form.ctaText.trim(),
      bonusText: form.bonusText.trim(),
      amount,
      appliesTo: form.appliesTo,
      actionType: form.actionType,
      roles: form.roles,
      isActive: form.isActive,
      activeFrom: form.activeFrom ? new Date(form.activeFrom).toISOString() : null,
      activeTo: form.activeTo ? new Date(form.activeTo).toISOString() : null,
      oncePerUser: form.oncePerUser,
      maxTotalClaims: form.maxTotalClaims ? Number.parseInt(form.maxTotalClaims, 10) : null,
      maxClaimsPerUser: Number.parseInt(form.maxClaimsPerUser, 10) || 1,
      conditionMinCount: Number.parseInt(form.conditionMinCount, 10) || 1,
      customConditionText: form.customConditionText.trim(),
    });
    setCreating(false);
    if (!r.ok) {
      setFormMsg(r.error ?? 'Vytvoření selhalo.');
      return;
    }
    setFormMsg('Bonusová akce byla vytvořena.');
    setForm(emptyForm);
    await refresh();
  }

  async function onSaveEdit() {
    if (!token || !editing) return;
    setEditSaving(true);
    setEditMsg(null);
    const amount = Number.parseInt(editForm.amount.replace(/\s/g, ''), 10);
    if (!Number.isFinite(amount) || amount < 1) {
      setEditMsg('Zadejte platnou výši bonusu.');
      setEditSaving(false);
      return;
    }
    const r = await nestAdminBonusCampaignUpdate(token, editing.id, {
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      ctaText: editForm.ctaText.trim(),
      bonusText: editForm.bonusText.trim(),
      amount,
      appliesTo: editForm.appliesTo,
      actionType: editForm.actionType,
      roles: editForm.roles,
      isActive: editForm.isActive,
      activeFrom: editForm.activeFrom ? new Date(editForm.activeFrom).toISOString() : null,
      activeTo: editForm.activeTo ? new Date(editForm.activeTo).toISOString() : null,
      oncePerUser: editForm.oncePerUser,
      maxTotalClaims: editForm.maxTotalClaims ? Number.parseInt(editForm.maxTotalClaims, 10) : null,
      maxClaimsPerUser: Number.parseInt(editForm.maxClaimsPerUser, 10) || 1,
      conditionMinCount: Number.parseInt(editForm.conditionMinCount, 10) || 1,
      customConditionText: editForm.customConditionText.trim(),
    });
    setEditSaving(false);
    if (!r.ok) {
      setEditMsg(r.error ?? 'Uložení selhalo.');
      return;
    }
    setEditMsg('Uloženo.');
    setEditing(null);
    await refresh();
  }

  async function onToggleActive(row: BonusCampaignAdminDto) {
    if (!token) return;
    setBusyId(row.id);
    await nestAdminBonusCampaignUpdate(token, row.id, { isActive: !row.isActive });
    setBusyId(null);
    await refresh();
  }

  async function onDelete(row: BonusCampaignAdminDto) {
    if (!token) return;
    if (!window.confirm(`Smazat bonusovou akci „${row.title}"?`)) return;
    setBusyId(row.id);
    const r = await nestAdminBonusCampaignDelete(token, row.id);
    setBusyId(null);
    if (!r.ok) {
      setLoadError(r.error ?? 'Smazání selhalo.');
      return;
    }
    await refresh();
  }

  function renderFields(
    values: typeof emptyForm,
    onChange: (patch: Partial<typeof emptyForm>) => void,
    idPrefix: string,
  ) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Název akce</span>
          <input
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={values.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Text na tlačítku (CTA)</span>
          <input
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={values.ctaText}
            onChange={(e) => onChange({ ctaText: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Výše bonusu (Kč)</span>
          <input
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            inputMode="numeric"
            value={values.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2 block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Text bonusu (pod CTA)</span>
          <input
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={values.bonusText}
            onChange={(e) => onChange({ bonusText: e.target.value })}
          />
        </label>
        <label className="sm:col-span-2 block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Popis</span>
          <textarea
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            rows={2}
            value={values.description}
            onChange={(e) => onChange({ description: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Marketingový typ akce</span>
          <select
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={values.actionType}
            onChange={(e) =>
              onChange({ actionType: e.target.value as MarketingBonusActionType })
            }
          >
            {ACTION_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Min. počet (pozvánky apod.)</span>
          <input
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            inputMode="numeric"
            value={values.conditionMinCount}
            onChange={(e) => onChange({ conditionMinCount: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Typ akce (legacy)</span>
          <select
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={values.appliesTo}
            onChange={(e) =>
              onChange({ appliesTo: e.target.value as BonusCampaignAdminDto['appliesTo'] })
            }
          >
            {APPLIES_TO.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Platnost od</span>
          <input
            type="datetime-local"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={values.activeFrom}
            onChange={(e) => onChange({ activeFrom: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Platnost do</span>
          <input
            type="datetime-local"
            className="w-full rounded-xl border border-zinc-200 px-3 py-2"
            value={values.activeTo}
            onChange={(e) => onChange({ activeTo: e.target.value })}
          />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(e) => onChange({ isActive: e.target.checked })}
          />
          Akce aktivní
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={values.oncePerUser}
            onChange={(e) => onChange({ oncePerUser: e.target.checked })}
          />
          Limit 1× na uživatele
        </label>
      </div>
    );
  }

  if (isLoading || !user || user.role !== 'ADMIN') {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Admin</p>
            <h1 className="text-xl font-bold text-zinc-900">Bonusové akce</h1>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-800"
          >
            ← Administrace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </p>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Nová bonusová akce</h2>
          <form onSubmit={(e) => void onCreate(e)} className="mt-4 space-y-4">
            {renderFields(form, (patch) => setForm((f) => ({ ...f, ...patch })), 'new')}
            {formMsg ? <p className="text-sm text-zinc-600">{formMsg}</p> : null}
            <button
              type="submit"
              disabled={creating}
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {creating ? 'Vytvářím…' : 'Vytvořit akci'}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Aktivní a minulé akce</h2>
          {rows.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-500">Zatím žádná bonusová akce.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-4 text-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-900">{row.title}</p>
                      <p className="mt-1 text-zinc-600">
                        {row.amount.toLocaleString('cs-CZ')} Kč · {appliesLabel(row.appliesTo)}
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">{row.bonusText}</p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                        row.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-200 text-zinc-600'
                      }`}
                    >
                      {row.isActive ? 'Aktivní' : 'Vypnuto'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onToggleActive(row)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold"
                    >
                      {row.isActive ? 'Vypnout' : 'Zapnout'}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold"
                    >
                      Upravit
                    </button>
                    <button
                      type="button"
                      disabled={busyId === row.id}
                      onClick={() => void onDelete(row)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700"
                    >
                      Smazat
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Přehled bonusů</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Celkem {claimsSummary.totalClaims} bonusů ·{' '}
            {claimsSummary.totalCreditsGranted.toLocaleString('cs-CZ')} Kč rozdáno
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              className="rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder="User ID pro manuální bonus"
              value={manualUserId}
              onChange={(e) => setManualUserId(e.target.value)}
            />
            <input
              className="w-28 rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Kč"
              value={manualAmount}
              onChange={(e) => setManualAmount(e.target.value)}
            />
            <button
              type="button"
              className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                if (!token || !manualUserId.trim()) return;
                const amount = Number.parseInt(manualAmount, 10);
                if (!Number.isFinite(amount)) return;
                void nestAdminManualBonusGrant(token, {
                  userId: manualUserId.trim(),
                  amount,
                  reason: 'CUSTOM',
                }).then(() => void refresh());
              }}
            >
              Připsat bonus
            </button>
          </div>
          <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
            {claims.map((c) => (
              <li key={c.id} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {c.userName || c.userEmail} · {c.amount.toLocaleString('cs-CZ')} Kč ·{' '}
                    {c.campaignTitle}
                  </span>
                  <button
                    type="button"
                    className="text-xs font-semibold text-red-700"
                    onClick={() => {
                      if (!token) return;
                      void nestAdminManualBonusRevoke(token, c.id).then(() => void refresh());
                    }}
                  >
                    Odebrat
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>

      {editing ? (
        <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/45 p-4 sm:items-center">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-zinc-900">Upravit akci</h3>
            <div className="mt-4 space-y-4">
              {renderFields(editForm, (patch) => setEditForm((f) => ({ ...f, ...patch })), 'edit')}
              {editMsg ? <p className="text-sm text-zinc-600">{editMsg}</p> : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={editSaving}
                  onClick={() => void onSaveEdit()}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {editSaving ? 'Ukládám…' : 'Uložit'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold"
                >
                  Zrušit
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
