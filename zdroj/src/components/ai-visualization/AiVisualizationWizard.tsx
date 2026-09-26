'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { BeforeAfterSlider } from '@/components/ai-visualization/BeforeAfterSlider';
import { AiRenovationFunnel } from '@/components/ai-visualization/AiRenovationFunnel';
import {
  claimAiVisualization,
  downloadAiVisualization,
  enableAiVisualizationShare,
  fetchAiVisualizationConfig,
  generateAiVisualization,
  persistActiveVisualizationId,
  pollAiVisualizationStatus,
  progressStepLabel,
  readActiveVisualizationId,
  trackAiVisualizationEvent,
  uploadAiVisualizationPhoto,
  type AiVisualizationConfig,
  type AiVisualizationView,
} from '@/lib/ai-visualization-client';

type Step = 'upload' | 'configure' | 'generating' | 'result' | 'error';

type Props = {
  prefilledImageUrl?: string | null;
};

export function AiVisualizationWizard({ prefilledImageUrl }: Props) {
  const { isAuthenticated } = useAuth();
  const [config, setConfig] = useState<AiVisualizationConfig | null>(null);
  const [step, setStep] = useState<Step>('upload');
  const [viz, setViz] = useState<AiVisualizationView | null>(null);
  const [propertyType, setPropertyType] = useState('living_room');
  const [style, setStyle] = useState('modern');
  const [renovationLevel, setRenovationLevel] = useState<'LIGHT' | 'RENOVATION' | 'MAJOR'>('RENOVATION');
  const [userPrompt, setUserPrompt] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [loginModal, setLoginModal] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const generatingRef = useRef(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void fetchAiVisualizationConfig().then(setConfig);
    trackAiVisualizationEvent({ eventName: 'ai_visualization_open' });
    const restored = readActiveVisualizationId();
    if (restored) {
      void pollAiVisualizationStatus(restored).then((v) => {
        if (v) {
          setViz(v);
          if (v.status === 'COMPLETED') setStep('result');
          else if (v.status === 'FAILED') setStep('error');
          else if (v.status === 'PENDING' || v.status === 'PROCESSING') setStep('generating');
        }
      });
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !viz?.id) return;
    void claimAiVisualization(viz.id);
  }, [isAuthenticated, viz?.id]);

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
          if (next.status === 'COMPLETED') {
            stopPoll();
            generatingRef.current = false;
            setStep('result');
            trackAiVisualizationEvent({ eventName: 'ai_visualization_complete', visualizationId: id });
          } else if (next.status === 'FAILED') {
            stopPoll();
            generatingRef.current = false;
            setStep('error');
            setGenError(next.errorMessage ?? 'Vizualizaci se nepodařilo dokončit.');
          }
        });
      }, 1500);
    },
    [stopPoll],
  );

  const onPickFile = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    const res = await uploadAiVisualizationPhoto(file);
    if (!res || 'message' in res) {
      setUploadError(res && 'message' in res ? res.message : 'Nahrání se nepodařilo.');
      return;
    }
    setViz(res);
    persistActiveVisualizationId(res.id);
    setStep('configure');
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

  const runGenerate = async (variantParentId?: string) => {
    if (!viz || generatingRef.current) return;
    generatingRef.current = true;
    setGenError(null);
    setStep('generating');
    const idempotencyKey = `${viz.id}:${variantParentId ?? 'base'}:${style}:${renovationLevel}:${Date.now()}`;
    const res = await generateAiVisualization({
      visualizationId: viz.id,
      propertyType,
      style,
      renovationLevel,
      userPrompt,
      idempotencyKey,
      parentId: variantParentId,
    });
    if (!res || 'message' in res) {
      generatingRef.current = false;
      setGenError(res && 'message' in res ? res.message : 'Generování nelze spustit.');
      setStep('error');
      return;
    }
    setViz(res);
    persistActiveVisualizationId(res.id);
    startPoll(res.id);
  };

  const handleDownload = async () => {
    if (!viz) return;
    trackAiVisualizationEvent({ eventName: 'ai_visualization_download_click', visualizationId: viz.id });
    if (!isAuthenticated) {
      trackAiVisualizationEvent({ eventName: 'ai_visualization_login_required', visualizationId: viz.id });
      setLoginModal(true);
      return;
    }
    const ok = await downloadAiVisualization(viz.id);
    if (ok) trackAiVisualizationEvent({ eventName: 'ai_visualization_download', visualizationId: viz.id });
  };

  const handleShare = async () => {
    if (!viz) return;
    const res = await enableAiVisualizationShare(viz.id);
    if (!res?.publicShareId) return;
    const url = `${window.location.origin}/ai-vizualizace/v/${res.publicShareId}`;
    setShareUrl(url);
    trackAiVisualizationEvent({ eventName: 'ai_visualization_share', visualizationId: viz.id });
    if (navigator.share) {
      try {
        await navigator.share({ title: 'AI vizualizace XXREALIT', url });
        return;
      } catch {
        /* fallback copy */
      }
    }
    await navigator.clipboard.writeText(url);
  };

  const progress = viz?.progress ?? 0;

  const propertyTypeLabel = useMemo(() => {
    const found = config?.propertyTypes?.find((p) => p.id === (viz?.propertyType ?? propertyType));
    return found ? `${found.emoji} ${found.label}` : propertyType;
  }, [config?.propertyTypes, viz?.propertyType, propertyType]);

  const styleLabel = useMemo(() => {
    return config?.styles?.find((s) => s.id === (viz?.style ?? style))?.label ?? style;
  }, [config?.styles, viz?.style, style]);

  const stickyCta = useMemo(() => {
    if (step === 'configure') {
      return (
        <button
          type="button"
          onClick={() => void runGenerate()}
          className="w-full rounded-2xl bg-orange-600 py-4 text-base font-bold text-white shadow-lg hover:bg-orange-700"
        >
          ✨ Vytvořit vizualizaci
        </button>
      );
    }
    if (step === 'result') {
      return (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              setStep('configure');
              void runGenerate(viz?.id);
            }}
            className="flex-1 rounded-2xl border-2 border-orange-200 bg-white py-3 text-sm font-bold text-orange-700"
          >
            ✨ Jiná varianta
          </button>
          <button
            type="button"
            onClick={() => void handleShare()}
            className="flex-1 rounded-2xl bg-zinc-900 py-3 text-sm font-bold text-white"
          >
            🔗 Sdílet
          </button>
          <button
            type="button"
            onClick={() => void handleDownload()}
            className="flex-1 rounded-2xl bg-orange-600 py-3 text-sm font-bold text-white"
          >
            ⬇ Stáhnout
          </button>
        </div>
      );
    }
    return null;
  }, [step, viz?.id, propertyType, style, renovationLevel, userPrompt]);

  if (config && !config.enabled) {
    return (
      <p className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-zinc-600">
        AI vizualizace je dočasně vypnutá.
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-lg pb-32 md:max-w-2xl">
      {step === 'upload' ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm">
          <p className="text-center text-sm text-zinc-600">Nahrajte fotografii místnosti, domu nebo bytu.</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50 px-4 py-8 text-center hover:border-orange-400">
              <span className="text-3xl">📷</span>
              <span className="mt-2 text-sm font-bold text-zinc-900">Vyfotit</span>
              <input
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

      {step === 'configure' && viz?.originalPreviewUrl ? (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-zinc-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={viz.originalPreviewUrl} alt="Nahraná fotografie" className="max-h-72 w-full object-cover" />
          </div>
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
      ) : null}

      {step === 'generating' ? (
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-bold text-zinc-900">{progressStepLabel(progress)}</p>
          <p className="mt-2 text-3xl font-bold text-orange-600">{progress} %</p>
          <div className="mx-auto mt-6 h-2 max-w-xs overflow-hidden rounded-full bg-zinc-100">
            <div className="h-full bg-orange-600 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {step === 'result' && viz?.originalPreviewUrl && viz.resultPreviewUrl ? (
        <>
          <BeforeAfterSlider beforeUrl={viz.originalPreviewUrl} afterUrl={viz.resultPreviewUrl} />
          <AiRenovationFunnel
            viz={viz}
            config={config}
            propertyTypeLabel={propertyTypeLabel}
            styleLabel={styleLabel}
          />
        </>
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

      {stickyCta ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 p-4 backdrop-blur"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-lg md:max-w-2xl">{stickyCta}</div>
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
                href={`/prihlaseni?redirect=${encodeURIComponent('/ai-vizualizace')}`}
                className="rounded-xl bg-orange-600 py-3 text-center text-sm font-bold text-white"
              >
                Přihlásit se
              </Link>
              <Link
                href={`/registrace?redirect=${encodeURIComponent('/ai-vizualizace')}`}
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
    </div>
  );
}
