'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

export type ImageCrop = { x: number; y: number; zoom: number };

type Props = {
  open: boolean;
  title: string;
  imageUrl: string | null;
  aspect: 'square' | 'cover';
  initialCrop?: ImageCrop | null;
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

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

export function ImageCropEditorModal({
  open,
  title,
  imageUrl,
  aspect,
  initialCrop,
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

  useEffect(() => {
    if (!open) return;
    setCrop({
      x: initialCrop?.x ?? 0,
      y: initialCrop?.y ?? 0,
      zoom: initialCrop?.zoom ?? 1,
    });
  }, [open, initialCrop?.x, initialCrop?.y, initialCrop?.zoom]);

  const frameClass =
    aspect === 'square'
      ? 'mx-auto h-64 w-64 rounded-full'
      : 'mx-auto h-44 w-full max-w-2xl rounded-2xl';

  const style = useMemo(() => imageCropToStyle(crop), [crop]);

  if (!open || !imageUrl) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-zinc-700 bg-zinc-900 p-4 text-white shadow-2xl">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-xs text-zinc-300">Posuňte obrázek myší/prstem a nastavte přiblížení.</p>
        <div
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
          <img src={imageUrl} alt="" className="h-full w-full object-cover transition-transform" style={style} />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
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
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onSave(crop)}
            className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
          >
            Uložit výřez
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-zinc-500 px-4 py-2 text-sm font-semibold"
          >
            Zrušit
          </button>
        </div>
      </div>
    </div>
  );
}
