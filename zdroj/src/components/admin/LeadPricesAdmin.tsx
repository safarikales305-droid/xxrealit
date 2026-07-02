'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  formatRolesLabel,
  nestAdminLeadPriceCreate,
  nestAdminLeadPriceDelete,
  nestAdminLeadPriceUpdate,
  nestAdminLeadPricesList,
  ROLE_LABELS,
  type AdminLeadPrice,
} from '@/lib/o-portalu-admin-api';

type Props = {
  token: string;
};

type LeadForm = Omit<AdminLeadPrice, 'updatedAt'>;

function emptyLead(order: number): LeadForm {
  return {
    id: `new-${Date.now()}`,
    title: '',
    description: '',
    priceCzk: 50,
    priceCredits: 50,
    appliesToRoles: 'AGENT,COMPANY',
    billedToLabel: 'Inzerentovi',
    active: true,
    order,
  };
}

export function LeadPricesAdmin({ token }: Props) {
  const [items, setItems] = useState<LeadForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await nestAdminLeadPricesList(token);
    setLoading(false);
    if (!data) {
      setError('Nepodařilo se načíst ceník.');
      return;
    }
    setItems(data.items);
    setError(null);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateItem(id: string, patch: Partial<LeadForm>) {
    setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function saveItem(row: LeadForm) {
    setSavingId(row.id);
    setMsg(null);
    setError(null);
    const isNew = row.id.startsWith('new-');
    const payload = {
      title: row.title,
      description: row.description,
      priceCzk: row.priceCzk,
      priceCredits: row.priceCredits,
      appliesToRoles: row.appliesToRoles,
      billedToLabel: row.billedToLabel,
      active: row.active,
      order: row.order,
    };
    const saved = isNew
      ? await nestAdminLeadPriceCreate(token, payload)
      : await nestAdminLeadPriceUpdate(token, row.id, payload);
    setSavingId(null);
    if (!saved) {
      setError('Uložení položky selhalo.');
      return;
    }
    setItems((prev) => prev.map((r) => (r.id === row.id ? saved : r)));
    setMsg(`Uloženo: ${saved.title}`);
  }

  async function removeItem(row: LeadForm) {
    if (row.id.startsWith('new-')) {
      setItems((prev) => prev.filter((r) => r.id !== row.id));
      return;
    }
    if (!window.confirm(`Smazat „${row.title}"?`)) return;
    const r = await nestAdminLeadPriceDelete(token, row.id);
    if (!r?.ok) {
      setError('Smazání selhalo.');
      return;
    }
    setItems((prev) => prev.filter((item) => item.id !== row.id));
  }

  if (loading) {
    return <p className="text-sm text-zinc-500">Načítám ceník leadů…</p>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Ceník leadů</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Veřejný ceník na{' '}
            <Link href="/o-portalu#cenik-leadu" target="_blank" className="font-semibold text-orange-600 hover:underline">
              /o-portalu
            </Link>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setItems((prev) => [...prev, emptyLead(prev.length + 1)])}
          className="rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white"
        >
          + Přidat položku
        </button>
      </div>

      {msg ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</p> : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <div className="space-y-4">
        {items.map((row) => (
          <article
            key={row.id}
            className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-6"
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="text-sm font-semibold text-zinc-700">
                Název leadu
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  value={row.title}
                  onChange={(e) => updateItem(row.id, { title: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold text-zinc-700">
                  Cena Kč
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                    value={row.priceCzk}
                    onChange={(e) =>
                      updateItem(row.id, { priceCzk: Number.parseInt(e.target.value, 10) || 0 })
                    }
                  />
                </label>
                <label className="text-sm font-semibold text-zinc-700">
                  Cena kreditů
                  <input
                    type="number"
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                    value={row.priceCredits}
                    onChange={(e) =>
                      updateItem(row.id, {
                        priceCredits: Number.parseInt(e.target.value, 10) || 0,
                      })
                    }
                  />
                </label>
              </div>
              <label className="text-sm font-semibold text-zinc-700 lg:col-span-2">
                Popis
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  value={row.description}
                  onChange={(e) => updateItem(row.id, { description: e.target.value })}
                />
              </label>
              <label className="text-sm font-semibold text-zinc-700">
                Role (čárkou: USER, AGENT, COMPANY, ALL)
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  value={row.appliesToRoles}
                  onChange={(e) => updateItem(row.id, { appliesToRoles: e.target.value })}
                />
                <span className="mt-1 block text-xs font-normal text-zinc-500">
                  {formatRolesLabel(row.appliesToRoles)}
                </span>
              </label>
              <label className="text-sm font-semibold text-zinc-700">
                Komu se účtuje
                <input
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2"
                  value={row.billedToLabel ?? ''}
                  onChange={(e) => updateItem(row.id, { billedToLabel: e.target.value })}
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
                <input
                  type="checkbox"
                  checked={row.active}
                  onChange={(e) => updateItem(row.id, { active: e.target.checked })}
                />
                Aktivní (zobrazit veřejně)
              </label>
              <label className="text-sm font-semibold text-zinc-700">
                Pořadí
                <input
                  type="number"
                  className="mt-1 w-24 rounded-xl border border-zinc-200 px-3 py-2"
                  value={row.order}
                  onChange={(e) =>
                    updateItem(row.id, { order: Number.parseInt(e.target.value, 10) || 0 })
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                disabled={savingId === row.id}
                onClick={() => void saveItem(row)}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {savingId === row.id ? 'Ukládám…' : 'Uložit'}
              </button>
              <button
                type="button"
                onClick={() => void removeItem(row)}
                className="text-sm font-semibold text-red-600 hover:underline"
              >
                Smazat
              </button>
            </div>
          </article>
        ))}
      </div>

      <p className="text-xs text-zinc-500">
        Dostupné role: {Object.entries(ROLE_LABELS).map(([k, v]) => `${k} (${v})`).join(' · ')}
      </p>
    </div>
  );
}
