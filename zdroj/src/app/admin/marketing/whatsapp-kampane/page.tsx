'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import {
  CZECH_REGIONS,
  formatWhatsAppMetaError,
  nestAdminWhatsAppCampaignCreate,
  nestAdminWhatsAppCampaignDelete,
  nestAdminWhatsAppCampaignLogs,
  nestAdminWhatsAppCampaignLastError,
  nestAdminWhatsAppCampaignPreview,
  nestAdminWhatsAppCampaignRun,
  nestAdminWhatsAppCampaignUploadImage,
  nestAdminWhatsAppCampaignsList,
  nestAdminWhatsAppCampaignTest,
  nestAdminWhatsAppCampaignDebugLastError,
  nestAdminWhatsAppHistory,
  nestAdminWhatsAppTemplatesList,
  nestAdminWhatsAppTemplatesSync,
  nestAdminWhatsAppTemplatesSyncLastRaw,
  nestAdminWhatsAppTemplatesCleanup,
  type WhatsAppTemplateSyncSummaryRow,
  type WhatsAppTemplateSyncDebug,
  parsePhonesFromCsv,
  WHATSAPP_CAMPAIGN_TYPE_LABELS,
  WHATSAPP_CAMPAIGN_TEMPLATE_HELP,
  WHATSAPP_HEADER_IMAGE_REQUIRED_MSG,
  WHATSAPP_NO_APPROVED_TEMPLATES_MSG,
  WHATSAPP_TARGET_ROLES,
  WHATSAPP_TEMPLATE_REQUIRED_MSG,
  WHATSAPP_WABA_ID_HELP,
  WHATSAPP_WRONG_WABA_WARNING,
  type WhatsAppCampaignLogRow,
  type WhatsAppCampaignRow,
  type WhatsAppCampaignPreviewResult,
  type WhatsAppCampaignType,
  type WhatsAppHistoryRow,
  type WhatsAppMetaTemplateRow,
} from '@/lib/whatsapp-admin-api';

const emptyForm = {
  name: '',
  campaignType: 'CUSTOM' as WhatsAppCampaignType,
  waMetaTemplateId: '',
  waTemplateVariables: '{jmeno}\n{odkaz}',
  waHeaderImageUrl: '',
  waHeaderImageMediaId: '',
  messageTemplate:
    'Náhled: Ahoj {jmeno}! Máme pro vás novinku na XXrealit. Váš kredit: {kredit} Kč. {odkaz}',
  targetRoles: [] as string[],
  targetRegions: [] as string[],
  targetCities: '',
  manualPhones: '',
  csvText: '',
};

function templateStatusClass(status: string): string {
  if (status === 'APPROVED') return 'text-emerald-700 bg-emerald-50';
  if (status === 'PENDING') return 'text-amber-700 bg-amber-50';
  if (status === 'REJECTED' || status === 'PAUSED') return 'text-red-700 bg-red-50';
  return 'text-zinc-600 bg-zinc-50';
}

export default function AdminWhatsAppCampaignsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [campaigns, setCampaigns] = useState<WhatsAppCampaignRow[]>([]);
  const [history, setHistory] = useState<WhatsAppHistoryRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [previewDetail, setPreviewDetail] = useState<WhatsAppCampaignPreviewResult | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusIsError, setStatusIsError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [campaignLogs, setCampaignLogs] = useState<WhatsAppCampaignLogRow[] | null>(null);
  const [campaignLogsTitle, setCampaignLogsTitle] = useState<string | null>(null);
  const [loadingLogsId, setLoadingLogsId] = useState<string | null>(null);
  const [loadingLastErrorId, setLoadingLastErrorId] = useState<string | null>(null);
  const [lastMetaError, setLastMetaError] = useState<{
    campaignName: string;
    error: WhatsAppCampaignLogRow;
  } | null>(null);
  const [allTemplates, setAllTemplates] = useState<WhatsAppMetaTemplateRow[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<WhatsAppMetaTemplateRow[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [effectiveWabaId, setEffectiveWabaId] = useState('');
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [lastSyncInfo, setLastSyncInfo] = useState<string | null>(null);
  const [syncingTemplates, setSyncingTemplates] = useState(false);
  const [cleaningTemplates, setCleaningTemplates] = useState(false);
  const [syncSummary, setSyncSummary] = useState<WhatsAppTemplateSyncSummaryRow[]>([]);
  const [syncDebug, setSyncDebug] = useState<WhatsAppTemplateSyncDebug | null>(null);
  const [rawMetaResponse, setRawMetaResponse] = useState<unknown>(null);
  const [loadingRawMeta, setLoadingRawMeta] = useState(false);

  const selectedTemplate = approvedTemplates.find((t) => t.id === form.waMetaTemplateId) ?? null;
  const requiresHeaderImage = selectedTemplate?.headerType === 'IMAGE';

  function hasHeaderImageInput(): boolean {
    return Boolean(form.waHeaderImageUrl.trim() || form.waHeaderImageMediaId.trim());
  }

  function campaignImagePreviewSrc(): string | null {
    const url = form.waHeaderImageUrl.trim();
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return nestAbsoluteAssetUrl(url);
  }

  function statusLabel(status: string): string {
    if (status === 'SENDING') return 'RUNNING';
    return status;
  }

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

  const syncTemplates = useCallback(
    async (silent = false) => {
      if (!token) return;
      setSyncingTemplates(true);
      if (!silent) {
        setStatusMsg(null);
        setStatusIsError(false);
      }
      const r = await nestAdminWhatsAppTemplatesSync(token);
      const [all, approved] = await Promise.all([
        nestAdminWhatsAppTemplatesList(token, false),
        nestAdminWhatsAppTemplatesList(token, true),
      ]);
      if (all) {
        setAllTemplates(all.templates);
        setLastSyncedAt(all.lastSyncedAt);
        setEffectiveWabaId(all.effectiveWabaId);
      }
      if (approved) {
        setApprovedTemplates(approved.templates);
        setForm((f) => {
          if (f.waMetaTemplateId && approved.templates.some((t) => t.id === f.waMetaTemplateId)) {
            return f;
          }
          const pick = approved.templates[0]?.id ?? '';
          return { ...f, waMetaTemplateId: pick };
        });
      }
      setSyncingTemplates(false);
      if (!r.ok) {
        if (!silent) {
          setStatusIsError(true);
          setStatusMsg(r.error);
        }
        return;
      }
      const d = r.data;
      if (d.warning) {
        setSyncWarning(d.warning);
      } else {
        setSyncWarning(null);
      }
      const info = [
        d.wabaId ? `Aktivní WABA: ${d.wabaId}` : null,
        d.syncDebug
          ? `raw=${d.syncDebug.rawCount} normalized=${d.syncDebug.normalizedCount} saved=${d.syncDebug.savedCount} visible=${d.syncDebug.visibleCount}`
          : `načteno=${d.syncedCount} použitelných=${d.usableCount ?? 0}`,
        d.templatesSummary?.length
          ? `stavy: ${d.templatesSummary.map((t) => `${t.name}=${t.rawStatus}${t.saved === false ? ' (NEULOŽENO)' : ''}`).join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');
      setLastSyncInfo(info || null);
      setSyncSummary(d.templatesSummary ?? []);
      setSyncDebug(d.syncDebug ?? null);
      if (!silent) {
        setStatusIsError(Boolean(d.warning));
        const warn = d.warning ? ` ${d.warning}` : '';
        setStatusMsg(
          `Synchronizováno ${d.syncedCount} šablon, použitelných ${d.usableCount ?? 0} z WABA ${d.wabaId ?? effectiveWabaId}.${warn}`,
        );
      }
    },
    [token],
  );

  const cleanupOldTemplates = useCallback(async () => {
    if (!token) return;
    if (!window.confirm('Smazat staré/demo šablony z jiných WABA a zastaralé záznamy?')) return;
    setCleaningTemplates(true);
    setStatusMsg(null);
    setStatusIsError(false);
    const r = await nestAdminWhatsAppTemplatesCleanup(token);
    if (!r.ok) {
      setCleaningTemplates(false);
      setStatusIsError(true);
      setStatusMsg(r.error);
      return;
    }
    await syncTemplates(true);
    setCleaningTemplates(false);
    setStatusMsg(
      `Vyčištěno ${r.data.deletedCount} starých šablon. Aktivní WABA: ${r.data.activeWabaId}.`,
    );
  }, [token, syncTemplates]);

  async function showRawMetaResponse() {
    if (!token) return;
    setLoadingRawMeta(true);
    const data = await nestAdminWhatsAppTemplatesSyncLastRaw(token);
    setLoadingRawMeta(false);
    setRawMetaResponse(data?.raw ?? null);
  }

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  useEffect(() => {
    if (!token || user?.role !== 'ADMIN') return;
    let cancelled = false;
    void (async () => {
      const [all, approved] = await Promise.all([
        nestAdminWhatsAppTemplatesList(token, false),
        nestAdminWhatsAppTemplatesList(token, true),
      ]);
      if (cancelled) return;
      if (all) {
        setAllTemplates(all.templates);
        setLastSyncedAt(all.lastSyncedAt);
        setEffectiveWabaId(all.effectiveWabaId);
      }
      if (approved) {
        setApprovedTemplates(approved.templates);
        if (approved.templates[0]) {
          setForm((f) =>
            f.waMetaTemplateId ? f : { ...f, waMetaTemplateId: approved.templates[0]!.id },
          );
        }
      }
      setSyncingTemplates(true);
      const sync = await nestAdminWhatsAppTemplatesSync(token);
      if (cancelled) return;
      const [allAfter, approvedAfter] = await Promise.all([
        nestAdminWhatsAppTemplatesList(token, false),
        nestAdminWhatsAppTemplatesList(token, true),
      ]);
      if (allAfter) {
        setAllTemplates(allAfter.templates);
        setLastSyncedAt(
          allAfter.lastSyncedAt ?? (sync.ok ? sync.data.syncedAt : null),
        );
        setEffectiveWabaId(allAfter.effectiveWabaId);
      }
      if (approvedAfter) {
        setApprovedTemplates(approvedAfter.templates);
        setForm((f) => {
          if (f.waMetaTemplateId && approvedAfter.templates.some((t) => t.id === f.waMetaTemplateId)) {
            return f;
          }
          return { ...f, waMetaTemplateId: approvedAfter.templates[0]?.id ?? '' };
        });
      }
      if (sync.ok) {
        const d = sync.data;
        setSyncWarning(d.warning ?? null);
        const info = [
          d.wabaId ? `Aktivní WABA: ${d.wabaId}` : null,
          `načteno šablon: ${d.syncedCount}`,
          `použitelných: ${d.usableCount ?? d.approvedCount ?? 0}`,
          d.templatesSummary?.length
            ? `stavy: ${d.templatesSummary.map((t) => `${t.name}=${t.rawStatus}`).join(', ')}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ');
        setLastSyncInfo(info || null);
        setSyncSummary(d.templatesSummary ?? []);
        setSyncDebug(d.syncDebug ?? null);
      }
      setSyncingTemplates(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, user?.role]);

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

  function parseTemplateVariables(): string[] {
    if (selectedTemplate && selectedTemplate.variablesCount <= 0) return [];
    return form.waTemplateVariables
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function buildPayload() {
    const cities = form.targetCities
      .split(/[\n,;]+/)
      .map((c) => c.trim())
      .filter(Boolean);
    return {
      name: form.name.trim(),
      campaignType: form.campaignType,
      waMetaTemplateId: form.waMetaTemplateId.trim(),
      waTemplateVariables: parseTemplateVariables(),
      waHeaderImageUrl: form.waHeaderImageUrl.trim() || undefined,
      waHeaderImageMediaId: form.waHeaderImageMediaId.trim() || undefined,
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
    setStatusIsError(false);
    if (!form.waMetaTemplateId.trim()) {
      setStatusIsError(true);
      setStatusMsg(
        form.messageTemplate.trim()
          ? WHATSAPP_TEMPLATE_REQUIRED_MSG
          : approvedTemplates.length === 0
            ? WHATSAPP_NO_APPROVED_TEMPLATES_MSG
            : 'Vyberte schválenou WhatsApp šablonu.',
      );
      return;
    }
    if (requiresHeaderImage && !hasHeaderImageInput()) {
      setStatusIsError(true);
      setStatusMsg(WHATSAPP_HEADER_IMAGE_REQUIRED_MSG);
      return;
    }
    const p = await nestAdminWhatsAppCampaignPreview(token, buildPayload());
    if (!p) {
      setStatusIsError(true);
      setStatusMsg('Náhled se nepodařil vygenerovat.');
      return;
    }
    setPreviewDetail(p);
  }

  async function onUploadCampaignImage(file: File | null) {
    if (!token || !file) return;
    setUploadingImage(true);
    setStatusMsg(null);
    setStatusIsError(false);
    const r = await nestAdminWhatsAppCampaignUploadImage(token, file);
    setUploadingImage(false);
    if (!r.ok) {
      setStatusIsError(true);
      setStatusMsg(r.error);
      return;
    }
    setForm((f) => ({ ...f, waHeaderImageUrl: r.publicUrl }));
    setStatusMsg('Obrázek kampaně nahrán.');
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!form.name.trim()) {
      setStatusIsError(true);
      setStatusMsg('Vyplňte název kampaně.');
      return;
    }
    if (!form.waMetaTemplateId.trim()) {
      setStatusIsError(true);
      setStatusMsg(
        form.messageTemplate.trim()
          ? WHATSAPP_TEMPLATE_REQUIRED_MSG
          : approvedTemplates.length === 0
            ? WHATSAPP_NO_APPROVED_TEMPLATES_MSG
            : 'Vyberte schválenou WhatsApp šablonu.',
      );
      return;
    }
    if (requiresHeaderImage && !hasHeaderImageInput()) {
      setStatusIsError(true);
      setStatusMsg(WHATSAPP_HEADER_IMAGE_REQUIRED_MSG);
      return;
    }
    setCreating(true);
    setStatusMsg(null);
    setStatusIsError(false);
    const r = await nestAdminWhatsAppCampaignCreate(token, buildPayload());
    setCreating(false);
    if (!r.ok) {
      setStatusIsError(true);
      setStatusMsg(r.error);
      return;
    }
    setForm(emptyForm);
    setPreviewDetail(null);
    setStatusMsg('Kampaň vytvořena.');
    void refresh();
  }

  async function showCampaignActionError(
    action: 'test' | 'run',
    error: { message?: string },
  ) {
    setStatusIsError(true);
    const primary = error.message?.trim();
    if (primary && primary !== 'Internal Server Error') {
      setStatusMsg(primary);
      return;
    }
    if (token) {
      const debug = await nestAdminWhatsAppCampaignDebugLastError(token);
      const last = debug?.error;
      if (last?.message && last.action === action) {
        setStatusMsg(last.message);
        return;
      }
    }
    setStatusMsg(primary || 'Operace selhala.');
  }

  async function onTest(campaign: WhatsAppCampaignRow) {
    if (!token) return;
    setBusyId(campaign.id);
    setStatusMsg(null);
    setStatusIsError(false);
    const r = await nestAdminWhatsAppCampaignTest(token, campaign.id);
    setBusyId(null);
    if (!r.ok) {
      await showCampaignActionError('test', r.error);
    } else {
      setStatusMsg('Test kampaně odeslán přes WhatsApp šablonu.');
    }
    void refresh();
  }

  async function onRun(campaign: WhatsAppCampaignRow) {
    if (!token) return;
    if (!window.confirm(`Opravdu spustit kampaň „${campaign.name}"?`)) return;
    setBusyId(campaign.id);
    setStatusMsg(null);
    setStatusIsError(false);
    const r = await nestAdminWhatsAppCampaignRun(token, campaign.id);
    setBusyId(null);
    if (!r.ok) {
      await showCampaignActionError('run', r.error);
      void refresh();
      return;
    }
    const d = r.data;
    const failedNote = d.failedCount > 0 ? `, chyb ${d.failedCount}` : '';
    const skippedNote = d.skippedCount > 0 ? `, přeskočeno ${d.skippedCount}` : '';
    const phoneNote =
      d.recipientPhones?.length ? ` Příjemci: ${d.recipientPhones.join(', ')}.` : '';
    setStatusIsError(d.sentCount === 0);
    setStatusMsg(
      `Kampaň ${d.status === 'FAILED' ? 'selhala' : 'dokončena'}: odesláno ${d.sentCount}/${d.recipientCount}${failedNote}${skippedNote}.${phoneNote}`,
    );
    void refresh();
  }

  async function onShowLastMetaError(campaign: WhatsAppCampaignRow) {
    if (!token) return;
    setLoadingLastErrorId(campaign.id);
    const data = await nestAdminWhatsAppCampaignLastError(token, campaign.id);
    setLoadingLastErrorId(null);
    if (!data?.error) {
      setStatusIsError(true);
      setStatusMsg('Pro tuto kampaň není uložena žádná Meta chyba.');
      return;
    }
    setLastMetaError({ campaignName: campaign.name, error: data.error });
  }

  async function onShowCampaignLog(campaign: WhatsAppCampaignRow) {
    if (!token) return;
    setLoadingLogsId(campaign.id);
    const data = await nestAdminWhatsAppCampaignLogs(token, campaign.id);
    setLoadingLogsId(null);
    if (!data) {
      setStatusIsError(true);
      setStatusMsg('Log kampaně se nepodařilo načíst.');
      return;
    }
    setCampaignLogsTitle(campaign.name);
    setCampaignLogs(data.logs);
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

        {lastMetaError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-red-900">
                Poslední Meta chyba: {lastMetaError.campaignName}
              </h2>
              <button
                type="button"
                onClick={() => setLastMetaError(null)}
                className="text-xs font-semibold text-red-700 hover:text-red-900"
              >
                Zavřít
              </button>
            </div>
            <pre className="mt-3 max-h-80 overflow-auto rounded-lg bg-white p-3 text-xs text-zinc-800">
              {JSON.stringify(lastMetaError.error, null, 2)}
            </pre>
          </div>
        ) : null}

        {campaignLogs ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-zinc-900">
                Log kampaně: {campaignLogsTitle}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCampaignLogs(null);
                  setCampaignLogsTitle(null);
                }}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800"
              >
                Zavřít
              </button>
            </div>
            {!campaignLogs.length ? (
              <p className="mt-2 text-sm text-zinc-500">Žádné záznamy odeslání.</p>
            ) : (
              <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-zinc-50 p-3 text-xs text-zinc-700">
                {JSON.stringify(campaignLogs, null, 2)}
              </pre>
            )}
          </div>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">WhatsApp šablony</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Šablony z Meta Business Manageru. V kampani lze použít šablony se stavem APPROVED nebo
                ACTIVE (včetně „Aktivní“ z WhatsApp Manageru).
              </p>
              <p className="mt-1 text-xs text-zinc-500">{WHATSAPP_WABA_ID_HELP}</p>
              {effectiveWabaId ? (
                <p className="mt-1 font-mono text-xs text-zinc-700">
                  Aktivní WABA: {effectiveWabaId}
                </p>
              ) : null}
              {lastSyncedAt ? (
                <p className="mt-1 text-xs text-zinc-500">
                  Poslední synchronizace: {new Date(lastSyncedAt).toLocaleString('cs-CZ')}
                </p>
              ) : (
                <p className="mt-1 text-xs text-zinc-500">Zatím nebyla provedena synchronizace.</p>
              )}
              {lastSyncInfo ? (
                <p className="mt-1 text-xs text-zinc-600">{lastSyncInfo}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={syncingTemplates || cleaningTemplates}
                onClick={() => void syncTemplates(false)}
                className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 disabled:opacity-50"
              >
                {syncingTemplates ? 'Synchronizuji…' : 'Synchronizovat šablony'}
              </button>
              <button
                type="button"
                disabled={syncingTemplates || cleaningTemplates}
                onClick={() => void cleanupOldTemplates()}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50"
              >
                {cleaningTemplates ? 'Čistím…' : 'Vyčistit staré šablony'}
              </button>
              <button
                type="button"
                disabled={syncingTemplates || cleaningTemplates || loadingRawMeta}
                onClick={() => void showRawMetaResponse()}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-800 disabled:opacity-50"
              >
                {loadingRawMeta ? 'Načítám…' : 'Zobrazit raw Meta odpověď'}
              </button>
            </div>
          </div>
          {syncSummary.length ? (
            <div className="mt-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <p className="font-semibold text-zinc-800">Poslední sync — stavy šablon:</p>
              <ul className="mt-1 list-inside list-disc">
                {syncSummary.map((t) => (
                  <li key={`${t.name}-${t.language}`}>
                    {t.name} ({t.language}): raw={t.rawStatus}, normalized={t.normalizedStatus},{' '}
                    {t.isUsable ? 'usable' : 'not usable'}
                    {t.saved === false ? ` — NEULOŽENO: ${t.skipReason ?? '?'}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {syncDebug?.reasonSkipped?.length ? (
            <div className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-800">
              <p className="font-semibold">Přeskočené / neuložené šablony:</p>
              <ul className="mt-1 list-inside list-disc">
                {syncDebug.reasonSkipped.map((s, i) => (
                  <li key={`${s.name}-${s.language ?? i}`}>
                    {s.name}
                    {s.language ? ` (${s.language})` : ''}: {s.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rawMetaResponse != null ? (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-800">Raw Meta API odpověď</p>
                <button
                  type="button"
                  onClick={() => setRawMetaResponse(null)}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-800"
                >
                  Zavřít
                </button>
              </div>
              <pre className="mt-2 max-h-80 overflow-auto text-xs text-zinc-700">
                {JSON.stringify(rawMetaResponse, null, 2)}
              </pre>
            </div>
          ) : null}
          {syncWarning ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {syncWarning === WHATSAPP_WRONG_WABA_WARNING
                ? WHATSAPP_WRONG_WABA_WARNING
                : syncWarning}
            </p>
          ) : null}
          {!allTemplates.length ? (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {approvedTemplates.length === 0
                ? WHATSAPP_NO_APPROVED_TEMPLATES_MSG
                : 'Žádné šablony v databázi — načtěte je z Meta.'}
            </p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-xs uppercase text-zinc-500">
                    <th className="px-2 py-2">Název</th>
                    <th className="px-2 py-2">WABA</th>
                    <th className="px-2 py-2">Jazyk</th>
                    <th className="px-2 py-2">Kategorie</th>
                    <th className="px-2 py-2">Raw stav</th>
                    <th className="px-2 py-2">Normalized</th>
                    <th className="px-2 py-2">Header</th>
                    <th className="px-2 py-2">Kampaň</th>
                    <th className="px-2 py-2">Proměnné</th>
                    <th className="px-2 py-2">Text</th>
                    <th className="px-2 py-2">Sync</th>
                  </tr>
                </thead>
                <tbody>
                  {allTemplates.map((t) => (
                    <tr key={t.id} className="border-b border-zinc-50">
                      <td className="px-2 py-3 font-medium">{t.templateName}</td>
                      <td className="px-2 py-3 font-mono text-xs">{t.wabaId || '—'}</td>
                      <td className="px-2 py-3">{t.language}</td>
                      <td className="px-2 py-3">{t.category}</td>
                      <td className="px-2 py-3 font-mono text-xs">{t.rawStatus || t.status}</td>
                      <td className="px-2 py-3 font-mono text-xs">{t.normalizedStatus || '—'}</td>
                      <td className="px-2 py-3 font-mono text-xs">{t.headerType || 'NONE'}</td>
                      <td className="px-2 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            t.isUsable
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {t.isUsable ? 'usable' : 'not usable'}
                        </span>
                        {t.isStale ? (
                          <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                            stale
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">{t.variablesCount}</td>
                      <td className="max-w-xs truncate px-2 py-3 text-xs text-zinc-600" title={t.bodyText}>
                        {t.bodyText || '—'}
                      </td>
                      <td className="px-2 py-3 text-xs text-zinc-500">
                        {t.lastSyncedAt
                          ? new Date(t.lastSyncedAt).toLocaleString('cs-CZ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <form
          onSubmit={(e) => void onCreate(e)}
          className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-semibold text-zinc-900">Nová kampaň</h2>
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {WHATSAPP_CAMPAIGN_TEMPLATE_HELP}
          </p>
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
              <div>
                <label className="text-xs font-semibold uppercase text-zinc-500">
                  WhatsApp šablona (schválená v Meta) *
                </label>
                {approvedTemplates.length === 0 ? (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {WHATSAPP_NO_APPROVED_TEMPLATES_MSG}
                  </p>
                ) : (
                  <select
                    value={form.waMetaTemplateId}
                    onChange={(e) => {
                      const id = e.target.value;
                      const tpl = approvedTemplates.find((t) => t.id === id);
                      setForm((f) => ({
                        ...f,
                        waMetaTemplateId: id,
                        waTemplateVariables:
                          tpl && tpl.variablesCount > 0 ? f.waTemplateVariables : '',
                        waHeaderImageUrl: tpl?.headerType === 'IMAGE' ? f.waHeaderImageUrl : '',
                        waHeaderImageMediaId:
                          tpl?.headerType === 'IMAGE' ? f.waHeaderImageMediaId : '',
                      }));
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    required
                  >
                    <option value="">— vyberte šablonu —</option>
                    {approvedTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.templateName} ({t.language})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {selectedTemplate ? (
                <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
                  <p className="text-xs font-semibold uppercase text-zinc-500">Vybraná šablona</p>
                  <p className="mt-1 font-medium text-zinc-900">
                    {selectedTemplate.templateName}{' '}
                    <span className="font-normal text-zinc-500">({selectedTemplate.language})</span>
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Kategorie: {selectedTemplate.category} · Header: {selectedTemplate.headerType} ·
                    Proměnných: {selectedTemplate.variablesCount}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-zinc-800">{selectedTemplate.bodyText}</p>
                </div>
              ) : null}
              {requiresHeaderImage ? (
                <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/60 p-3">
                  <p className="text-xs font-semibold uppercase text-blue-800">
                    Obrázek kampaně (HEADER IMAGE) *
                  </p>
                  <p className="text-xs text-blue-900">
                    Obrázek musí být veřejně dostupný přes HTTPS. Můžete nahrát soubor, vložit URL
                    nebo použít Meta media_id.
                  </p>
                  <div>
                    <label className="text-xs font-semibold uppercase text-zinc-500">
                      Nahrát obrázek
                    </label>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploadingImage}
                      onChange={(e) => void onUploadCampaignImage(e.target.files?.[0] ?? null)}
                      className="mt-1 block w-full text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-zinc-500">
                      URL obrázku (HTTPS)
                    </label>
                    <input
                      type="url"
                      value={form.waHeaderImageUrl}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, waHeaderImageUrl: e.target.value }))
                      }
                      placeholder="https://www.xxrealit.cz/uploads/whatsapp/kampan-obrazek.jpg"
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase text-zinc-500">
                      Meta media_id (volitelně místo URL)
                    </label>
                    <input
                      type="text"
                      value={form.waHeaderImageMediaId}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, waHeaderImageMediaId: e.target.value }))
                      }
                      placeholder="1234567890"
                      className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"
                    />
                  </div>
                  {campaignImagePreviewSrc() ? (
                    <img
                      src={campaignImagePreviewSrc()!}
                      alt="Náhled obrázku kampaně"
                      className="max-h-48 rounded-lg border border-zinc-200 object-contain"
                    />
                  ) : null}
                </div>
              ) : null}
              {selectedTemplate && selectedTemplate.variablesCount > 0 ? (
                <div>
                  <label className="text-xs font-semibold uppercase text-zinc-500">
                    Template variables (jedna proměnná na řádek, pořadí {'{{1}}'}, {'{{2}}'}…)
                  </label>
                  <textarea
                    rows={4}
                    value={form.waTemplateVariables}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, waTemplateVariables: e.target.value }))
                    }
                    placeholder={'{jmeno}\n{odkaz}'}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Šablona vyžaduje {selectedTemplate.variablesCount} proměnných.
                  </p>
                </div>
              ) : selectedTemplate ? (
                <p className="text-sm text-zinc-600">
                  Tato šablona nemá proměnné — do Meta se odešle pouze název a jazyk šablony.
                </p>
              ) : null}
              <div>
                <label className="text-xs font-semibold uppercase text-zinc-500">
                  Vlastní text (jen náhled / interní poznámka — neodesílá se jako text)
                </label>
                <textarea
                  rows={4}
                  value={form.messageTemplate}
                  onChange={(e) => setForm((f) => ({ ...f, messageTemplate: e.target.value }))}
                  placeholder="Volitelný textový náhled s {jmeno}, {kredit}…"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>
              {previewDetail ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 p-3 text-sm text-zinc-800">
                  <p className="text-xs font-semibold text-emerald-800">Náhled kampaně</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Šablona: {previewDetail.templateName ?? '—'} ({previewDetail.templateLanguage})
                    {previewDetail.headerType ? ` · Header: ${previewDetail.headerType}` : ''}
                  </p>
                  {previewDetail.recipientSample ? (
                    <p className="mt-1 text-xs text-zinc-600">
                      Příjemce: {previewDetail.recipientSample.name} (
                      {previewDetail.recipientSample.phone})
                    </p>
                  ) : null}
                  {previewDetail.imageUrl ? (
                    <img
                      src={previewDetail.imageUrl}
                      alt="Náhled hlavičky"
                      className="mt-3 max-h-48 rounded-lg border border-zinc-200 object-contain"
                    />
                  ) : previewDetail.imageMediaId ? (
                    <p className="mt-2 text-xs text-zinc-600">
                      Obrázek přes media_id: {previewDetail.imageMediaId}
                    </p>
                  ) : null}
                  {previewDetail.preview ? (
                    <p className="mt-3 whitespace-pre-wrap">{previewDetail.preview}</p>
                  ) : null}
                  {previewDetail.buttons && previewDetail.buttons.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {previewDetail.buttons.map((label) => (
                        <span
                          key={label}
                          className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  ) : null}
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
                    <th className="px-2 py-2">Šablona</th>
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
                      <td className="px-2 py-3 text-xs">
                        {c.waTemplateName || '—'}
                        {c.waTemplateLanguage ? ` (${c.waTemplateLanguage})` : ''}
                      </td>
                      <td className="px-2 py-3">{statusLabel(c.status)}</td>
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
                            disabled={loadingLogsId === c.id}
                            onClick={() => void onShowCampaignLog(c)}
                            className="rounded border border-zinc-200 px-2 py-1 text-xs font-semibold"
                          >
                            {loadingLogsId === c.id ? '…' : 'Log kampaně'}
                          </button>
                          <button
                            type="button"
                            disabled={loadingLastErrorId === c.id}
                            onClick={() => void onShowLastMetaError(c)}
                            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-800"
                          >
                            {loadingLastErrorId === c.id ? '…' : 'Zobrazit poslední Meta chybu'}
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
                    <th className="px-2 py-2">Message ID</th>
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
                      <td className="px-2 py-2 font-mono text-xs">{h.providerMessageId || '—'}</td>
                      <td className="max-w-[180px] px-2 py-2 text-xs text-red-600">
                        {h.metaErrorMessage
                          ? `${h.metaErrorCode != null ? `[${h.metaErrorCode}] ` : ''}${h.metaErrorMessage}`
                          : h.errorMessage || '—'}
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
