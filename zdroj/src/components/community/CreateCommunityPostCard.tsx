'use client';

import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Send, Video } from 'lucide-react';
import { API_BASE_URL } from '@/lib/api';
import { extractFirstUrl } from '@/lib/extract-first-url';
import { buildClientLinkPreviewFallback } from '@/lib/link-preview-client';
import {
  nestApiConfigured,
  nestFetchLinkPreview,
  nestFetchMe,
  nestFetchPostSounds,
  type LinkPreviewResponse,
  type PostSoundTrackDto,
} from '@/lib/nest-client';
import { enqueuePostUpload } from '@/lib/post-upload-queue';
import {
  canUserPublishPosts,
  POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG,
} from '@/lib/post-publish-eligibility';
import { PostUploadProgress } from '@/components/community/PostUploadProgress';
import { LinkPreviewCard } from '@/components/community/LinkPreviewCard';
import { captureFileVideoPoster } from '@/lib/video-poster';

type Category =
  | 'MAKLERI'
  | 'STAVEBNI_FIRMY'
  | 'REALITNI_KANCELARE'
  | 'FINANCNI_PORADCI'
  | 'INVESTORI';

type Props = {
  apiAccessToken: string | null;
  activeCategory: Category;
  latitude?: number;
  longitude?: number;
  onPublished: () => void | Promise<void>;
};

const PREVIEW_MAX_WAIT_MS = 8_000;

export function CreateCommunityPostCard({
  apiAccessToken,
  activeCategory,
  latitude,
  longitude,
  onPublished,
}: Props) {
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoPoster, setVideoPoster] = useState<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<LinkPreviewResponse | null>(null);
  const [linkPreviewLoading, setLinkPreviewLoading] = useState(false);
  const [linkPreviewFailed, setLinkPreviewFailed] = useState(false);
  const [linkPreviewDismissed, setLinkPreviewDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [postSounds, setPostSounds] = useState<PostSoundTrackDto[]>([]);
  const [selectedSoundId, setSelectedSoundId] = useState('');
  const [soundsLoading, setSoundsLoading] = useState(false);
  const [publishAllowed, setPublishAllowed] = useState<boolean | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRequestIdRef = useRef(0);

  const detectedUrl = extractFirstUrl(description);

  useEffect(() => {
    if (!apiAccessToken || !nestApiConfigured()) {
      setPublishAllowed(false);
      return;
    }
    let cancelled = false;
    void nestFetchMe(apiAccessToken).then((me) => {
      if (cancelled) return;
      setPublishAllowed(canUserPublishPosts(me));
    });
    return () => {
      cancelled = true;
    };
  }, [apiAccessToken]);

  useEffect(() => {
    if (!videoFile) {
      setSelectedSoundId('');
      return;
    }
    let cancelled = false;
    setSoundsLoading(true);
    void nestFetchPostSounds(apiAccessToken).then((rows) => {
      if (cancelled) return;
      setPostSounds(rows);
      setSoundsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [videoFile]);

  const ALLOWED_VIDEO_TYPES = new Set([
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
  ]);

  function isAllowedVideoFile(file: File): boolean {
    const mime = (file.type || '').toLowerCase();
    if (ALLOWED_VIDEO_TYPES.has(mime) || mime.startsWith('video/')) return true;
    const name = file.name.toLowerCase();
    return name.endsWith('.mp4') || name.endsWith('.mov') || name.endsWith('.webm');
  }

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const u = URL.createObjectURL(imageFile);
    setImagePreview(u);
    return () => URL.revokeObjectURL(u);
  }, [imageFile]);

  useEffect(() => {
    if (!videoFile) {
      setVideoPreview(null);
      setVideoPoster(null);
      return;
    }
    const u = URL.createObjectURL(videoFile);
    setVideoPreview(u);
    let cancelled = false;
    void captureFileVideoPoster(videoFile, 1).then((poster) => {
      if (!cancelled && poster) setVideoPoster(poster);
    });
    return () => {
      cancelled = true;
      URL.revokeObjectURL(u);
    };
  }, [videoFile]);

  useEffect(() => {
    if (imageFile || videoFile || linkPreviewDismissed || !apiAccessToken || !detectedUrl) {
      if (!detectedUrl) {
        setLinkPreview(null);
        setLinkPreviewLoading(false);
        setLinkPreviewFailed(false);
      }
      return;
    }
    if (linkPreview?.url === detectedUrl && !linkPreview.failed) return;

    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    setLinkPreviewFailed(false);

    const debounce = window.setTimeout(() => {
      // eslint-disable-next-line no-console
      console.log('LINK PREVIEW START', detectedUrl);
      setLinkPreviewLoading(true);

      const hardStop = window.setTimeout(() => {
        if (previewRequestIdRef.current !== requestId) return;
        setLinkPreviewLoading(false);
        setLinkPreviewFailed(true);
        setLinkPreview((prev) => prev ?? buildClientLinkPreviewFallback(detectedUrl));
      }, PREVIEW_MAX_WAIT_MS);

      void nestFetchLinkPreview(apiAccessToken, detectedUrl).then((r) => {
        if (previewRequestIdRef.current !== requestId) return;
        window.clearTimeout(hardStop);
        setLinkPreviewLoading(false);

        if (r.ok) {
          // eslint-disable-next-line no-console
          console.log('LINK PREVIEW RESULT', r.preview);
          setLinkPreview(r.preview);
          setLinkPreviewFailed(Boolean(r.preview.failed));
          return;
        }

        // eslint-disable-next-line no-console
        console.log('LINK PREVIEW RESULT', { error: r.error });
        const fallback = buildClientLinkPreviewFallback(detectedUrl);
        setLinkPreview(fallback);
        setLinkPreviewFailed(true);
      });
    }, 600);

    return () => window.clearTimeout(debounce);
  }, [
    detectedUrl,
    imageFile,
    videoFile,
    linkPreviewDismissed,
    apiAccessToken,
    linkPreview?.url,
    linkPreview?.failed,
  ]);

  function clearMedia() {
    setImageFile(null);
    setVideoFile(null);
    setError(null);
    if (imageInputRef.current) imageInputRef.current.value = '';
    if (videoInputRef.current) videoInputRef.current.value = '';
  }

  function clearLinkPreview() {
    setLinkPreview(null);
    setLinkPreviewDismissed(true);
    setLinkPreviewLoading(false);
    setLinkPreviewFailed(false);
    previewRequestIdRef.current += 1;
  }

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Vyberte obrázek.');
      e.target.value = '';
      return;
    }
    if (f.size > 300 * 1024 * 1024) {
      setError('Maximální velikost souboru je 300 MB.');
      e.target.value = '';
      return;
    }
    setVideoFile(null);
    clearLinkPreview();
    if (videoInputRef.current) videoInputRef.current.value = '';
    setImageFile(f);
  }

  function onPickVideo(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    if (!isAllowedVideoFile(f)) {
      setError('Podporovaná videa: MP4, MOV, WebM.');
      e.target.value = '';
      return;
    }
    if (f.size > 300 * 1024 * 1024) {
      setError('Maximální velikost souboru je 300 MB.');
      e.target.value = '';
      return;
    }
    setImageFile(null);
    clearLinkPreview();
    if (imageInputRef.current) imageInputRef.current.value = '';
    setVideoFile(f);
  }

  function resolvePreviewForSubmit(): LinkPreviewResponse | null {
    if (linkPreviewDismissed || !detectedUrl) return null;
    return linkPreview ?? buildClientLinkPreviewFallback(detectedUrl);
  }

  useEffect(() => {
    const handler = () => {
      void onPublished();
    };
    window.addEventListener('xxrealit:post-upload-published', handler);
    return () => window.removeEventListener('xxrealit:post-upload-published', handler);
  }, [onPublished]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const text = description.trim();
    const urlInText = detectedUrl;
    const previewForPost = resolvePreviewForSubmit();

    if (!nestApiConfigured() || !apiAccessToken) {
      setError('Přihlaste se a nastavte API.');
      return;
    }
    if (publishAllowed === false) {
      setError(POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG);
      return;
    }
    if (!text && !imageFile && !videoFile && !urlInText) {
      setError('Napište text nebo přidejte foto / video.');
      return;
    }

    setLoading(true);
    try {
      if (imageFile || videoFile) {
        const titleBase = text.slice(0, 80) || 'Komunitní příspěvek';
        await enqueuePostUpload({
          accessToken: apiAccessToken,
          videoFile,
          imageFile,
          payload: {
            title: titleBase,
            description: text || ' ',
            price: null,
            city: 'Komunita',
            type: 'post',
            category: activeCategory,
            latitude: Number.isFinite(latitude) ? latitude : undefined,
            longitude: Number.isFinite(longitude) ? longitude : undefined,
            soundTrackId: selectedSoundId || undefined,
            imageOrder: imageFile ? [`${imageFile.name}::${imageFile.size}`] : [],
            hasVideo: Boolean(videoFile),
            hasImage: Boolean(imageFile),
          },
        });
        setDescription('');
        clearMedia();
        setLinkPreview(null);
        setLinkPreviewDismissed(false);
        setLinkPreviewFailed(false);
        setLinkPreviewLoading(false);
        previewRequestIdRef.current += 1;
        setSelectedSoundId('');
        return;
      } else {
        const postsBase = API_BASE_URL.endsWith('/api')
          ? API_BASE_URL
          : `${API_BASE_URL}/api`;

        const payload = {
          text,
          content: text,
          description: text,
          category: activeCategory,
          ...(urlInText
            ? {
                externalUrl: previewForPost?.url ?? urlInText,
                previewTitle: previewForPost?.title ?? undefined,
                previewDescription: previewForPost?.description ?? undefined,
                previewImage: previewForPost?.image ?? undefined,
                previewSiteName: previewForPost?.siteName ?? undefined,
              }
            : {}),
        };

        // eslint-disable-next-line no-console
        console.log('POST SUBMIT PAYLOAD', payload);

        const postRes = await fetch(`${postsBase}/posts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiAccessToken}`,
          },
          body: JSON.stringify(payload),
        });

        const responseBody = await postRes.json().catch(() => null);
        // eslint-disable-next-line no-console
        console.log('POST SUBMIT RESPONSE', {
          status: postRes.status,
          ok: postRes.ok,
          body: responseBody,
        });

        if (!postRes.ok) {
          const msg =
            responseBody &&
            typeof responseBody === 'object' &&
            'message' in responseBody &&
            typeof (responseBody as { message?: unknown }).message === 'string'
              ? (responseBody as { message: string }).message
              : 'Odeslání příspěvku selhalo';
          setError(msg);
          return;
        }
      }

      setDescription('');
      clearMedia();
      setLinkPreview(null);
      setLinkPreviewDismissed(false);
      setLinkPreviewFailed(false);
      setLinkPreviewLoading(false);
      previewRequestIdRef.current += 1;
      setSelectedSoundId('');
      await onPublished();
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = Boolean(
    publishAllowed &&
      (description.trim() || imageFile || videoFile || detectedUrl),
  );

  const formDisabled = publishAllowed === false;

  const showLinkCard =
    Boolean(linkPreview) && !imageFile && !videoFile && !linkPreviewDismissed;

  return (
    <>
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="w-full rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      {formDisabled ? (
        <p
          className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          role="status"
        >
          {POST_PUBLISH_REQUIRES_PUBLIC_PROFILE_MSG}
        </p>
      ) : null}
      <textarea
        ref={textareaRef}
        rows={1}
        value={description}
        disabled={formDisabled}
        onChange={(e) => {
          setLinkPreviewDismissed(false);
          setDescription(e.target.value);
        }}
        onInput={(e) => {
          e.currentTarget.style.height = 'auto';
          e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
        }}
        placeholder="Co máte nového?"
        className="min-h-[44px] w-full resize-none overflow-hidden rounded-2xl border border-slate-200 bg-zinc-50/80 p-3 text-sm outline-none transition focus:border-orange-300 focus:bg-white focus:ring-2 focus:ring-orange-500/15"
      />

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Přidat fotku"
        onChange={onPickImage}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        className="sr-only"
        aria-label="Přidat video"
        onChange={onPickVideo}
      />

      {linkPreviewLoading && !imageFile && !videoFile ? (
        <p className="mt-3 text-sm text-zinc-500">Načítám náhled odkazu…</p>
      ) : null}

      {linkPreviewFailed && !linkPreviewLoading ? (
        <p className="mt-3 text-sm text-amber-800">
          Náhled se nepodařilo načíst, příspěvek bude publikován s odkazem.
        </p>
      ) : null}

      {showLinkCard && linkPreview ? (
        <LinkPreviewCard preview={linkPreview} onRemove={clearLinkPreview} />
      ) : null}

      {(videoPreview || imagePreview) && (
        <div className="mt-3 overflow-hidden rounded-2xl border border-zinc-200 bg-black/5">
          {videoPreview ? (
            <video
              src={videoPreview}
              poster={videoPoster ?? undefined}
              muted
              playsInline
              controls
              preload="metadata"
              className="mx-auto max-h-[min(70vh,720px)] w-full max-w-[720px] object-contain"
            />
          ) : (
            <img src={imagePreview ?? ''} alt="" className="max-h-64 w-full object-contain" />
          )}
          {videoPreview ? (
            <div className="border-t border-zinc-100 bg-white px-3 py-2">
              <label className="text-xs font-semibold text-zinc-600">Zvuk k videu</label>
              {soundsLoading ? (
                <p className="mt-1 text-xs text-zinc-500">Načítám zvuky…</p>
              ) : (
                <select
                  value={selectedSoundId}
                  onChange={(e) => setSelectedSoundId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 px-2 py-1.5 text-sm"
                >
                  <option value="">Bez zvuku</option>
                  {postSounds.map((sound) => (
                    <option key={sound.id} value={sound.id}>
                      {sound.title}
                      {sound.artist ? ` — ${sound.artist}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : null}
          <div className="flex justify-end border-t border-zinc-100 bg-white px-2 py-1">
            <button
              type="button"
              onClick={clearMedia}
              className="text-xs font-semibold text-red-600 hover:underline"
            >
              Odebrat médium
            </button>
          </div>
        </div>
      )}

      {error ? (
        <p className="mt-2 text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => imageInputRef.current?.click()}
            disabled={formDisabled || Boolean(videoFile)}
            className="inline-flex size-10 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-orange-600 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Přidat fotku"
            title="Fotka"
          >
            <ImageIcon className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => videoInputRef.current?.click()}
            disabled={formDisabled || Boolean(imageFile)}
            className="inline-flex size-10 items-center justify-center rounded-2xl border border-zinc-200 bg-zinc-50 text-orange-600 transition hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Přidat video"
            title="Video"
          >
            <Video className="size-5" />
          </button>
        </div>
        <button
          type="submit"
          disabled={loading || !canSubmit || publishAllowed !== true}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50"
        >
          <Send className="size-4" />
          {loading ? 'Publikuji…' : 'Publikovat'}
        </button>
      </div>
    </form>
    <PostUploadProgress />
    </>
  );
}
