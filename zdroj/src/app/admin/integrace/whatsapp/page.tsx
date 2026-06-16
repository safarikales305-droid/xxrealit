'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminWhatsAppMarketingStats,
  nestAdminWhatsAppSettingsGet,
  nestAdminWhatsAppSettingsPatch,
  nestAdminWhatsAppTestSend,
  WELCOME_ROLE_LABELS,
  WELCOME_ROLES,
  type WhatsAppAdminStats,
  type WhatsAppIntegrationSettings,
} from '@/lib/whatsapp-admin-api';

const emptySettings: WhatsAppIntegrationSettings = {
  enabled: false,
  phoneNumberId: '',
  businessAccountId: '',
  testPhone: '',
  welcomeEnabled: false,
  welcomeTemplates: {},
  batchSize: 20,
  batchDelayMs: 1000,
  accessTokenSet: false,
  webhookVerifyTokenSet: false,
};

export default function AdminWhatsAppIntegrationPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [stats, setStats] = useState<WhatsAppAdminStats | null>(null);
  const [settings, setSettings] = useState<WhatsAppIntegrationSettings>(emptySettings);
  const [accessToken, setAccessToken] = useState('');
  const [webhookVerifyToken, setWebhookVerifyToken] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const [statsData, settingsData] = await Promise.all([
      nestAdminWhatsAppMarketingStats(token),
      nestAdminWhatsAppSettingsGet(token),
    ]);
    if (!statsData || !settingsData) {
      setLoadError('Nepodařilo se načíst WhatsApp integraci.');
      return;
    }
    setStats(statsData);
    setSettings(settingsData);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setStatusMsg(null);
    const patch: Record<string, unknown> = {
      enabled: settings.enabled,
      phoneNumberId: settings.phoneNumberId,
      businessAccountId: settings.businessAccountId,
      testPhone: settings.testPhone,
      welcomeEnabled: settings.welcomeEnabled,
      welcomeTemplates: settings.welcomeTemplates,
      batchSize: settings.batchSize,
      batchDelayMs: settings.batchDelayMs,
    };
    if (accessToken.trim()) patch.accessToken = accessToken.trim();
    if (webhookVerifyToken.trim()) patch.webhookVerifyToken = webhookVerifyToken.trim();

    const r = await nestAdminWhatsAppSettingsPatch(token, patch);
    setSaving(false);
    if (!r.ok) {
      setStatusMsg(r.error);
      return;
    }
    setSettings(r.data);
    setAccessToken('');
    setWebhookVerifyToken('');
    setStatusMsg('Nastavení uloženo.');
    void refresh();
  }

  async function onTestSend() {
    if (!token) return;
    setTesting(true);
    setStatusMsg(null);
    const r = await nestAdminWhatsAppTestSend(token, settings.testPhone);
    setTesting(false);
    setStatusMsg(r.ok ? 'Testovací zpráva odeslána.' : r.error);
  }

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  const configured = stats?.configured ?? false;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Integrace
            </p>
            <h1 className="text-xl font-bold text-zinc-900">WhatsApp</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Cloud API, uvítací zprávy a marketingové kampaně.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/marketing/whatsapp-kampane"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"
            >
              WhatsApp kampaně →
            </Link>
            <Link
              href="/admin"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"
            >
              ← Administrace
            </Link>
          </div>
        </div>

        {loadError ? <p className="text-sm text-red-600">{loadError}</p> : null}
        {statusMsg ? (
          <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">
            {statusMsg}
          </p>
        ) : null}

        <form onSubmit={(e) => void onSave(e)} className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">WhatsApp nastavení</h2>
            <label className="mt-4 flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(e) => setSettings((s) => ({ ...s, enabled: e.target.checked }))}
              />
              WhatsApp zapnuto
            </label>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-zinc-500">Access token</label>
                <input
                  type="password"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  placeholder={settings.accessTokenSet ? '•••••••• (nastaveno — zadejte pro změnu)' : 'WHATSAPP_ACCESS_TOKEN'}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Phone Number ID</label>
                <input
                  value={settings.phoneNumberId}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, phoneNumberId: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Business Account ID</label>
                <input
                  value={settings.businessAccountId}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, businessAccountId: e.target.value }))
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Webhook verify token</label>
                <input
                  type="password"
                  value={webhookVerifyToken}
                  onChange={(e) => setWebhookVerifyToken(e.target.value)}
                  placeholder={
                    settings.webhookVerifyTokenSet
                      ? '•••••••• (nastaveno)'
                      : 'WHATSAPP_WEBHOOK_VERIFY_TOKEN'
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Testovací telefonní číslo</label>
                <input
                  value={settings.testPhone}
                  onChange={(e) => setSettings((s) => ({ ...s, testPhone: e.target.value }))}
                  placeholder="+420123456789"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-zinc-500">Velikost dávky</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={settings.batchSize}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        batchSize: Number(e.target.value) || 20,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Pauza mezi dávkami (ms)</label>
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    value={settings.batchDelayMs}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        batchDelayMs: Number(e.target.value) || 1000,
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Ukládám…' : 'Uložit nastavení'}
              </button>
              <button
                type="button"
                disabled={testing}
                onClick={() => void onTestSend()}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
              >
                {testing ? 'Odesílám…' : 'Odeslat testovací zprávu'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Automatická uvítací zpráva</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Po registraci s telefonem. Proměnné: {'{jmeno}'}, {'{role}'}, {'{odkaz}'}, {'{kredit}'}
            </p>
            <label className="mt-3 flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={settings.welcomeEnabled}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, welcomeEnabled: e.target.checked }))
                }
              />
              Automaticky poslat uvítací zprávu
            </label>
            <div className="mt-4 space-y-3">
              {WELCOME_ROLES.map((role) => (
                <div key={role}>
                  <label className="text-xs font-medium text-zinc-500">
                    {WELCOME_ROLE_LABELS[role] ?? role}
                  </label>
                  <textarea
                    rows={2}
                    value={settings.welcomeTemplates[role] ?? ''}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        welcomeTemplates: {
                          ...s.welcomeTemplates,
                          [role]: e.target.value,
                        },
                      }))
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        </form>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Cloud API — stav
          </p>
          <p
            className={`mt-2 text-lg font-bold ${configured && settings.enabled ? 'text-emerald-700' : 'text-amber-700'}`}
          >
            {configured && settings.enabled
              ? 'Nakonfigurováno a zapnuto'
              : settings.enabled
                ? 'Zapnuto — chybí konfigurace'
                : 'Vypnuto v administraci'}
          </p>
          {!configured && stats?.missing?.length ? (
            <ul className="mt-3 list-disc pl-5 text-sm text-zinc-700">
              {stats.missing.map((key) => (
                <li key={key}>
                  <code className="rounded bg-zinc-100 px-1 text-xs">{key}</code>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-3 text-sm text-zinc-600">
            Webhook:{' '}
            <span className="break-all font-mono text-xs">{stats?.webhookUri ?? '—'}</span>
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-zinc-500">Záznamy zpráv</p>
              <p className="text-2xl font-bold">{stats?.messageCount ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-zinc-500">Kliknutí wa.me</p>
              <p className="text-2xl font-bold">{stats?.clickCount ?? '—'}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
