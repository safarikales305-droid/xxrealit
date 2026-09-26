'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { BeforeAfterSlider } from '@/components/ai-visualization/BeforeAfterSlider';
import { AiRenovationFunnel } from '@/components/ai-visualization/AiRenovationFunnel';
import { AiVisualizationGallery } from '@/components/ai-visualization/AiVisualizationGallery';
import { AiVisualizationResultActions } from '@/components/ai-visualization/AiVisualizationResultActions';
import { AI_FINDER_MOBILE_BAR_EST_HEIGHT_PX, AI_FINDER_STACK_GAP_PX, FLOATING_Z } from '@/lib/floating-ui-geometry';
import {
  claimAiVisualization,
  deleteAiVisualizationFromSession,
  downloadAiVisualization,
  enableAiVisualizationShare,
  fetchAiVisualizationConfig,
  fetchAiVisualizationSession,
  formatCzkRange,
  generateAiVisualization,
  persistActiveVisualizationId,
  pollAiVisualizationStatus,
  progressStepLabel,
  readActiveVisualizationId,
  persistAiVisualizationAttributionFromUrl,
  readAiVisualizationAttribution,
  resolveVisualizationRootId,
  trackAiVisualizationEvent,
  uploadAiVisualizationPhoto,
  type AiRenovationEstimate,
  type AiVisualizationConfig,
  type AiVisualizationView,
} from '@/lib/ai-visualization-client';

type Step = 'upload' | 'configure' | 'generating' | 'result' | 'error';

type Props = {
  prefilledImageUrl?: string | null;
  initialVizId?: string | null;
  initialLocation?: string | null;
};

export function AiVisualizationWizard({ prefilledImageUrl, initialVizId, initialLocation }: Props) {
  const { isAuthenticated } = useAuth();
  const [config, setConfig] = useState<AiVisualizationConfig | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [viz, setViz] = useState<AiVisualizationView | null>(null);
  const [sessionItems, setSessionItems] = useState<AiVisualizationView[]>([]);
  const [propertyType, setPropertyType] = useState('living_room');
  const [style, setStyle] = useState('modern');
  const [renovationLevel, setRenovationLevel] = useState<'LIGHT' | 'RENOVATION' | 'MAJOR'>('RENOVATION');
  const [userPrompt, setUserPrompt] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [loginModal, setLoginModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareFallbackUrl, setShareFallbackUrl] = useState<string | null>(null);
  const [addPhotoSheet, setAddPhotoSheet] = useState(false);
  const [configureIsNewPhoto, setConfigureIsNewPhoto] = useState(false);
  const [submittingGenerate, setSubmittingGenerate] = useState(false);
  const [estimateOpenToken, setEstimateOpenToken] = useState(0);
  const [contractorsOpenToken, setContractorsOpenToken] = useState(0);
  const [estimatesByVizId, setEstimatesByVizId] = useState<Record<string, AiRenovationEstimate>>({});
  const [pendingDownloadVizId, setPendingDownloadVizId] = useState<string | null>(null);

  const generatingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idempotencyKeyRef = useRef<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const addPhotoCameraRef = useRef<HTMLInputElement>(null);
  const addPhotoGalleryRef = useRef<HTMLInputElement>(null);

  const reloadSession = useCallback(async () => {
    const session = await fetchAiVisualizationSession();
    if (session?.items?.length) setSessionItems(session.items);
    return session?.items ?? [];
  }, []);

  const applyActiveViz = useCallback((v: AiVisualizationView) => {
    setViz(v);
    persistActiveVisualizationId(v.id);
    if (v.propertyType) setPropertyType(v.propertyType);
    if (v.status === 'COMPLETED') setStep('result');
    else if (v.status === 'FAILED') {
      setStep('error');
      setGenError(v.errorMessage ?? 'Vizualizaci se nepodařilo dokončit.');
    } else if (v.status === 'PENDING' || v.status === 'PROCESSING') setStep('generating');
    else if (v.originalPreviewUrl) setStep('configure');
    else setStep('upload');
  }, []);

  useEffect(() => {
    void fetchAiVisualizationConfig().then(setConfig);
    persistAiVisualizationAttributionFromUrl();
    if (initialLocation?.trim()) {
      const existing = readAiVisualizationAttribution() ?? {};
      sessionStorage.setItem(
        'xxrealit_ai_viz_attribution',
        JSON.stringify({
          ...existing,
          seoLocation: initialLocation.trim(),
          utmCampaign: existing.utmCampaign ?? 'ai_visualization',
          capturedAt: new Date().toISOString(),
        }),
      );
    }
    trackAiVisualizationEvent({ eventName: 'ai_visualization_open' });

    void (async () => {
      const items = await reloadSession();
      const preferredId = initialVizId?.trim() || readActiveVisualizationId();
      if (items.length > 0) {
        const pick =
          items.find((i) => i.id === preferredId) ??
          items.find((i) => i.status === 'COMPLETED') ??
          items[items.length - 1];
        if (pick) applyActiveViz(pick);
        return;
      }
      if (preferredId) {
        const v = await pollAiVisualizationStatus(preferredId);
        if (v) applyActiveViz(v);
      }
    })();
  }, [applyActiveViz, initialVizId, initialLocation, reloadSession]);

  useEffect(() => {
    if (!isAuthenticated || !viz?.id) return;
    void claimAiVisualization(viz.id);
  }, [isAuthenticated, viz?.id]);

  useEffect(() => {
    if (!isAuthenticated || !pendingDownloadVizId) return;
    void downloadAiVisualization(pendingDownloadVizId).then((ok) => {
      if (ok) {
        trackAiVisualizationEvent({
          eventName: 'ai_visualization_download',
          visualizationId: pendingDownloadVizId,
        });
      }
      setPendingDownloadVizId(null);
    });
  }, [isAuthenticated, pendingDownloadVizId]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  }, []);

  useEffect(() => () => stopPoll(), [stopPoll]);

  const startPoll = useCallback(
    (id: string) => {
      stopPoll();
      pollRef.current = setInterval(() => {
        void pollAiVisualizationStatus(id).then((next) => {
          if (!next) return;
          setViz(next);
          setSessionItems((prev) => {
            const idx = prev.findIndex((p) => p.id === next.id);
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = next;
              return copy;
            }
            return [...prev, next];
          });
          if (next.status === 'COMPLETED') {
            stopPoll();
            generatingRef.current = false;
            setSubmittingGenerate(false);
            idempotencyKeyRef.current = null;
            setStep('result');
            void reloadSession();
            trackAiVisualizationEvent({ eventName: 'ai_visualization_complete', visualizationId: id });
          } else if (next.status === 'FAILED') {
            stopPoll();
            generatingRef.current = false;
            setSubmittingGenerate(false);
            idempotencyKeyRef.current = null;
            setStep('error');
            setGenError(next.errorMessage ?? 'Vizualizaci se nepodařilo dokončit.');
          }
        });
      }, 1500);
    },
    [reloadSession, stopPoll],
  );

  const onPickFile = async (file: File | null, opts?: { isAdditionalPhoto?: boolean }) => {
    if (!file) return;
    setUploadError(null);
    setAddPhotoSheet(false);
    const res = await uploadAiVisualizationPhoto(file);
    if (!res || 'message' in res) {
      setUploadError(res && 'message' in res ? res.message : 'Nahrání se nepodařilo.');
      return;
    }
    setViz(res);
    persistActiveVisualizationId(res.id);
    setConfigureIsNewPhoto(Boolean(opts?.isAdditionalPhoto));
    idempotencyKeyRef.current = null;
    setStep('configure');
    void reloadSession();
    trackAiVisualizationEvent({ eventName: 'ai_visualization_upload', visualizationId: res.id });
  };

  useEffect(() => {
    if (!prefilledImageUrl || viz) return;
    void (async () => {
      try {
        const res = await fetch(prefilledImageUrl);
        const blob = await res.blob();
        const file = new File([blob], 'listing-photo.jpg', { type: blob.type || 'image/jpeg' });
        await onPickFile(file);
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefilledImageUrl]);

  const runGenerate = async (opts?: { variant?: boolean }) => {
    if (!viz || generatingRef.current) return;
    generatingRef.current = true;
    setSubmittingGenerate(true);
    setGenError(null);
    setStep('generating');
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    const idempotencyKey = idempotencyKeyRef.current;
    const parentId = opts?.variant ? resolveVisualizationRootId(viz) : undefined;
    const res = await generateAiVisualization({
      visualizationId: viz.id,
      propertyType,
      style,
      renovationLevel,
      userPrompt,
      idempotencyKey,
      parentId,
      marketingConsent: marketingConsent || undefined,
    });
    if (!res || 'message' in res) {
      generatingRef.current = false;
      setSubmittingGenerate(false);
      idempotencyKeyRef.current = null;
      setGenError(res && 'message' in res ? res.message : 'Generování nelze spustit.');
      setStep('error');
      return;
    }
    setViz(res);
    persistActiveVisualizationId(res.id);
    setConfigureIsNewPhoto(false);
    startPoll(res.id);
  };

  const openAddPhoto = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches) {
      setAddPhotoSheet(true);
      return;
    }
    addPhotoGalleryRef.current?.click();
  };

  const handleDownloadFor = async (target: AiVisualizationView) => {
    trackAiVisualizationEvent({ eventName: 'ai_visualization_download_click', visualizationId: target.id });
    if (!isAuthenticated) {
      trackAiVisualizationEvent({ eventName: 'ai_visualization_login_required', visualizationId: target.id });
      setPendingDownloadVizId(target.id);
      persistActiveVisualizationId(target.id);
      setViz(target);
      setLoginModal(true);
      return;
    }
    const ok = await downloadAiVisualization(target.id);
    if (ok) trackAiVisualizationEvent({ eventName: 'ai_visualization_download', visualizationId: target.id });
  };

  const handleShareFor = async (target: AiVisualizationView) => {
    const res = await enableAiVisualizationShare(target.id);
    if (!res?.publicShareId) return;
    const url = `${window.location.origin}/ai-vizualizace/v/${res.publicShareId}`;
    setShareUrl(url);
    setShareFallbackUrl(url);
    trackAiVisualizationEvent({ eventName: 'ai_visualization_share', visualizationId: target.id });
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AI vizualizace XXREALIT', url });
        return;
      } catch {
        /* fallback */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* show fallback UI */
    }
  };

  const handleDelete = async (target: AiVisualizationView) => {
    const ok = await deleteAiVisualizationFromSession(target.id);
    if (!ok) return;
    const items = await reloadSession();
    if (viz?.id === target.id || resolveVisualizationRootId(viz ?? target) === resolveVisualizationRootId(target)) {
      const next = items.find((i) => i.status === 'COMPLETED') ?? items[items.length - 1];
      if (next) applyActiveViz(next);
      else {
        setViz(null);
        setStep('upload');
      }
    }
  };

  const scrollToFunnel = () => {
    document.getElementById('ai-renovation-funnel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const progress = viz?.progress ?? 0;

  const propertyTypeLabel = useMemo(() => {
    const found = config?.propertyTypes?.find((p) => p.id === (viz?.propertyType ?? propertyType));
    return found ? `${found.emoji} ${found.label}` : propertyType;
  }, [config?.propertyTypes, viz?.propertyType, propertyType]);

  const styleLabel = useMemo(() => {
    return config?.styles?.find((s) => s.id === (viz?.style ?? style))?.label ?? style;
  }, [config?.styles, viz?.style, style]);

  const activeEstimate = viz?.id ? estimatesByVizId[viz.id] : undefined;
  const estimateSummary = activeEstimate
    ? formatCzkRange(activeEstimate.estimateMin, activeEstimate.estimateMax)
    : null;

  const loginRedirect = viz?.id
    ? `/ai-vizualizace?viz=${encodeURIComponent(viz.id)}`
    : '/ai-vizualizace';

  const mobileStickyBottom = `calc(max(0.75rem, env(safe-area-inset-bottom)) + ${AI_FINDER_MOBILE_BAR_EST_HEIGHT_PX + AI_FINDER_STACK_GAP_PX}px)`;

  const configurePanel = viz?.originalPreviewUrl ? (
    <div className="space-y-4">
      {configureIsNewPhoto ? (
        <p className="text-center text-xs font-bold uppercase tracking-wide text-orange-600">Nová fotografie</p>
      ) : null}
      <div className="overflow-hidden rounded-2xl border border-zinc-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={viz.originalPreviewUrl} alt="Nahraná fotografie" className="max-h-72 w-full object-cover" />
      </div>
      {configureIsNewPhoto ? (
        <button
          type="button"
          onClick={() => openAddPhoto()}
          className="w-full rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-800"
        >
          Změnit fotografii
        </button>
      ) : null}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold text-zinc-900">Co chcete změnit?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(config?.propertyTypes ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPropertyType(p.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                propertyType === p.id ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-800'
              }`}
            >
              {p.emoji} {p.label}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold text-zinc-900">Jak má výsledek vypadat?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(config?.styles ?? []).map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStyle(s.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                style === s.id ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-800'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <textarea
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          rows={3}
          placeholder="Vlastní požadavek (volitelné)…"
          className="mt-3 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>
      {!configureIsNewPhoto ? (
        <label className="flex gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={marketingConsent}
            onChange={(e) => setMarketingConsent(e.target.checked)}
          />
          <span>
            Souhlasím, že anonymizovaná fotografie před/po může být použita pro prezentaci služby XXREALIT na
            sociálních sítích (volitelné).
          </span>
        </label>
      ) : null}
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold text-zinc-900">Rozsah rekonstrukce</p>
        <div className="mt-3 space-y-2">
          {(config?.renovationLevels ?? []).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRenovationLevel(r.id as 'LIGHT' | 'RENOVATION' | 'MAJOR')}
              className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                renovationLevel === r.id ? 'border-orange-400 bg-orange-50' : 'border-zinc-200'
              }`}
            >
              <span className="font-bold text-zinc-900">{r.label}</span>
              <span className="mt-0.5 block text-xs text-zinc-600">{r.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  ) : null;

  if (config && !config.enabled) {
    return (
      <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-zinc-600">
        AI vizualizace je dočasně vypnutá.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-lg pb-36 md:max-w-2xl md:pb-24">
      <input
        ref={addPhotoCameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => void onPickFile(e.target.files?.[0] ?? null, { isAdditionalPhoto: true })}
      />
      <input
        ref={addPhotoGalleryRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        className="sr-only"
        onChange={(e) => void onPickFile(e.target.files?.[0] ?? null, { isAdditionalPhoto: true })}
      />

      {step === 'upload' && sessionItems.length === 0 ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-center text-sm text-zinc-600">Nahrajte fotografii místnosti, domu nebo bytu.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50 px-4 py-8 text-center hover:border-orange-400">
              <span className="text-3xl">📷</span>
              <span className="mt-2 text-sm font-bold text-zinc-900">Vyfotit</span>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-8 text-center hover:border-zinc-400">
              <span className="text-3xl">🖼️</span>
              <span className="mt-2 text-sm font-bold text-zinc-900">Vybrat z galerie</span>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="sr-only"
                onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          {uploadError ? <p className="mt-4 text-sm text-red-600">{uploadError}</p> : null}
        </div>
      ) : null}

      {step === 'configure' ? configurePanel : null}

      {step === 'generating' ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-bold text-zinc-900">AI připravuje vaši vizualizaci…</p>
          <p className="mt-2 text-sm text-zinc-600">{progressStepLabel(progress)}</p>
          <p className="mt-2 text-3xl font-bold text-orange-600">{progress} %</p>
          <div className="mx-auto mt-6 h-2 max-w-xs overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-orange-600 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {step === 'result' && viz?.originalPreviewUrl && viz.resultPreviewUrl ? (
        <>
          <BeforeAfterSlider beforeUrl={viz.originalPreviewUrl} afterUrl={viz.resultPreviewUrl} />
          <AiVisualizationResultActions
            hasEstimate={Boolean(activeEstimate)}
            estimateSummary={estimateSummary}
            generating={submittingGenerate}
            onVariant={() => void runGenerate({ variant: true })}
            onAddPhoto={openAddPhoto}
            onShare={() => void handleShareFor(viz)}
            onDownload={() => void handleDownloadFor(viz)}
            onEstimate={() => {
              setEstimateOpenToken((t) => t + 1);
              scrollToFunnel();
            }}
            onContractors={() => {
              setContractorsOpenToken((t) => t + 1);
              scrollToFunnel();
            }}
          />
          <AiRenovationFunnel
            viz={viz}
            config={config}
            propertyTypeLabel={propertyTypeLabel}
            styleLabel={styleLabel}
            sessionItems={sessionItems}
            hideInitialCta
            openEstimateToken={estimateOpenToken}
            openContractorsToken={contractorsOpenToken}
            onEstimateSaved={(est) => {
              if (viz?.id) setEstimatesByVizId((prev) => ({ ...prev, [viz.id]: est }));
            }}
          />
        </>
      ) : null}

      {sessionItems.length > 0 && step !== 'upload' ? (
        <AiVisualizationGallery
          items={sessionItems}
          activeId={viz?.id ?? null}
          config={config}
          onSelect={(item) => applyActiveViz(item)}
          onCompare={(item) => applyActiveViz(item)}
          onVariant={(item) => {
            setViz(item);
            void runGenerate({ variant: true });
          }}
          onShare={(item) => void handleShareFor(item)}
          onDownload={(item) => void handleDownloadFor(item)}
          onDelete={(item) => void handleDelete(item)}
        />
      ) : null}

      {step === 'error' ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-semibold text-red-800">{genError ?? 'Vizualizaci se nepodařilo dokončit.'}</p>
          <button
            type="button"
            onClick={() => setStep('configure')}
            className="mt-4 rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white"
          >
            Zkusit znovu
          </button>
        </div>
      ) : null}

      {step === 'configure' ? (
        <div
          className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur md:relative md:mt-4 md:border-0 md:bg-transparent md:p-0"
          style={{
            zIndex: FLOATING_Z.actions,
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
          data-floating-ui
          data-floating-ui-id="ai-viz-configure-cta"
        >
          <button
            type="button"
            disabled={submittingGenerate}
            onClick={() => void runGenerate()}
            className="w-full rounded-2xl bg-orange-600 py-4 text-base font-bold text-white shadow-lg hover:bg-orange-700 disabled:opacity-60"
          >
            {submittingGenerate ? 'Vytvářím…' : '✨ Vytvořit vizualizaci'}
          </button>
        </div>
      ) : null}

      {step === 'result' ? (
        <div
          className="fixed inset-x-0 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur md:hidden"
          style={{ zIndex: FLOATING_Z.actions, bottom: mobileStickyBottom }}
          data-floating-ui
          data-floating-ui-id="ai-viz-mobile-result-cta"
        >
          <div className="mx-auto flex max-w-lg flex-col gap-2">
            <button
              type="button"
              onClick={openAddPhoto}
              className="w-full rounded-2xl bg-zinc-900 py-3.5 text-sm font-bold text-white"
            >
              📷 Další fotka
            </button>
            <button
              type="button"
              onClick={() => {
                setEstimateOpenToken((t) => t + 1);
                scrollToFunnel();
              }}
              className="w-full rounded-2xl bg-orange-600 py-3.5 text-sm font-bold text-white"
            >
              💰 Spočítat cenu
            </button>
          </div>
        </div>
      ) : null}

      {addPhotoSheet ? (
        <div className="fixed inset-0 z-[1000] flex items-end justify-center bg-black/40 p-4 md:hidden">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <p className="text-center text-sm font-bold text-zinc-900">Přidat fotografii</p>
            <button
              type="button"
              className="mt-4 w-full rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white"
              onClick={() => {
                setAddPhotoSheet(false);
                addPhotoCameraRef.current?.click();
              }}
            >
              📸 Vyfotit nyní
            </button>
            <button
              type="button"
              className="mt-2 w-full rounded-xl border border-zinc-300 py-3 text-sm font-semibold"
              onClick={() => {
                setAddPhotoSheet(false);
                addPhotoGalleryRef.current?.click();
              }}
            >
              🖼️ Vybrat z galerie
            </button>
            <button type="button" onClick={() => setAddPhotoSheet(false)} className="mt-3 w-full text-sm text-zinc-500">
              Zrušit
            </button>
          </div>
        </div>
      ) : null}

      {loginModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-zinc-900">Chcete si vizualizaci uložit?</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Přihlaste se nebo se zdarma zaregistrujte a stáhněte si vytvořenou vizualizaci.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/prihlaseni?redirect=${encodeURIComponent(loginRedirect)}`}
                className="rounded-xl bg-orange-600 py-3 text-center text-sm font-bold text-white"
              >
                Přihlásit se
              </Link>
              <Link
                href={`/registrace?redirect=${encodeURIComponent(loginRedirect)}`}
                className="rounded-xl border border-zinc-300 py-3 text-center text-sm font-semibold text-zinc-800"
              >
                Registrovat zdarma
              </Link>
              <button type="button" onClick={() => setLoginModal(false)} className="text-sm text-zinc-500">
                Zavřít
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {shareUrl ? (
        <p className="mt-4 text-center text-xs text-emerald-700">Odkaz ke sdílení je připravený.</p>
      ) : null}

      {shareFallbackUrl ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs">
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareFallbackUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-zinc-100 px-3 py-1.5 font-semibold text-zinc-800"
          >
            Facebook
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(shareFallbackUrl)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-zinc-100 px-3 py-1.5 font-semibold text-zinc-800"
          >
            WhatsApp
          </a>
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(shareFallbackUrl)}
            className="rounded-full bg-zinc-100 px-3 py-1.5 font-semibold text-zinc-800"
          >
            Kopírovat odkaz
          </button>
        </div>
      ) : null}

      {uploadError && step !== 'upload' ? <p className="mt-4 text-sm text-red-600">{uploadError}</p> : null}
    </div>
  );
}
