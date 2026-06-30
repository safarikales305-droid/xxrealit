'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  nestAdminCreateEmailCampaignFull,
  nestAdminEmailCampaignPreview,
  nestAdminEmailCampaignRecipientCount,
  nestAdminEmailCampaignStart,
  nestAdminEmailCampaignTemplates,
  nestAdminEmailCampaignTestSend,
  nestAdminUpdateEmailCampaign,
  type EmailCampaignAudience,
  type EmailCampaignDetail,
  type EmailCampaignStepRow,
  type EmailCampaignTemplate,
} from '@/lib/nest-client';

const PORTAL_ROLE_OPTIONS = [
  { id: 'AGENT', label: 'Makléři' },
  { id: 'AGENCY', label: 'Realitní kanceláře' },
  { id: 'COMPANY', label: 'Stavební firmy' },
  { id: 'INVESTOR', label: 'Investoři' },
  { id: 'FINANCIAL_ADVISOR', label: 'Finanční poradci' },
  { id: 'PORTAL_WORKER', label: 'Pracovníci portálu' },
  { id: 'TIPSTER', label: 'Tipaři' },
  { id: 'USER', label: 'Běžní uživatelé' },
] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: 'Koncept',
  scheduled: 'Naplánováno',
  running: 'Běží',
  paused: 'Pozastaveno',
  completed: 'Dokončeno',
  sent: 'Odesláno',
  failed: 'Chyba',
};

export type EmailCampaignEditorInitial = {
  audience: EmailCampaignAudience;
  title?: string;
};

type Props = {
  token: string;
  adminEmail?: string;
  initial: EmailCampaignEditorInitial;
  campaignId?: string | null;
  onClose: () => void;
  onSaved?: (campaign: EmailCampaignDetail) => void;
};

export function EmailCampaignEditorModal({
  token,
  adminEmail,
  initial,
  campaignId: initialCampaignId,
  onClose,
  onSaved,
}: Props) {
  const [campaignId, setCampaignId] = useState<string | null>(initialCampaignId ?? null);
  const [title, setTitle] = useState(initial.title ?? 'Oslovení makléřů');
  const [senderName, setSenderName] = useState('Tým XXrealit');
  const [minDaysBetweenSends, setMinDaysBetweenSends] = useState(7);
  const [audienceMode, setAudienceMode] = useState<EmailCampaignAudience['mode']>(initial.audience.mode);
  const [portalRoles, setPortalRoles] = useState<string[]>(initial.audience.portalRoles ?? []);
  const [steps, setSteps] = useState<EmailCampaignStepRow[]>([]);
  const [templates, setTemplates] = useState<EmailCampaignTemplate[]>([]);
  const [status, setStatus] = useState('draft');
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [testEmail, setTestEmail] = useState(adminEmail ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const audience = useMemo((): EmailCampaignAudience => {
    if (audienceMode === 'portal_roles') {
      return { mode: 'portal_roles', portalRoles };
    }
    return {
      mode: audienceMode,
      selectedContactIds: initial.audience.selectedContactIds,
      filter: initial.audience.filter,
    };
  }, [audienceMode, portalRoles, initial.audience]);

  const loadTemplates = useCallback(async () => {
    const rows = await nestAdminEmailCampaignTemplates(token);
    setTemplates(rows);
    if (!steps.length && rows[0]?.steps?.length) {
      setSteps(rows[0].steps.map((s) => ({ ...s })));
    }
  }, [token, steps.length]);

  const refreshRecipientCount = useCallback(async () => {
    const r = await nestAdminEmailCampaignRecipientCount(token, {
      audience,
      minDaysBetweenSends,
    });
    setRecipientCount(r.total);
    if (r.error) setErr(r.error);
  }, [token, audience, minDaysBetweenSends]);

  const refreshPreview = useCallback(async () => {
    if (!campaignId) {
      const step = steps[activeStep];
      if (!step) return;
      setPreviewSubject(step.subject);
      setPreviewHtml(step.htmlContent);
      return;
    }
    const r = await nestAdminEmailCampaignPreview(token, campaignId, activeStep);
    if (r.preview) {
      setPreviewSubject(r.preview.subject);
      setPreviewHtml(r.preview.htmlContent);
    }
  }, [token, campaignId, activeStep, steps]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    void refreshRecipientCount();
  }, [refreshRecipientCount]);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  async function ensureCampaign(): Promise<string | null> {
    if (campaignId) return campaignId;
    setBusy(true);
    setErr(null);
    const r = await nestAdminCreateEmailCampaignFull(token, {
      title,
      senderName,
      minDaysBetweenSends,
      audience,
      templateKey: 'broker_outreach_sequence',
      steps,
    });
    setBusy(false);
    if (!r.campaign) {
      setErr(r.error ?? 'Vytvoření kampaně selhalo');
      return null;
    }
    setCampaignId(r.campaign.id);
    setStatus(r.campaign.status);
    onSaved?.(r.campaign);
    return r.campaign.id;
  }

  async function saveDraft() {
    const id = await ensureCampaign();
    if (!id) return;
    setBusy(true);
    const r = await nestAdminUpdateEmailCampaign(token, id, {
      title,
      senderName,
      minDaysBetweenSends,
      audience,
      steps,
    });
    setBusy(false);
    if (!r.campaign) {
      setErr(r.error ?? 'Uložení selhalo');
      return;
    }
    setMsg('Kampaň uložena jako koncept.');
    onSaved?.(r.campaign);
  }

  async function sendTest() {
    const id = await ensureCampaign();
    if (!id || !testEmail.trim()) return;
    setBusy(true);
    const r = await nestAdminEmailCampaignTestSend(token, id, testEmail.trim(), activeStep);
    setBusy(false);
    setMsg(r.ok ? `Test odeslán na ${testEmail}.` : null);
    setErr(r.ok ? null : r.error ?? 'Test selhal');
    if (r.ok) void refreshPreview();
  }

  async function startCampaign() {
    const id = await ensureCampaign();
    if (!id) return;
    setBusy(true);
    await nestAdminUpdateEmailCampaign(token, id, { title, senderName, minDaysBetweenSends, audience, steps });
    const r = await nestAdminEmailCampaignStart(token, id);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Spuštění selhalo');
      return;
    }
    setStatus('running');
    setMsg(`Kampaň spuštěna — ${r.recipients ?? recipientCount ?? 0} příjemců.`);
  }

  function applyTemplate(key: string) {
    const t = templates.find((x) => x.key === key);
    if (!t) return;
    setSteps(t.steps.map((s) => ({ ...s })));
    setActiveStep(0);
  }

  const currentStep = steps[activeStep];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4">
      <div className="flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">E-mailová kampaň</h2>
            <p className="text-xs text-zinc-500">
              Stav: <strong>{STATUS_LABEL[status] ?? status}</strong>
              {recipientCount != null ? (
                <>
                  {' '}
                  · Příjemců: <strong>{recipientCount}</strong>
                </>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold"
          >
            Zavřít
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="font-semibold text-zinc-700">Název kampaně</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
              />
            </label>

            <label className="block text-sm">
              <span className="font-semibold text-zinc-700">Odesílatel (jméno)</span>
              <input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2"
              />
            </label>

            <fieldset className="rounded-xl border border-zinc-200 p-3 text-sm">
              <legend className="px-1 font-semibold text-zinc-800">Příjemci</legend>
              <div className="mt-2 space-y-2">
                {[
                  { mode: 'selected_ids' as const, label: 'Označené kontakty' },
                  { mode: 'filtered' as const, label: 'Aktuálně vyfiltrované kontakty' },
                  { mode: 'all_imported' as const, label: 'Všechny importované s e-mailem' },
                  { mode: 'portal_roles' as const, label: 'Uživatelé portálu podle rolí' },
                ].map((opt) => (
                  <label key={opt.mode} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="audience-mode"
                      checked={audienceMode === opt.mode}
                      onChange={() => setAudienceMode(opt.mode)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
              {audienceMode === 'portal_roles' ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {PORTAL_ROLE_OPTIONS.map((r) => (
                    <label key={r.id} className="inline-flex items-center gap-1 text-xs">
                      <input
                        type="checkbox"
                        checked={portalRoles.includes(r.id)}
                        onChange={(e) => {
                          setPortalRoles((prev) =>
                            e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id),
                          );
                        }}
                      />
                      {r.label}
                    </label>
                  ))}
                </div>
              ) : null}
              <p className="mt-2 text-xs text-zinc-500">
                Min. dní mezi e-maily:{' '}
                <input
                  type="number"
                  min={0}
                  value={minDaysBetweenSends}
                  onChange={(e) => setMinDaysBetweenSends(Number(e.target.value) || 0)}
                  className="ml-1 w-14 rounded border px-1 py-0.5"
                />
              </p>
            </fieldset>

            <div className="rounded-xl border border-zinc-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Sekvenční kroky</h3>
                <select
                  className="rounded border border-zinc-200 px-2 py-1 text-xs"
                  onChange={(e) => applyTemplate(e.target.value)}
                  defaultValue=""
                >
                  <option value="" disabled>
                    Šablona…
                  </option>
                  {templates.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {steps.map((s, idx) => (
                  <button
                    key={s.stepOrder}
                    type="button"
                    onClick={() => setActiveStep(idx)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      activeStep === idx ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    {s.name || `Krok ${idx + 1}`}
                  </button>
                ))}
              </div>
              {currentStep ? (
                <div className="mt-3 space-y-2 text-sm">
                  <input
                    value={currentStep.subject}
                    onChange={(e) =>
                      setSteps((prev) =>
                        prev.map((s, i) => (i === activeStep ? { ...s, subject: e.target.value } : s)),
                      )
                    }
                    className="w-full rounded-lg border px-2 py-1.5"
                    placeholder="Předmět"
                  />
                  <textarea
                    value={currentStep.htmlContent}
                    onChange={(e) =>
                      setSteps((prev) =>
                        prev.map((s, i) =>
                          i === activeStep ? { ...s, htmlContent: e.target.value } : s,
                        ),
                      )
                    }
                    rows={8}
                    className="w-full rounded-lg border px-2 py-1.5 font-mono text-xs"
                    placeholder="HTML obsah — proměnné: {{fullName}}, {{firstName}}, {{email}}…"
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={currentStep.isActive}
                      onChange={(e) =>
                        setSteps((prev) =>
                          prev.map((s, i) =>
                            i === activeStep ? { ...s, isActive: e.target.checked } : s,
                          ),
                        )
                      }
                    />
                    Krok aktivní · zpoždění {currentStep.delayDays} dní {currentStep.delayHours} h
                  </label>
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPreviewMode('desktop')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  previewMode === 'desktop' ? 'bg-zinc-900 text-white' : 'border'
                }`}
              >
                Desktop náhled
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode('mobile')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  previewMode === 'mobile' ? 'bg-zinc-900 text-white' : 'border'
                }`}
              >
                Mobilní náhled
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void refreshPreview()}
                className="ml-auto rounded-lg border px-3 py-1.5 text-xs font-semibold"
              >
                Obnovit náhled
              </button>
            </div>
            <p className="text-sm font-semibold text-zinc-800">{previewSubject || 'Předmět náhledu'}</p>
            <div
              className={`min-h-[240px] flex-1 overflow-auto rounded-xl border bg-zinc-50 p-4 ${
                previewMode === 'mobile' ? 'mx-auto max-w-[320px]' : ''
              }`}
            >
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: previewHtml || '<p>Náhled se načte po uložení nebo po výběru kroku.</p>' }}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="Testovací e-mail"
                className="min-w-[180px] flex-1 rounded-lg border px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void sendTest()}
                className="rounded-lg border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-800"
              >
                Testovací odeslání
              </button>
            </div>
          </div>
        </div>

        <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-zinc-200 px-4 py-3 sm:px-6">
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveDraft()}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold"
          >
            Uložit koncept
          </button>
          <button
            type="button"
            disabled={busy || status === 'running'}
            onClick={() => void startCampaign()}
            className="rounded-lg bg-[#e85d00] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Spustit kampaň
          </button>
          {msg ? <span className="text-sm text-emerald-700">{msg}</span> : null}
          {err ? <span className="text-sm text-red-600">{err}</span> : null}
        </footer>
      </div>
    </div>
  );
}
