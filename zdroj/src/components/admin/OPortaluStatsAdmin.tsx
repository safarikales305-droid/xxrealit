'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  computeDisplayedPreview,
  formatStatFetchedAt,
  nestAdminOPortaluMonthlyDelete,
  nestAdminOPortaluRecalculate,
  nestAdminOPortaluRefreshDatabase,
  nestAdminOPortaluRefreshFacebook,
  nestAdminOPortaluRefreshInstagram,
  nestAdminOPortaluRefreshStat,
  nestAdminOPortaluStatsGet,
  nestAdminOPortaluStatsPut,
  VALUE_SOURCE_LABELS,
  type AdminPortalMonthlyStat,
  type AdminPortalStat,
  type AdminPortalStatImportLog,
  type StatValueSource,
} from '@/lib/o-portalu-admin-api';

type StatFormRow = AdminPortalStat & { manualValueInput: string };

type MonthlyFormRow = AdminPortalMonthlyStat & { isNew?: boolean };

type Props = {
  token: string;
};

function emptyMonthly(): MonthlyFormRow {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return {
    id: `new-${Date.now()}`,
    month,
    label: month,
    visits: 0,
    views: 0,
    socialReach: 0,
    leads: 0,
    multiplier: 1,
    displayedVisits: 0,
    displayedViews: 0,
    displayedSocialReach: 0,
    displayedLeads: 0,
    enabled: true,
    updatedAt: new Date().toISOString(),
    isNew: true,
  };
}

function applyStatsToForm(stats: AdminPortalStat[]): StatFormRow[] {
  return stats.map((s) => ({
    ...s,
    manualValueInput: s.manualValue != null ? String(s.manualValue) : '',
  }));
}

export function OPortaluStatsAdmin({ token }: Props) {
  const [stats, setStats] = useState<StatFormRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlyFormRow[]>([]);
  const [importLogs, setImportLogs] = useState<AdminPortalStatImportLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [rowRefreshBusy, setRowRefreshBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await nestAdminOPortaluStatsGet(token);
    setLoading(false);
    if (!data) {
      setError('Nepodařilo se načíst statistiky.');
      return;
    }
    setStats(applyStatsToForm(data.stats));
    setMonthly(data.monthly);
    setImportLogs(data.importLogs ?? []);
    setError(null);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateStat(id: string, patch: Partial<StatFormRow>) {
    setStats((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        const manualValue =
          next.manualValueInput.trim() === ''
            ? null
            : Number.parseFloat(next.manualValueInput.replace(',', '.'));
        next.displayedValue = computeDisplayedPreview(
          next.realValue,
          next.multiplier,
          manualValue != null && Number.isFinite(manualValue) ? manualValue : null,
        );
        return next;
      }),
    );
  }

  function updateMonthly(id: string, patch: Partial<MonthlyFormRow>) {
    setMonthly((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        const m = next.multiplier || 1;
        next.displayedVisits = Math.round(next.visits * m);
        next.displayedViews = Math.round(next.views * m);
        next.displayedSocialReach = Math.round(next.socialReach * m);
        next.displayedLeads = Math.round(next.leads * m);
        return next;
      }),
    );
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    setError(null);
    const r = await nestAdminOPortaluStatsPut(token, {
      stats: stats.map((s) => ({
        id: s.id,
        label: s.label,
        realValue: s.realValue,
        multiplier: s.multiplier,
        manualValue:
          s.manualValueInput.trim() === ''
            ? null
            : Number.parseFloat(s.manualValueInput.replace(',', '.')),
        enabled: s.enabled,
        order: s.order,
        valueSource: s.valueSource,
      })),
      monthly: monthly.map((m) => ({
        id: m.isNew ? undefined : m.id,
        month: m.month,
        visits: m.visits,
        views: m.views,
        socialReach: m.socialReach,
        leads: m.leads,
        multiplier: m.multiplier,
        enabled: m.enabled,
      })),
    });
    setSaving(false);
    if (!r) {
      setError('Uložení selhalo.');
      return;
    }
    setStats(applyStatsToForm(r.stats));
    setMonthly(r.monthly);
    setMsg('Statistiky byly uloženy.');
  }

  async function runAction(
    key: string,
    fn: () => Promise<{
      ok?: boolean;
      error?: string;
      errors?: string[];
      updated?: string[] | number;
      stats?: AdminPortalStat[];
      importLogs?: AdminPortalStatImportLog[];
    }>,
    successMessage: string,
  ) {
    setActionBusy(key);
    setMsg(null);
    setError(null);
    const r = await fn();
    setActionBusy(null);
    if (r.stats) setStats(applyStatsToForm(r.stats));
    if (r.importLogs) setImportLogs(r.importLogs);
    if (r.ok === false || r.error || (r.errors && r.errors.length > 0)) {
      const detail = r.error ?? r.errors?.join('\n');
      setError(detail ? `${successMessage} — chyba:\n${detail}` : 'Akce selhala.');
      if (r.stats) setMsg('Částečně aktualizováno — staré hodnoty zůstaly zachovány.');
      return;
    }
    setMsg(successMessage);
  }

  async function refreshRow(statId: string) {
    setRowRefreshBusy(statId);
    setError(null);
    const r = await nestAdminOPortaluRefreshStat(token, statId);
    setRowRefreshBusy(null);
    if (r.stats) setStats(applyStatsToForm(r.stats));
    if (r.importLogs) setImportLogs(r.importLogs);
    if (!r.ok) {
      setError(r.error ?? 'Načtení statistiky selhalo. Stará hodnota zůstala zachována.');
      return;
    }
    setMsg('Statistika byla načtena ze zdroje.');
  }

  async function removeMonthly(row: MonthlyFormRow) {
    if (row.isNew) {
      setMonthly((prev) => prev.filter((m) => m.id !== row.id));
      return;
    }
    if (!window.confirm(`Smazat měsíc ${row.month}?`)) return;
    const r = await nestAdminOPortaluMonthlyDelete(token, row.id);
    if (!r?.ok) {
      setError('Smazání měsíce selhalo.');
      return;
    }
    setMonthly((prev) => prev.filter((m) => m.id !== row.id));
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Načítám statistiky…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Statistiky veřejné stránky</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Marketing → O portálu · hodnoty pro sekci dosahu na{' '}
            <Link href="/o-portalu" target="_blank" className="font-semibold text-orange-600 hover:underline">
              /o-portalu
            </Link>
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Veřejně: ruční hodnota má přednost, jinak reálná × násobič. Při chybě API zůstávají poslední uložené hodnoty.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || actionBusy != null}
          className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Ukládám…' : 'Uložit vše'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={actionBusy != null}
          onClick={() =>
            void runAction(
              'db',
              () => nestAdminOPortaluRefreshDatabase(token),
              'Interní statistiky byly načteny z databáze.',
            )
          }
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
        >
          {actionBusy === 'db' ? 'Načítám…' : 'Načíst z databáze'}
        </button>
        <button
          type="button"
          disabled={actionBusy != null}
          onClick={() =>
            void runAction(
              'fb',
              () => nestAdminOPortaluRefreshFacebook(token),
              'Facebook statistiky byly načteny.',
            )
          }
          className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800 disabled:opacity-50"
        >
          {actionBusy === 'fb' ? 'Načítám…' : 'Načíst Facebook statistiky'}
        </button>
        <button
          type="button"
          disabled={actionBusy != null}
          onClick={() =>
            void runAction(
              'ig',
              () => nestAdminOPortaluRefreshInstagram(token),
              'Instagram statistiky byly načteny.',
            )
          }
          className="rounded-xl border border-pink-200 bg-pink-50 px-4 py-2 text-sm font-semibold text-pink-800 disabled:opacity-50"
        >
          {actionBusy === 'ig' ? 'Načítám…' : 'Načíst Instagram statistiky'}
        </button>
        <button
          type="button"
          disabled={actionBusy != null}
          onClick={() =>
            void runAction(
              'recalc',
              () => nestAdminOPortaluRecalculate(token),
              'Veřejné hodnoty byly přepočítány.',
            )
          }
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
        >
          {actionBusy === 'recalc' ? 'Počítám…' : 'Přepočítat veřejné hodnoty'}
        </button>
      </div>

      {msg ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 whitespace-pre-line">{msg}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 whitespace-pre-line">{error}</p> : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <h2 className="text-lg font-bold text-zinc-900">Aktuální hodnoty</h2>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-[1100px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500">
                <th className="py-2 pr-3">Zap.</th>
                <th className="py-2 pr-3">Položka</th>
                <th className="py-2 pr-3">Zdroj</th>
                <th className="py-2 pr-3">Poslední načtení</th>
                <th className="py-2 pr-3">Načíst</th>
                <th className="py-2 pr-3">Reálná</th>
                <th className="py-2 pr-3">Násobič</th>
                <th className="py-2 pr-3">Ruční</th>
                <th className="py-2 pr-3">Veřejně</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 align-top">
                  <td className="py-3 pr-3">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => updateStat(row.id, { enabled: e.target.checked })}
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium text-zinc-900">
                      {row.icon ? `${row.icon} ` : ''}
                      {row.label}
                    </div>
                    {row.lastFetchError ? (
                      <p className="mt-1 max-w-xs text-xs text-red-600" title={row.lastFetchError}>
                        {row.lastFetchError}
                      </p>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3">
                    <select
                      className="rounded-lg border border-zinc-200 px-2 py-1 text-xs"
                      value={row.valueSource}
                      onChange={(e) =>
                        updateStat(row.id, { valueSource: e.target.value as StatValueSource })
                      }
                    >
                      {(Object.keys(VALUE_SOURCE_LABELS) as StatValueSource[]).map((src) => (
                        <option key={src} value={src}>
                          {VALUE_SOURCE_LABELS[src]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-3 text-xs text-zinc-500 whitespace-nowrap">
                    {formatStatFetchedAt(row.lastFetchedAt)}
                  </td>
                  <td className="py-3 pr-3">
                    {row.valueSource !== 'manual' ? (
                      <button
                        type="button"
                        disabled={rowRefreshBusy === row.id || actionBusy != null}
                        onClick={() => void refreshRow(row.id)}
                        className="text-xs font-semibold text-violet-700 hover:underline disabled:opacity-50"
                      >
                        {rowRefreshBusy === row.id
                          ? '…'
                          : row.valueSource === 'database'
                            ? 'Načíst z DB'
                            : 'Načíst z API'}
                      </button>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      type="number"
                      className="w-28 rounded-lg border border-zinc-200 px-2 py-1"
                      value={row.realValue}
                      onChange={(e) =>
                        updateStat(row.id, { realValue: Number.parseFloat(e.target.value) || 0 })
                      }
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      type="number"
                      step="0.1"
                      className="w-20 rounded-lg border border-zinc-200 px-2 py-1"
                      value={row.multiplier}
                      onChange={(e) =>
                        updateStat(row.id, { multiplier: Number.parseFloat(e.target.value) || 1 })
                      }
                    />
                  </td>
                  <td className="py-3 pr-3">
                    <input
                      type="text"
                      placeholder="—"
                      className="w-28 rounded-lg border border-zinc-200 px-2 py-1"
                      value={row.manualValueInput}
                      onChange={(e) => updateStat(row.id, { manualValueInput: e.target.value })}
                    />
                  </td>
                  <td className="py-3 pr-3 font-bold text-orange-600 whitespace-nowrap">
                    {row.displayedValue.toLocaleString('cs-CZ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {importLogs.length > 0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
          <h2 className="text-lg font-bold text-zinc-900">Log importů</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-2 pr-3">Čas</th>
                  <th className="py-2 pr-3">Statistika</th>
                  <th className="py-2 pr-3">Zdroj</th>
                  <th className="py-2 pr-3">Hodnota</th>
                  <th className="py-2 pr-3">Chyba</th>
                </tr>
              </thead>
              <tbody>
                {importLogs.map((log) => (
                  <tr key={log.id} className="border-b border-zinc-100">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatStatFetchedAt(log.createdAt)}</td>
                    <td className="py-2 pr-3">{log.statKey}</td>
                    <td className="py-2 pr-3">{log.source}</td>
                    <td className="py-2 pr-3">
                      {log.fetchedValue != null ? log.fetchedValue.toLocaleString('cs-CZ') : '—'}
                    </td>
                    <td className="py-2 pr-3 text-red-600">{log.error ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Měsíční data pro graf</h2>
            <p className="mt-1 text-sm text-zinc-500">Formát měsíce: YYYY-MM (např. 2026-05)</p>
          </div>
          <button
            type="button"
            onClick={() => setMonthly((prev) => [...prev, emptyMonthly()])}
            className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-800"
          >
            + Přidat měsíc
          </button>
        </div>
        <div className="mt-6 space-y-4">
          {monthly.length === 0 ? (
            <p className="text-sm text-zinc-500">
              Žádná měsíční data — na veřejné stránce se zobrazí souhrnný graf z aktuálních hodnot.
            </p>
          ) : null}
          {monthly.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 lg:grid-cols-8"
            >
              <label className="text-xs font-semibold text-zinc-600 lg:col-span-1">
                Měsíc
                <input
                  type="month"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  value={row.month}
                  onChange={(e) => updateMonthly(row.id, { month: e.target.value })}
                />
              </label>
              {(['visits', 'views', 'socialReach', 'leads'] as const).map((field) => (
                <label key={field} className="text-xs font-semibold text-zinc-600">
                  {field === 'visits'
                    ? 'Návštěvy'
                    : field === 'views'
                      ? 'Shlédnutí'
                      : field === 'socialReach'
                        ? 'Sociální dosah'
                        : 'Leady'}
                  <input
                    type="number"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                    value={row[field]}
                    onChange={(e) =>
                      updateMonthly(row.id, { [field]: Number.parseFloat(e.target.value) || 0 })
                    }
                  />
                </label>
              ))}
              <label className="text-xs font-semibold text-zinc-600">
                Násobič
                <input
                  type="number"
                  step="0.1"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
                  value={row.multiplier}
                  onChange={(e) =>
                    updateMonthly(row.id, { multiplier: Number.parseFloat(e.target.value) || 1 })
                  }
                />
              </label>
              <div className="flex items-end gap-2 lg:col-span-1">
                <label className="flex items-center gap-2 text-xs font-semibold text-zinc-600">
                  <input
                    type="checkbox"
                    checked={row.enabled}
                    onChange={(e) => updateMonthly(row.id, { enabled: e.target.checked })}
                  />
                  Zapnuto
                </label>
                <button
                  type="button"
                  onClick={() => void removeMonthly(row)}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Smazat
                </button>
              </div>
              <p className="text-xs text-zinc-500 lg:col-span-8">
                Veřejně: návštěvy {row.displayedVisits.toLocaleString('cs-CZ')} · shlédnutí{' '}
                {row.displayedViews.toLocaleString('cs-CZ')} · dosah{' '}
                {row.displayedSocialReach.toLocaleString('cs-CZ')} · leady{' '}
                {row.displayedLeads.toLocaleString('cs-CZ')}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
