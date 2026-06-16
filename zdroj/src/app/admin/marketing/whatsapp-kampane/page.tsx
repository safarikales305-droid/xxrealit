'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  CZECH_REGIONS,
  nestAdminWhatsAppCampaignCreate,
  nestAdminWhatsAppCampaignDelete,
  nestAdminWhatsAppCampaignPreview,
  nestAdminWhatsAppCampaignRun,
  nestAdminWhatsAppCampaignsList,
  nestAdminWhatsAppCampaignTest,
  nestAdminWhatsAppHistory,
  parsePhonesFromCsv,
  WHATSAPP_CAMPAIGN_TYPE_LABELS,
  WHATSAPP_TARGET_ROLES,
  type WhatsAppCampaignRow,
  type WhatsAppCampaignType,
  type WhatsAppHistoryRow,
} from '@/lib/whatsapp-admin-api';

const emptyForm = {
  name: '',
  campaignType: 'CUSTOM' as WhatsAppCampaignType,
  messageTemplate:
    'Ahoj {jmeno}! Máme pro vás novinku na XXrealit. Váš kredit: {kredit} Kč. {odkaz}',
  targetRoles: [] as string[],
  targetRegions: [] as string[],
  targetCities: '',
  manualPhones: '',
  csvText: '',
};

export default function AdminWhatsAppCampaignsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [campaigns, setCampaigns] = useState<WhatsAppCampaignRow[]>([]);
  const [history, setHistory] = useState<WhatsAppHistoryRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [preview, setPreview] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const [list, hist] = await Promise.all([
      nestAdminWhatsAppCampaignsList(token),
      nestAdminWhatsAppHistory(token, 150),
    ]);
    if (!list) {
      setLoadError('Nepodařilo se načíst kampaně.');
      return;
    }
    setCampaigns(list);
    setHistory(hist ?? []);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  function toggleRole(role: string) {
    setForm((f) => ({
      ...f,
      targetRoles: f.targetRoles.includes(role)
        ? f.targetRoles.filter((r) => r !== role)
        : [...f.targetRoles, role],
    }));
  }

  function toggleRegion(region: string) {
    setForm((f) => ({
      ...f,
      targetRegions: f.targetRegions.includes(region)
        ? f.targetRegions.filter((r) => r !== region)
        : [...f.targetRegions, region],
    }));
  }

  function buildPhones(): string[] {
    const manual = form.manualPhones
      .split(/[\n,;]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    const fromCsv = parsePhonesFromCsv(form.csvText);
    return [...new Set([...manual, ...fromCsv])];
  }

  function buildPayload() {
    const cities = form.targetCities
      .split(/[\n,;]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    return {
      name: form.name.trim(),
      campaignType: form.campaignType,
      messageTemplate: form.messageTemplate.trim(),
      targetRoles: form.targetRoles,
      targetRegions: form.targetRegions,
      targetCities: cities,
      manualPhones: buildPhones(),
    };
  }

  async function onPreview() {
    if (!token) return;
    setStatusMsg(null);
    const p = await nestAdminWhatsAppCampaignPreview(token, buildPayload());
    setPreview(p);
    if (!p) setStatusMsg('Náhled se nepodařil vygenerovat.');
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!form.name.trim() || !form.messageTemplate.trim()) {
      setStatusMsg('Vyplňte název a text zprávy.');
      return;
    }
    setCreating(true);
    setStatusMsg(null);
    const r = await nestAdminWhatsAppCampaignCreate(token, buildPayload());
    setCreating(false);
    if (!r.ok) {
      setStatusMsg(r.error);
      return;
    }
    setForm(emptyForm);
    setPreview(null);
    setStatusMsg('Kampaň vytvořena.');
    void refresh();
  }

  async function onTest(campaign: WhatsAppCampaignRow) {
    if (!token) return;
    setBusyId(campaign.id);
    setStatusMsg(null);
    const r = await nestAdminWhatsAppCampaignTest(token, campaign.id);
    setBusyId(null);
    setStatusMsg(r.ok ? 'Test kampaně odeslán.' : r.error);
    void refresh();
  }

  async function onRun(campaign: WhatsAppCampaignRow) {
    if (!token) return;
    if (!window.confirm(`Opravdu spustit kampaň „${campaign.name}"?`)) return;
    setBusyId(campaign.id);
    setStatusMsg(null);
    const r = await nestAdminWhatsAppCampaignRun(token, campaign.id);
    setBusyId(null);
    setStatusMsg(
      r.ok
        ? `Kampaň dokončena: odesláno ${r.data.sentCount}, chyb ${r.data.failedCount}, přeskočeno ${r.data.skippedCount}.`
        : r.error,
    );
    void refresh();
  }

  async function onDelete(campaign: WhatsAppCampaignRow) {
    if (!token) return;
    if (!window.confirm(`Smazat kampaň „${campaign.name}"?`)) return;
    setBusyId(campaign.id);
    const ok = await nestAdminWhatsAppCampaignDelete(token, campaign.id);
    setBusyId(null);
    if (!ok) setStatusMsg('Smazání selhalo.');
    else void refresh();
  }

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Marketing</p>
            <h1 className="text-xl font-bold text-zinc-900">WhatsApp kampaně</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Cílení podle rolí a regionů, proměnné {'{jmeno}'}, {'{role}'}, {'{odkaz}'},{' '}
              {'{kredit}'}. Bez duplicit na stejné číslo v rámci kampaně.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/integrace/whatsapp"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"
            >
              ← WhatsApp nastavení
            </Link>
            <Link
              href="/admin"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"
            >
              Administrace
            </Link>
          </div>
        </div>

        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        {statusMsg ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
            {statusMsg}
          </p>
        ) : null}

        <form
          onSubmit={(e) => void onCreate(e)}
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-zinc-900">Nová kampaň</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Název kampaně"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <select
                value={form.campaignType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    campaignType: e.target.value as WhatsAppCampaignType,
                  }))
                }
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                {(
                  Object.entries(WHATSAPP_CAMPAIGN_TYPE_LABELS) as Array<
                    [WhatsAppCampaignType, string]
                  >
                ).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <textarea
                rows={6}
                value={form.messageTemplate}
                onChange={(e) => setForm((f) => ({ ...f, messageTemplate: e.target.value }))}
                placeholder="Text zprávy…"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              {preview ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-sm text-zinc-800">
                  <p className="text-xs font-semibold text-emerald-800">Náhled</p>
                  <p className="mt-1 whitespace-pre-wrap">{preview}</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Cílové role</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {WHATSAPP_TARGET_ROLES.map((r) => (
                    <label
                      key={r.value}
                      className={`cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${
                        form.targetRoles.includes(r.value)
                          ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                          : 'border-zinc-200 text-zinc-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={form.targetRoles.includes(r.value)}
                        onChange={() => toggleRole(r.value)}
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase text-zinc-500">Cílové kraje</p>
                <div className="mt-2 flex max-h-32 flex-wrap gap-1 overflow-y-auto">
                  {CZECH_REGIONS.map((region) => (
                    <button
                      key={region}
                      type="button"
                      onClick={() => toggleRegion(region)}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        form.targetRegions.includes(region)
                          ? 'border-blue-400 bg-blue-50 text-blue-900'
                          : 'border-zinc-200 text-zinc-600'
                      }`}
                    >
                      {region}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-zinc-500">
                  Cílová města (čárkou / řádkem)
                </label>
                <textarea
                  rows={2}
                  value={form.targetCities}
                  onChange={(e) => setForm((f) => ({ ...f, targetCities: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="Praha, Brno, Ostrava"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-zinc-500">
                  Ruční telefonní čísla
                </label>
                <textarea
                  rows={2}
                  value={form.manualPhones}
                  onChange={(e) => setForm((f) => ({ ...f, manualPhones: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  placeholder="+420123456789"
                />
              </div>

              <div>
                <label className="text-xs font-semibold uppercase text-zinc-500">
                  Import čísel CSV
                </label>
                <textarea
                  rows={3}
                  value={form.csvText}
                  onChange={(e) => setForm((f) => ({ ...f, csvText: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-xs"
                  placeholder="telefon&#10;+420111222333&#10;+420444555666"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void onPreview()}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800"
            >
              Náhled
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {creating ? 'Ukládám…' : 'Vytvořit kampaň'}
            </button>
          </div>
        </form>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Kampaně</h2>
          {!campaigns.length ? (
            <p className="mt-3 text-sm text-zinc-500">Zatím žádné kampaně.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-xs uppercase text-zinc-500">
                    <th className="px-2 py-2">Název</th>
                    <th className="px-2 py-2">Typ</th>
                    <th className="px-2 py-2">Stav</th>
                    <th className="px-2 py-2">Odesláno</th>
                    <th className="px-2 py-2">Akce</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-zinc-50">
                      <td className="px-2 py-3 font-medium">{c.name}</td>
                      <td className="px-2 py-3">
                        {WHATSAPP_CAMPAIGN_TYPE_LABELS[c.campaignType] ?? c.campaignType}
                      </td>
                      <td className="px-2 py-3">{c.status}</td>
                      <td className="px-2 py-3">
                        {c.sentCount}/{c.recipientCount}
                        {c.failedCount > 0 ? ` (${c.failedCount} chyb)` : ''}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={busyId === c.id || c.status === 'SENDING'}
                            onClick={() => void onTest(c)}
                            className="rounded border border-zinc-200 px-2 py-1 text-xs font-semibold"
                          >
                            Test
                          </button>
                          <button
                            type="button"
                            disabled={busyId === c.id || c.status === 'SENDING'}
                            onClick={() => void onRun(c)}
                            className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800"
                          >
                            Spustit
                          </button>
                          <button
                            type="button"
                            disabled={busyId === c.id || c.status === 'SENDING'}
                            onClick={() => void onDelete(c)}
                            className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                          >
                            Smazat
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">Historie odeslání</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Respektuje opt-out marketingu uživatelů a loguje souhlas při odeslání.
          </p>
          {!history.length ? (
            <p className="mt-3 text-sm text-zinc-500">Zatím žádné záznamy.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-xs uppercase text-zinc-500">
                    <th className="px-2 py-2">Datum</th>
                    <th className="px-2 py-2">Příjemce</th>
                    <th className="px-2 py-2">Telefon</th>
                    <th className="px-2 py-2">Typ</th>
                    <th className="px-2 py-2">Stav</th>
                    <th className="px-2 py-2">Chyba</th>
                    <th className="px-2 py-2">Text</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-zinc-50 align-top">
                      <td className="whitespace-nowrap px-2 py-2 text-xs text-zinc-500">
                        {new Date(h.createdAt).toLocaleString('cs-CZ')}
                      </td>
                      <td className="px-2 py-2">{h.recipientName || '—'}</td>
                      <td className="px-2 py-2 font-mono text-xs">{h.recipientPhone}</td>
                      <td className="px-2 py-2 text-xs">
                        {h.isWelcome
                          ? 'Uvítací'
                          : h.campaignType
                            ? (WHATSAPP_CAMPAIGN_TYPE_LABELS[h.campaignType] ?? h.campaignType)
                            : (h.campaignName ?? '—')}
                      </td>
                      <td className="px-2 py-2">{h.status}</td>
                      <td className="max-w-[120px] truncate px-2 py-2 text-xs text-red-600">
                        {h.errorMessage || '—'}
                      </td>
                      <td className="max-w-xs truncate px-2 py-2 text-xs text-zinc-600">
                        {h.message}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
