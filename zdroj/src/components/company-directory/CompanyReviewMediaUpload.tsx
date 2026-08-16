'use client';

import { useCallback, useRef, useState } from 'react';
import { ImagePlus, Loader2, Video, X } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';

export type ReviewMediaItem = {
  id: string;
  type: 'IMAGE' | 'VIDEO';
  url: string;
  thumbnailUrl?: string | null;
  mimeType?: string | null;
  fileName?: string;
  fileSize?: number;
  previewUrl?: string;
  uploadProgress?: number;
};

type Props = {
  images: ReviewMediaItem[];
  videos: ReviewMediaItem[];
  onChange: (next: { images: ReviewMediaItem[]; videos: ReviewMediaItem[] }) => void;
  disabled?: boolean;
};

const MAX_IMAGES = 10;
const MAX_VIDEOS = 3;

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm']);

export function CompanyReviewMediaUpload({ images, videos, onChange, disabled }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File, localId: string) => {
    if (!API_BASE_URL) throw new Error('API není dostupné.');
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`${API_BASE_URL}/company-directory/public/reviews/media`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message ?? 'Upload selhal.');
    }
    return (await res.json()) as {
      type: 'IMAGE' | 'VIDEO';
      url: string;
      thumbnailUrl?: string | null;
      mimeType?: string;
      fileName?: string;
      fileSize?: number;
    };
  }, []);

  const handleFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length || disabled || uploading) return;
      setUploading(true);
      const nextImages = [...images];
      const nextVideos = [...videos];
      const files = Array.from(fileList);

      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const isImage = IMAGE_TYPES.has(file.type);
          const isVideo = VIDEO_TYPES.has(file.type);
          if (!isImage && !isVideo) continue;
          if (isImage && nextImages.length >= MAX_IMAGES) continue;
          if (isVideo && nextVideos.length >= MAX_VIDEOS) continue;

          const localId = `local-${Date.now()}-${i}`;
          const previewUrl = URL.createObjectURL(file);
          setUploadLabel(
            isImage
              ? `Fotografie ${nextImages.length + 1}/${MAX_IMAGES}`
              : `Video ${nextVideos.length + 1}/${MAX_VIDEOS}`,
          );

          const uploaded = await uploadFile(file, localId);
          const item: ReviewMediaItem = {
            id: localId,
            type: uploaded.type,
            url: uploaded.url,
            thumbnailUrl: uploaded.thumbnailUrl,
            mimeType: uploaded.mimeType ?? file.type,
            fileName: file.name,
            fileSize: file.size,
            previewUrl,
            uploadProgress: 100,
          };

          if (uploaded.type === 'VIDEO') nextVideos.push(item);
          else nextImages.push(item);
          onChange({ images: nextImages, videos: nextVideos });
        }
      } finally {
        setUploading(false);
        setUploadLabel(null);
      }
    },
    [disabled, images, onChange, uploadFile, uploading, videos],
  );

  function removeItem(type: 'IMAGE' | 'VIDEO', id: string) {
    if (type === 'IMAGE') {
      onChange({ images: images.filter((x) => x.id !== id), videos });
    } else {
      onChange({ images, videos: videos.filter((x) => x.id !== id) });
    }
  }

  return (
    <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 p-4">
      <h4 className="text-sm font-semibold text-zinc-900">Fotografie a video</h4>
      <p className="mt-1 text-xs text-zinc-600">
        Přidejte fotografie nebo video související s vaší zkušeností s firmou.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || uploading || images.length >= MAX_IMAGES}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          <ImagePlus className="size-4" />
          Přidat fotografie
        </button>
        <button
          type="button"
          disabled={disabled || uploading || videos.length >= MAX_VIDEOS}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Video className="size-4" />
          Přidat video
        </button>
      </div>

      <div
        className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-6 text-center text-xs text-zinc-500"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void handleFiles(e.dataTransfer.files);
        }}
      >
        nebo přetáhněte soubory sem
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        multiple
        className="hidden"
        onChange={(e) => void handleFiles(e.target.files)}
      />

      {uploading ? (
        <div className="mt-3 text-sm text-zinc-700">
          <p className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            Nahrávám média… {uploadLabel}
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-orange-500" />
          </div>
        </div>
      ) : null}

      {(images.length > 0 || videos.length > 0) && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((img) => (
            <div key={img.id} className="relative overflow-hidden rounded-lg border bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.previewUrl ?? img.url}
                alt=""
                className="aspect-square w-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeItem('IMAGE', img.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                aria-label="Odebrat"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {videos.map((vid) => (
            <div key={vid.id} className="relative overflow-hidden rounded-lg border bg-white p-2">
              <video
                src={vid.url}
                controls
                playsInline
                preload="metadata"
                className="aspect-video w-full rounded bg-black"
              />
              <p className="mt-1 truncate text-[10px] text-zinc-500">
                {vid.fileName ?? 'Video'}
                {vid.fileSize ? ` · ${Math.round(vid.fileSize / 1024)} KB` : ''}
              </p>
              <button
                type="button"
                onClick={() => removeItem('VIDEO', vid.id)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                aria-label="Odebrat"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
