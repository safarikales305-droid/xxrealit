'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  formatWhatsAppMetaError,
  nestAdminWhatsAppDiagnostics,
  nestAdminWhatsAppLastLog,
  nestAdminWhatsAppMarketingStats,
  nestAdminWhatsAppSettingsGet,
  nestAdminWhatsAppSettingsPatch,
  nestAdminWhatsAppTestSend,
  nestAdminWhatsAppTestPostAuthorNotification,
  nestAdminWhatsAppTestNewPostNotification,
  nestAdminWhatsAppTestVerifySystemTemplate,
  nestAdminWhatsAppTestWelcomeSystemTemplate,
  nestAdminWhatsAppSystemTemplatesGet,
  nestAdminWhatsAppSystemTemplatesSave,
  nestAdminWhatsAppTemplatesSync,
  formatSystemTemplateOptionLabel,
  extractSystemTemplatesFromSettings,
  enrichSystemTemplatesPayload,
  hydrateSystemTemplateIds,
  isSystemTemplateSlotSaved,
  isVerifySystemTemplateSaved,
  logLoadedSystemTemplates,
  logSavedSystemTemplates,
  type WhatsAppSystemTemplatesSettings,
  nestAdminWhatsAppTemplatesList,
  nestAdminWhatsAppVerifyPhone,
  nestAdminWhatsAppVerifyWaba,
  nestAdminWhatsAppWabaPhoneNumbers,
  WELCOME_ROLE_LABELS,
  WELCOME_ROLES,
  WHATSAPP_PHONE_WABA_MISMATCH_MSG,
  WHATSAPP_WABA_ID_HELP,
  type WhatsAppAdminStats,
  type WhatsAppDiagnosticsResult,
  type WhatsAppIntegrationSettings,
  type WhatsAppLastLog,
  type WhatsAppPhoneVerifyResult,
  type WhatsAppWabaPhoneNumberRow,
  type WhatsAppWabaVerifyResult,
  type WhatsAppMetaTemplateRow,
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
  postNotifyAuthorEnabled: false,
  postNotifyFollowersEnabled: false,
  postUploadedAuthorMetaTemplateId: '',
  postUploadedTemplateName: '',
  postUploadedTemplateLanguage: '',
  newPostNotificationMetaTemplateId: '',
  newPostTemplateName: '',
  newPostTemplateLanguage: '',
  whatsappVerifyMetaTemplateId: '',
  whatsappVerifyTemplateName: '',
  whatsappVerifyTemplateLanguage: '',
  welcomeMetaTemplateId: '',
  welcomeTemplateName: '',
  welcomeTemplateLanguage: '',
  accessTokenSet: false,
  webhookVerifyTokenSet: false,
  metaAppId: '',
  metaBusinessId: '',
  effectivePhoneNumberId: '',
  effectiveWabaId: '',
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
  const [statusIsError, setStatusIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastLog, setLastLog] = useState<WhatsAppLastLog | null>(null);
  const [showLastLog, setShowLastLog] = useState(false);
  const [loadingLastLog, setLoadingLastLog] = useState(false);
  const [verifyingWaba, setVerifyingWaba] = useState(false);
  const [verifyingPhone, setVerifyingPhone] = useState(false);
  const [wabaVerify, setWabaVerify] = useState<WhatsAppWabaVerifyResult | null>(null);
  const [phoneVerify, setPhoneVerify] = useState<WhatsAppPhoneVerifyResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<WhatsAppDiagnosticsResult | null>(null);
  const [loadingDiagnostics, setLoadingDiagnostics] = useState(false);
  const [loadingWabaPhones, setLoadingWabaPhones] = useState(false);
  const [wabaPhones, setWabaPhones] = useState<WhatsAppWabaPhoneNumberRow[]>([]);
  const [selectedWabaPhoneId, setSelectedWabaPhoneId] = useState('');
  const [waTemplates, setWaTemplates] = useState<WhatsAppMetaTemplateRow[]>([]);
  const [testingPostAuthor, setTestingPostAuthor] = useState(false);
  const [testingPostFollower, setTestingPostFollower] = useState(false);
  const [testingVerify, setTestingVerify] = useState(false);
  const [testingWelcome, setTestingWelcome] = useState(false);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [savingSystemTemplates, setSavingSystemTemplates] = useState(false);
  const [savedSystemTemplates, setSavedSystemTemplates] =
    useState<WhatsAppSystemTemplatesSettings | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  function pickSystemTemplate(
    metaIdKey: keyof WhatsAppIntegrationSettings,
    nameKey: keyof WhatsAppIntegrationSettings,
    langKey: keyof WhatsAppIntegrationSettings,
    templateId: string,
  ) {
    const t = waTemplates.find((row) => row.id === templateId);
    setSettings((s) => ({
      ...s,
      [metaIdKey]: templateId,
      [nameKey]: t?.templateName ?? '',
      [langKey]: t?.language ?? '',
    }));
  }

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const [statsData, settingsData, templatesData, systemData] = await Promise.all([
      nestAdminWhatsAppMarketingStats(token),
      nestAdminWhatsAppSettingsGet(token),
      nestAdminWhatsAppTemplatesList(token, true),
      nestAdminWhatsAppSystemTemplatesGet(token),
    ]);
    if (!statsData || !settingsData) {
      setLoadError('Nepodařilo se načíst WhatsApp integraci.');
      return;
    }
    const templates = templatesData?.templates?.filter((t) => t.isUsable) ?? [];
    setStats(statsData);
    setWaTemplates(templates);

    const baseSaved = systemData ?? extractSystemTemplatesFromSettings(settingsData);
    const hydrated = hydrateSystemTemplateIds(baseSaved, templates);
    logLoadedSystemTemplates(hydrated);
    setSavedSystemTemplates(hydrated);
    setSettings({ ...settingsData, ...hydrated });
  }, [token]);

  const loadDiagnostics = useCallback(async () => {
    if (!token) return;
    setLoadingDiagnostics(true);
    const d = await nestAdminWhatsAppDiagnostics(token);
    setDiagnostics(d);
    if (d?.wabaPhoneNumbers?.length) {
      setWabaPhones(d.wabaPhoneNumbers);
      const current = d.configuredPhoneNumberId;
      const match = d.wabaPhoneNumbers.find((p) => p.id === current);
      setSelectedWabaPhoneId(match?.id ?? d.wabaPhoneNumbers[0]?.id ?? '');
    }
    setLoadingDiagnostics(false);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void loadDiagnostics();
  }, [token, user?.role, loadDiagnostics]);

  async function onLoadWabaPhones() {
    if (!token) return;
    setLoadingWabaPhones(true);
    setStatusMsg(null);
    setStatusIsError(false);
    const r = await nestAdminWhatsAppWabaPhoneNumbers(token, settings.businessAccountId);
    setLoadingWabaPhones(false);
    if (!r) {
      setStatusIsError(true);
      setStatusMsg('Nepodařilo se načíst telefonní čísla z Meta.');
      return;
    }
    if (!r.ok) {
      setStatusIsError(true);
      setStatusMsg(r.error ?? 'Meta API vrátilo chybu.');
      return;
    }
    setWabaPhones(r.phoneNumbers);
    const current = settings.phoneNumberId;
    const match = r.phoneNumbers.find((p) => p.id === current);
    setSelectedWabaPhoneId(match?.id ?? r.phoneNumbers[0]?.id ?? '');
    setStatusIsError(false);
    setStatusMsg(`Načteno ${r.phoneNumbers.length} čísel z WABA ${r.wabaId}.`);
    void loadDiagnostics();
  }

  function onApplyWabaPhone() {
    if (!selectedWabaPhoneId) return;
    const picked = wabaPhones.find((p) => p.id === selectedWabaPhoneId);
    setSettings((s) => ({ ...s, phoneNumberId: selectedWabaPhoneId }));
    setStatusIsError(false);
    setStatusMsg(
      picked
        ? `Phone Number ID nastaveno na ${picked.display_phone_number} (${picked.id}). Uložte nastavení.`
        : `Phone Number ID nastaveno. Uložte nastavení.`,
    );
  }

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
      postNotifyAuthorEnabled: settings.postNotifyAuthorEnabled,
      postNotifyFollowersEnabled: settings.postNotifyFollowersEnabled,
    };
    if (accessToken.trim()) patch.accessToken = accessToken.trim();
    if (webhookVerifyToken.trim()) patch.webhookVerifyToken = webhookVerifyToken.trim();

    const r = await nestAdminWhatsAppSettingsPatch(token, patch);
    setSaving(false);
    if (!r.ok) {
      setStatusIsError(true);
      setStatusMsg(r.error);
      return;
    }
    setStatusIsError(false);
    setSettings(r.data);
    setAccessToken('');
    setWebhookVerifyToken('');
    setStatusMsg('Nastavení uloženo.');
    void refresh();
    void loadDiagnostics();
  }

  async function onSaveSystemTemplates() {
    if (!token) return;
    setSavingSystemTemplates(true);
    setStatusMsg(null);
    setStatusIsError(false);
    const payload = enrichSystemTemplatesPayload(settings, waTemplates);
    const r = await nestAdminWhatsAppSystemTemplatesSave(token, payload);
    setSavingSystemTemplates(false);
    if (!r.ok) {
      setStatusIsError(true);
      setStatusMsg(r.error);
      return;
    }
    logSavedSystemTemplates(r.data);
    setSavedSystemTemplates(r.data);
    const hydratedForSelect = hydrateSystemTemplateIds(r.data, waTemplates);
    setSettings((s) => ({ ...s, ...hydratedForSelect }));
    setToastMsg('Systémové WhatsApp šablony byly uloženy.');
    window.setTimeout(() => setToastMsg(null), 4000);
  }

  async function onTestSend() {
    if (!token) return;
    setTesting(true);
    setStatusMsg(null);
    setStatusIsError(false);
    const r = await nestAdminWhatsAppTestSend(token, settings.testPhone);
    setTesting(false);
    if (!r.ok) {
      setStatusIsError(true);
      setStatusMsg(formatWhatsAppMetaError(r.error));
      return;
    }
    setStatusIsError(false);
    const idNote = r.phoneNumberId ? ` (phoneNumberId: ${r.phoneNumberId})` : '';
    setStatusMsg(`Testovací zpráva odeslána na ${r.toPhone ?? settings.testPhone}${idNote}.`);
  }

  async function onVerifyWaba() {
    if (!token) return;
    setVerifyingWaba(true);
    setStatusMsg(null);
    setStatusIsError(false);
    const r = await nestAdminWhatsAppVerifyWaba(token);
    setVerifyingWaba(false);
    if (!r.ok) {
      setStatusIsError(true);
      setStatusMsg(r.error);
      setWabaVerify(null);
      return;
    }
    setWabaVerify(r.data);
    if (!r.data.ok) {
      setStatusIsError(true);
      setStatusMsg(r.data.error ?? 'Ověření WABA selhalo.');
      return;
    }
    setStatusIsError(false);
    setStatusMsg(`WABA ověřeno: ${r.data.name ?? r.data.id}`);
  }

  async function onVerifyPhone() {
    if (!token) return;
    setVerifyingPhone(true);
    setStatusMsg(null);
    setStatusIsError(false);
    const r = await nestAdminWhatsAppVerifyPhone(token);
    setVerifyingPhone(false);
    if (!r.ok) {
      setStatusIsError(true);
      setStatusMsg(r.error);
      setPhoneVerify(null);
      return;
    }
    setPhoneVerify(r.data);
    if (!r.data.ok) {
      setStatusIsError(true);
      setStatusMsg(r.data.error ?? 'Ověření telefonu selhalo.');
      return;
    }
    setStatusIsError(false);
    setStatusMsg(
      `Telefon ověřen: ${r.data.display_phone_number ?? r.data.id} (${r.data.verified_name ?? '—'})`,
    );
  }

  async function onShowLastLog() {
    if (!token) return;
    setLoadingLastLog(true);
    const log = await nestAdminWhatsAppLastLog(token);
    setLastLog(log);
    setShowLastLog(true);
    setLoadingLastLog(false);
  }

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  const configured = stats?.configured ?? false;
  const verifyTemplateSaved = isVerifySystemTemplateSaved(savedSystemTemplates);

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
        {toastMsg ? (
          <p className="rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-3 text-sm font-medium text-emerald-900">
            {toastMsg}
          </p>
        ) : null}
        {statusMsg ? (
          <p
            className={`rounded-xl border px-4 py-3 text-sm ${
              statusIsError
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-900'
            }`}
          >
            {statusMsg}
          </p>
        ) : null}

        {showLastLog ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">Poslední WhatsApp log</h2>
              <button
                type="button"
                onClick={() => setShowLastLog(false)}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800"
              >
                Zavřít
              </button>
            </div>
            {!lastLog ? (
              <p className="mt-2 text-sm text-zinc-500">Žádný záznam.</p>
            ) : (
              <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
                {JSON.stringify(lastLog, null, 2)}
              </pre>
            )}
          </div>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-zinc-900">Diagnostika WhatsApp účtu</h2>
            <button
              type="button"
              disabled={loadingDiagnostics}
              onClick={() => void loadDiagnostics()}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-800 disabled:opacity-50"
            >
              {loadingDiagnostics ? 'Načítám…' : 'Obnovit diagnostiku'}
            </button>
          </div>
          {!diagnostics ? (
            <p className="mt-3 text-sm text-zinc-500">Diagnostika se načítá…</p>
          ) : (
            <div className="mt-4 space-y-3 text-sm">
              {diagnostics.mismatchMessage ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                  {diagnostics.mismatchMessage === WHATSAPP_PHONE_WABA_MISMATCH_MSG
                    ? WHATSAPP_PHONE_WABA_MISMATCH_MSG
                    : diagnostics.mismatchMessage}
                </p>
              ) : diagnostics.phoneBelongsToWaba === true ? (
                <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900">
                  Phone Number ID a WABA ID patří ke stejnému WhatsApp účtu.
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">Telefonní číslo</p>
                  <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-800">
                    <li>Phone Number ID: {diagnostics.configuredPhoneNumberId || '—'}</li>
                    <li>
                      Display: {diagnostics.phone.display_phone_number ?? diagnostics.phone.error ?? '—'}
                    </li>
                    <li>Verified name: {diagnostics.phone.verified_name ?? '—'}</li>
                  </ul>
                </div>
                <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-3">
                  <p className="text-xs font-semibold uppercase text-zinc-500">WABA účet</p>
                  <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-800">
                    <li>WABA ID: {diagnostics.configuredWabaId || '—'}</li>
                    <li>Name: {diagnostics.waba.name ?? diagnostics.waba.error ?? '—'}</li>
                    <li>Review: {diagnostics.waba.account_review_status ?? '—'}</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </section>

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
              <div className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm text-blue-950">
                <p className="font-semibold">Identifikátory Meta / WhatsApp</p>
                <p className="mt-1 text-xs text-blue-900">{WHATSAPP_WABA_ID_HELP}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-zinc-500">Meta App ID</label>
                  <input
                    readOnly
                    value={settings.metaAppId || '— (env FACEBOOK_APP_ID)'}
                    className="mt-1 w-full rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-600"
                  />
                  <p className="mt-1 text-xs text-zinc-400">Nepoužívat jako WABA ID.</p>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Meta Business ID</label>
                  <input
                    readOnly
                    value={settings.metaBusinessId || '— (env META_BUSINESS_ID)'}
                    className="mt-1 w-full rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm text-zinc-600"
                  />
                  <p className="mt-1 text-xs text-zinc-400">Nepoužívat jako WABA ID.</p>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500">
                  WhatsApp Phone Number ID
                </label>
                <input
                  value={settings.phoneNumberId}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, phoneNumberId: e.target.value }))
                  }
                  placeholder="např. 1216523268204671"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                />
                {settings.effectivePhoneNumberId &&
                settings.effectivePhoneNumberId !== settings.phoneNumberId ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Efektivně použito z env: {settings.effectivePhoneNumberId}
                  </p>
                ) : null}
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">
                  WhatsApp Business Account ID (WABA ID)
                </label>
                <input
                  value={settings.businessAccountId}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, businessAccountId: e.target.value }))
                  }
                  placeholder="např. 1999053167383871 (produkční XXrealit)"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                />
                {settings.effectiveWabaId &&
                settings.effectiveWabaId !== settings.businessAccountId ? (
                  <p className="mt-1 text-xs text-amber-700">
                    Efektivně použito z env: {settings.effectiveWabaId}
                  </p>
                ) : null}
              </div>

              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase text-zinc-600">
                    Čísla ve WABA účtu
                  </p>
                  <button
                    type="button"
                    disabled={loadingWabaPhones}
                    onClick={() => void onLoadWabaPhones()}
                    className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 disabled:opacity-50"
                  >
                    {loadingWabaPhones ? 'Načítám…' : 'Načíst telefonní čísla z Meta'}
                  </button>
                </div>
                {wabaPhones.length === 0 ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Po vyplnění WABA ID načtěte čísla z Meta a vyberte produkční Phone Number ID
                    (+420774655469).
                  </p>
                ) : (
                  <div className="mt-3 space-y-2">
                    <select
                      value={selectedWabaPhoneId}
                      onChange={(e) => setSelectedWabaPhoneId(e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-mono"
                    >
                      {wabaPhones.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.display_phone_number} — {p.verified_name || '—'} ({p.id})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedWabaPhoneId}
                      onClick={onApplyWabaPhone}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-800 disabled:opacity-50"
                    >
                      Použít vybrané Phone Number ID
                    </button>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={verifyingWaba}
                  onClick={() => void onVerifyWaba()}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
                >
                  {verifyingWaba ? 'Ověřuji…' : 'Ověřit WhatsApp účet'}
                </button>
                <button
                  type="button"
                  disabled={verifyingPhone}
                  onClick={() => void onVerifyPhone()}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
                >
                  {verifyingPhone ? 'Ověřuji…' : 'Ověřit telefonní číslo'}
                </button>
              </div>

              {wabaVerify?.ok ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase text-emerald-800">WABA účet</p>
                  <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-800">
                    <li>id: {wabaVerify.id}</li>
                    <li>name: {wabaVerify.name}</li>
                    <li>account_review_status: {wabaVerify.account_review_status}</li>
                    <li>message_template_namespace: {wabaVerify.message_template_namespace}</li>
                  </ul>
                </div>
              ) : null}

              {phoneVerify?.ok ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase text-emerald-800">Telefonní číslo</p>
                  <ul className="mt-2 space-y-1 font-mono text-xs text-zinc-800">
                    <li>id: {phoneVerify.id}</li>
                    <li>display_phone_number: {phoneVerify.display_phone_number}</li>
                    <li>verified_name: {phoneVerify.verified_name}</li>
                    <li>quality_rating: {phoneVerify.quality_rating}</li>
                  </ul>
                </div>
              ) : null}

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
              <button
                type="button"
                disabled={loadingLastLog}
                onClick={() => void onShowLastLog()}
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
              >
                {loadingLastLog ? 'Načítám…' : 'Zobrazit poslední WhatsApp log'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Systémové WhatsApp šablony</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Schválené šablony z aktivního WABA. Ověření telefonu vyžaduje schválenou
                  šablonu s 1 proměnnou.
                </p>
              </div>
              <button
                type="button"
                disabled={syncingTemplates || !token}
                onClick={() => {
                  void (async () => {
                    if (!token) return;
                    setSyncingTemplates(true);
                    setStatusMsg(null);
                    setStatusIsError(false);
                    const r = await nestAdminWhatsAppTemplatesSync(token);
                    setSyncingTemplates(false);
                    if (!r.ok) {
                      setStatusIsError(true);
                      setStatusMsg(r.error ?? 'Synchronizace selhala.');
                      return;
                    }
                    setStatusIsError(false);
                    setStatusMsg(
                      `Synchronizováno ${r.data.syncedCount} šablon (${r.data.usableCount} použitelných).`,
                    );
                    void refresh();
                  })();
                }}
                className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 disabled:opacity-50"
              >
                {syncingTemplates ? 'Synchronizuji…' : 'Synchronizovat šablony z Meta'}
              </button>
            </div>

            <div className="mt-4 grid gap-5 md:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-zinc-700">
                  Ověření telefonního čísla
                </label>
                <select
                  value={settings.whatsappVerifyMetaTemplateId}
                  onChange={(e) =>
                    pickSystemTemplate(
                      'whatsappVerifyMetaTemplateId',
                      'whatsappVerifyTemplateName',
                      'whatsappVerifyTemplateLanguage',
                      e.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">— vyberte šablonu —</option>
                  {waTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {formatSystemTemplateOptionLabel(t)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 font-mono text-[10px] text-zinc-500">
                  Uloženo ověření:{' '}
                  {savedSystemTemplates?.whatsappVerifyTemplateName?.trim() || '—'} +{' '}
                  {savedSystemTemplates?.whatsappVerifyTemplateLanguage?.trim() || '—'}
                </p>
                {verifyTemplateSaved ? (
                  <p className="mt-1 text-[11px] text-emerald-700">
                    Uloženo: {savedSystemTemplates!.whatsappVerifyTemplateName} (
                    {savedSystemTemplates!.whatsappVerifyTemplateLanguage})
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-amber-700">
                    Nejprve uložte šablonu pro ověření telefonního čísla.
                  </p>
                )}
                <button
                  type="button"
                  disabled={testingVerify || !verifyTemplateSaved}
                  title={!verifyTemplateSaved ? 'Nejprve uložte systémové šablony' : undefined}
                  onClick={() => {
                    void (async () => {
                      if (!token) return;
                      setTestingVerify(true);
                      setStatusMsg(null);
                      const r = await nestAdminWhatsAppTestVerifySystemTemplate(
                        token,
                        settings.testPhone,
                      );
                      setTestingVerify(false);
                      setStatusIsError(!r.ok);
                      setStatusMsg(
                        r.ok ? 'Test ověření telefonu odeslán.' : (r.error ?? 'Test selhal.'),
                      );
                    })();
                  }}
                  className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50"
                >
                  {testingVerify ? 'Odesílám…' : 'Test systémové šablony'}
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">
                  Uvítací zpráva po registraci
                </label>
                <select
                  value={settings.welcomeMetaTemplateId}
                  onChange={(e) =>
                    pickSystemTemplate(
                      'welcomeMetaTemplateId',
                      'welcomeTemplateName',
                      'welcomeTemplateLanguage',
                      e.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">— vyberte šablonu —</option>
                  {waTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {formatSystemTemplateOptionLabel(t)}
                    </option>
                  ))}
                </select>
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-700">
                  <input
                    type="checkbox"
                    checked={settings.welcomeEnabled}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, welcomeEnabled: e.target.checked }))
                    }
                  />
                  Automaticky poslat po registraci
                </label>
                <button
                  type="button"
                  disabled={
                    testingWelcome ||
                    !isSystemTemplateSlotSaved(
                      savedSystemTemplates,
                      'welcomeTemplateName',
                      'welcomeTemplateLanguage',
                    )
                  }
                  title={
                    !isSystemTemplateSlotSaved(
                      savedSystemTemplates,
                      'welcomeTemplateName',
                      'welcomeTemplateLanguage',
                    )
                      ? 'Nejprve uložte systémové šablony'
                      : undefined
                  }
                  onClick={() => {
                    void (async () => {
                      if (!token) return;
                      setTestingWelcome(true);
                      setStatusMsg(null);
                      const r = await nestAdminWhatsAppTestWelcomeSystemTemplate(
                        token,
                        settings.testPhone,
                      );
                      setTestingWelcome(false);
                      setStatusIsError(!r.ok);
                      setStatusMsg(
                        r.ok ? 'Test uvítací šablony odeslán.' : (r.error ?? 'Test selhal.'),
                      );
                    })();
                  }}
                  className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50"
                >
                  {testingWelcome ? 'Odesílám…' : 'Test systémové šablony'}
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">
                  Potvrzení nahrání příspěvku autorovi
                </label>
                <select
                  value={settings.postUploadedAuthorMetaTemplateId}
                  onChange={(e) =>
                    pickSystemTemplate(
                      'postUploadedAuthorMetaTemplateId',
                      'postUploadedTemplateName',
                      'postUploadedTemplateLanguage',
                      e.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">— vyberte šablonu —</option>
                  {waTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {formatSystemTemplateOptionLabel(t)}
                    </option>
                  ))}
                </select>
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-700">
                  <input
                    type="checkbox"
                    checked={settings.postNotifyAuthorEnabled}
                    onChange={(e) =>
                      setSettings((s) => ({ ...s, postNotifyAuthorEnabled: e.target.checked }))
                    }
                  />
                  Zapnout upozornění autorovi
                </label>
                <button
                  type="button"
                  disabled={
                    testingPostAuthor ||
                    !isSystemTemplateSlotSaved(
                      savedSystemTemplates,
                      'postUploadedTemplateName',
                      'postUploadedTemplateLanguage',
                    )
                  }
                  title={
                    !isSystemTemplateSlotSaved(
                      savedSystemTemplates,
                      'postUploadedTemplateName',
                      'postUploadedTemplateLanguage',
                    )
                      ? 'Nejprve uložte systémové šablony'
                      : undefined
                  }
                  onClick={() => {
                    void (async () => {
                      if (!token) return;
                      setTestingPostAuthor(true);
                      setStatusMsg(null);
                      const r = await nestAdminWhatsAppTestPostAuthorNotification(
                        token,
                        settings.testPhone,
                      );
                      setTestingPostAuthor(false);
                      setStatusIsError(!r.ok);
                      setStatusMsg(
                        r.ok ? 'Test upozornění autorovi odeslán.' : (r.error ?? 'Test selhal.'),
                      );
                    })();
                  }}
                  className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50"
                >
                  {testingPostAuthor ? 'Odesílám…' : 'Test systémové šablony'}
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700">
                  Upozornění na nový příspěvek
                </label>
                <select
                  value={settings.newPostNotificationMetaTemplateId}
                  onChange={(e) =>
                    pickSystemTemplate(
                      'newPostNotificationMetaTemplateId',
                      'newPostTemplateName',
                      'newPostTemplateLanguage',
                      e.target.value,
                    )
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">— vyberte šablonu —</option>
                  {waTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {formatSystemTemplateOptionLabel(t)}
                    </option>
                  ))}
                </select>
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-700">
                  <input
                    type="checkbox"
                    checked={settings.postNotifyFollowersEnabled}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        postNotifyFollowersEnabled: e.target.checked,
                      }))
                    }
                  />
                  Zapnout upozornění sledujícím
                </label>
                <button
                  type="button"
                  disabled={
                    testingPostFollower ||
                    !isSystemTemplateSlotSaved(
                      savedSystemTemplates,
                      'newPostTemplateName',
                      'newPostTemplateLanguage',
                    )
                  }
                  title={
                    !isSystemTemplateSlotSaved(
                      savedSystemTemplates,
                      'newPostTemplateName',
                      'newPostTemplateLanguage',
                    )
                      ? 'Nejprve uložte systémové šablony'
                      : undefined
                  }
                  onClick={() => {
                    void (async () => {
                      if (!token) return;
                      setTestingPostFollower(true);
                      setStatusMsg(null);
                      const r = await nestAdminWhatsAppTestNewPostNotification(
                        token,
                        settings.testPhone,
                      );
                      setTestingPostFollower(false);
                      setStatusIsError(!r.ok);
                      setStatusMsg(
                        r.ok
                          ? 'Test upozornění na nový příspěvek odeslán.'
                          : (r.error ?? 'Test selhal.'),
                      );
                    })();
                  }}
                  className="mt-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 disabled:opacity-50"
                >
                  {testingPostFollower ? 'Odesílám…' : 'Test systémové šablony'}
                </button>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-zinc-100 pt-4">
              <button
                type="button"
                disabled={savingSystemTemplates || !token}
                onClick={() => void onSaveSystemTemplates()}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {savingSystemTemplates ? 'Ukládám…' : '💾 Uložit systémové šablony'}
              </button>
              <p className="text-xs text-zinc-500">
                Testovací tlačítka jsou aktivní až po uložení příslušné šablony.
              </p>
            </div>

            <details className="mt-5 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                Záložní textové uvítací šablony (použijí se, pokud není vybrána Meta šablona)
              </summary>
              <div className="mt-3 space-y-3">
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
            </details>
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
