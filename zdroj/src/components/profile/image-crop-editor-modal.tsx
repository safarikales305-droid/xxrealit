'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

export type ImageCrop = { x: number; y: number; zoom: number };

type Props = {
  open: boolean;
  title: string;
  imageUrl: string | null;
  aspect: 'square' | 'cover';
  initialCrop?: ImageCrop | null;
  fitWholeOnOpen?: boolean;
  onCancel: () => void;
  onSave: (crop: ImageCrop) => void;
};

export function imageCropToStyle(crop?: ImageCrop | null): CSSProperties {
  const x = crop?.x ?? 0;
  const y = crop?.y ?? 0;
  const zoom = crop?.zoom ?? 1;
  return {
    objectPosition: `${50 + x}% ${50 + y}%`,
    transform: `scale(${zoom})`,
    transformOrigin: 'center center',
  };
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 3;

export function ImageCropEditorModal({
  open,
  title,
  imageUrl,
  aspect,
  initialCrop,
  fitWholeOnOpen,
  onCancel,
  onSave,
}: Props) {
  const [crop, setCrop] = useState<ImageCrop>(() => ({
    x: initialCrop?.x ?? 0,
    y: initialCrop?.y ?? 0,
    zoom: initialCrop?.zoom ?? 1,
  }));
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fitRetryRafRef = useRef<number | null>(null);
  const applyFitWholeCrop = useCallback((img: HTMLImageElement | null) => {
    if (!fitWholeOnOpen) return;
    const frame = frameRef.current;
    if (!frame || !img) return;
    if (!img.naturalWidth || !img.naturalHeight) return;
    const frameW = frame.clientWidth;
    const frameH = frame.clientHeight;
    if (!frameW || !frameH) return;

    // Base renderer uses object-cover, so for full visibility we must counter-scale by contain/cover.
    const coverScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight);
    const containScale = Math.min(frameW / img.naturalWidth, frameH / img.naturalHeight);
    const fitZoom = containScale / Math.max(coverScale, 0.0001);
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(fitZoom.toFixed(4))));
    setCrop({ x: 0, y: 0, zoom: nextZoom });
  }, [fitWholeOnOpen]);

  const fitWholeNow = useCallback((img: HTMLImageElement | null): boolean => {
    const frame = frameRef.current;
    if (!frame || !img) return false;
    if (!img.naturalWidth || !img.naturalHeight) return false;
    const frameRect = frame.getBoundingClientRect();
    const frameW = Math.max(0, frameRect.width);
    const frameH = Math.max(0, frameRect.height);
    if (!frameW || !frameH) return false;

    // Renderer uses object-cover, so we counter-scale by contain/cover.
    const coverScale = Math.max(frameW / img.naturalWidth, frameH / img.naturalHeight);
    const containScale = Math.min(frameW / img.naturalWidth, frameH / img.naturalHeight);
    const fitZoom = containScale / Math.max(coverScale, 0.0001);
    const nextZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(fitZoom.toFixed(4))));
    setCrop({ x: 0, y: 0, zoom: nextZoom });
    return true;
  }, []);

  const scheduleFitWhole = useCallback((img: HTMLImageElement | null) => {
    if (!img) return;
    if (fitRetryRafRef.current != null) {
      cancelAnimationFrame(fitRetryRafRef.current);
      fitRetryRafRef.current = null;
    }
    let tries = 0;
    const tick = () => {
      tries += 1;
      const ok = fitWholeNow(img);
      if (!ok && tries < 12) {
        fitRetryRafRef.current = requestAnimationFrame(tick);
      } else {
        fitRetryRafRef.current = null;
      }
    };
    tick();
  }, [fitWholeNow]);

  useEffect(() => {
    if (fitRetryRafRef.current != null) {
      cancelAnimationFrame(fitRetryRafRef.current);
      fitRetryRafRef.current = null;
    }
    if (!open) return;
    if (fitWholeOnOpen) {
      const img = imageRef.current;
      if (img?.complete) {
        scheduleFitWhole(img);
      } else {
        setCrop({ x: 0, y: 0, zoom: 1 });
      }
      return;
    }
    setCrop({
      x: initialCrop?.x ?? 0,
      y: initialCrop?.y ?? 0,
      zoom: initialCrop?.zoom ?? 1,
    });
    return () => {
      if (fitRetryRafRef.current != null) {
        cancelAnimationFrame(fitRetryRafRef.current);
        fitRetryRafRef.current = null;
      }
    };
  }, [open, fitWholeOnOpen, initialCrop?.x, initialCrop?.y, initialCrop?.zoom, scheduleFitWhole]);

  const isCoverEditor = aspect === 'cover';
  const frameClass = isCoverEditor
    ? 'mx-auto h-[34vh] min-h-[230px] w-full max-w-6xl rounded-2xl sm:h-[42vh] sm:min-h-[300px] lg:h-[52vh] lg:min-h-[420px] lg:max-h-[620px]'
    : 'mx-auto h-64 w-64 rounded-full';
  const modalClass = isCoverEditor
    ? 'w-full max-w-[min(96vw,1320px)] rounded-2xl border border-zinc-700 bg-zinc-900 p-3 text-white shadow-2xl sm:p-5'
    : 'w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-white shadow-2xl';

  const style = useMemo(() => imageCropToStyle(crop), [crop]);

  if (!open || !imageUrl) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
      <div className={modalClass}>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-zinc-300">Posuňte obrázek myší/prstem a nastavte přiblížení.</p>
        <div
          ref={frameRef}
          className={`relative mt-4 touch-none overflow-hidden bg-black/40 ${frameClass}`}
          onPointerDown={(e) => {
            dragStartRef.current = { x: e.clientX, y: e.clientY };
          }}
          onPointerMove={(e) => {
            const start = dragStartRef.current;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            setCrop((prev) => ({
              ...prev,
              x: Math.max(-100, Math.min(100, prev.x + dx / 5)),
              y: Math.max(-100, Math.min(100, prev.y + dy / 5)),
            }));
          }}
          onPointerUp={() => {
            dragStartRef.current = null;
          }}
          onPointerLeave={() => {
            dragStartRef.current = null;
          }}
          onWheel={(e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.06 : 0.06;
            setCrop((prev) => ({
              ...prev,
              zoom: Math.max(
                MIN_ZOOM,
                Math.min(MAX_ZOOM, Number((prev.zoom + delta).toFixed(3))),
              ),
            }));
          }}
          onTouchStart={(e) => {
            if (e.touches.length === 2) {
              const [a, b] = [e.touches[0], e.touches[1]];
              if (!a || !b) return;
              const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
              pinchRef.current = { distance, zoom: crop.zoom };
              dragStartRef.current = null;
              return;
            }
            if (e.touches.length === 1) {
              const t = e.touches[0];
              if (!t) return;
              dragStartRef.current = { x: t.clientX, y: t.clientY };
            }
          }}
          onTouchMove={(e) => {
            if (e.touches.length === 2) {
              e.preventDefault();
              const [a, b] = [e.touches[0], e.touches[1]];
              const pinch = pinchRef.current;
              if (!a || !b || !pinch) return;
              const nextDistance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
              const ratio = nextDistance / Math.max(1, pinch.distance);
              setCrop((prev) => ({
                ...prev,
                zoom: Math.max(
                  MIN_ZOOM,
                  Math.min(MAX_ZOOM, Number((pinch.zoom * ratio).toFixed(3))),
                ),
              }));
              return;
            }
            if (e.touches.length === 1) {
              const t = e.touches[0];
              const start = dragStartRef.current;
              if (!t || !start) return;
              const dx = t.clientX - start.x;
              const dy = t.clientY - start.y;
              dragStartRef.current = { x: t.clientX, y: t.clientY };
              setCrop((prev) => ({
                ...prev,
                x: Math.max(-100, Math.min(100, prev.x + dx / 5)),
                y: Math.max(-100, Math.min(100, prev.y + dy / 5)),
              }));
            }
          }}
          onTouchEnd={() => {
            pinchRef.current = null;
            dragStartRef.current = null;
          }}
        >
          <img
            ref={imageRef}
            src={imageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform"
            style={style}
            onLoad={() => {
              if (fitWholeOnOpen) {
                scheduleFitWhole(imageRef.current);
                return;
              }
              applyFitWholeCrop(imageRef.current);
            }}
          />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 sm:gap-3">
          <label className="text-xs text-zinc-300">
            Zoom
            <input
              type="range"
              max={MAX_ZOOM}
              min={MIN_ZOOM}
              step={0.01}
              value={crop.zoom}
              onChange={(e) => setCrop((p) => ({ ...p, zoom: Number(e.target.value) }))}
              className="mt-1 w-full"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Posun X
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={crop.x}
              onChange={(e) => setCrop((p) => ({ ...p, x: Number(e.target.value) }))}
              className="mt-1 w-full"
            />
          </label>
          <label className="text-xs text-zinc-300">
            Posun Y
            <input
              type="range"
              min={-100}
              max={100}
              step={1}
              value={crop.y}
              onChange={(e) => setCrop((p) => ({ ...p, y: Number(e.target.value) }))}
              className="mt-1 w-full"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              scheduleFitWhole(imageRef.current);
            }}
            className="rounded-full border border-zinc-500 px-3 py-2 text-sm font-semibold sm:px-4"
          >
            Zobrazit celý obrázek
          </button>
          <button
            type="button"
            onClick={() => onSave(crop)}
            className="rounded-full bg-orange-500 px-3 py-2 text-sm font-semibold text-white sm:px-4"
          >
            Uložit výřez
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-zinc-500 px-3 py-2 text-sm font-semibold sm:px-4"
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}
