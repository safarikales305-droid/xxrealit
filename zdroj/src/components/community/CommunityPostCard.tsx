'use client';

import { Heart, MessageCircle, Pencil, ThumbsDown, Trash2, Volume2, VolumeX } from 'lucide-react';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { absoluteShareUrl } from '@/lib/public-share-url';
import { ShareButtons } from '@/components/share/ShareButtons';
import type { ListingPost, PostComment } from '@/lib/nest-client';

export type CommunityPostCardProps = {
  post: ListingPost;
  currentUserId: string | undefined;
  isAuthenticated: boolean;
  liked: boolean;
  disliked: boolean;
  likeCount: number;
  dislikeCount: number;
  muted: boolean;
  editingPostId: string | null;
  editingText: string;
  commentsOpen: boolean;
  comments: PostComment[];
  commentInput: string;
  onToggleReaction: (type: 'LIKE' | 'DISLIKE') => void;
  onToggleComments: () => void;
  onCommentInput: (v: string) => void;
  onSendComment: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onChangeEditingText: (v: string) => void;
  onToggleMute: () => void;
  onOpenDetail: () => void;
};

export function CommunityPostCard({
  post: p,
  currentUserId,
  isAuthenticated,
  liked,
  disliked,
  likeCount,
  dislikeCount,
  muted,
  editingPostId,
  editingText,
  commentsOpen,
  comments,
  commentInput,
  onToggleReaction,
  onToggleComments,
  onCommentInput,
  onSendComment,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onChangeEditingText,
  onToggleMute,
  onOpenDetail,
}: CommunityPostCardProps) {
  const id = String(p.id ?? '');
  const media = (p.media ?? []).slice().sort((a, b) => a.order - b.order);
  if (media.length === 0) return null;

  const firstVideo = media.find((m) => m.type === 'video');
  const firstImage = media.find((m) => m.type === 'image');
  const videoRaw = String(firstVideo?.url ?? '').trim();
  const imageRaw = String(firstImage?.url ?? '').trim();
  const showFeedVideo = Boolean(videoRaw);
  const showFeedImage = !showFeedVideo && Boolean(imageRaw);
  const isPostType = p.type === 'post' || !p.type;
  const shareTitle =
    (p.title ?? '').trim().slice(0, 120) ||
    (p.description ?? '').trim().slice(0, 80) ||
    'Příspěvek';
  const shareUrl = absoluteShareUrl(`/prispevky/${encodeURIComponent(id)}`);

  const author =
    String(p.user?.name ?? p.user?.email ?? 'Autor').trim() || 'Autor';
  const isOwner = String(p.user?.id ?? '') === String(currentUserId ?? '');

  return (
    <article className="relative w-full overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      {isOwner ? (
        <div className="absolute right-3 top-3 z-10 flex gap-1.5">
          <button
            type="button"
            onClick={onStartEdit}
            className="flex size-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm shadow-sm text-zinc-700"
            aria-label="Upravit příspěvek"
            title="Upravit"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex size-8 items-center justify-center rounded-xl border border-zinc-200 bg-white text-sm shadow-sm text-red-600"
            aria-label="Smazat příspěvek"
            title="Smazat"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : null}

      <p className="px-3 pt-3 text-xs font-medium text-zinc-500 md:px-4 md:pt-4">
        {author}
      </p>
      {Number.isFinite(p.distanceKm) ? (
        <p className="px-3 pt-1 text-[11px] font-medium text-zinc-500 md:px-4">
          {Number(p.distanceKm).toFixed(1)} km od vás
        </p>
      ) : null}

      {editingPostId === id ? (
        <div className="mt-2 px-3 pb-2 md:px-4">
          <textarea
            value={editingText}
            onChange={(e) => onChangeEditingText(e.target.value)}
            rows={1}
            onInput={(e) => {
              e.currentTarget.style.height = 'auto';
              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
            }}
            className="w-full resize-none overflow-hidden rounded-xl border border-zinc-200 p-2 text-sm"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={onSaveEdit}
              className="rounded-xl bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white"
            >
              Uložit
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              className="rounded-xl border border-zinc-200 px-3 py-1.5 text-xs"
            >
              Zrušit
            </button>
          </div>
        </div>
      ) : null}

      {showFeedImage ? (
        <button
          type="button"
          className="mt-3 block w-full text-left"
          onClick={onOpenDetail}
        >
          <div className="relative w-full overflow-hidden rounded-2xl bg-black">
            <img
              src={nestAbsoluteAssetUrl(imageRaw)}
              alt=""
              className="h-auto w-full object-contain"
            />
          </div>
        </button>
      ) : null}

      {showFeedVideo ? (
        <button
          type="button"
          className="mt-3 block w-full text-left"
          onClick={onOpenDetail}
        >
          <div className="relative w-full overflow-hidden rounded-2xl bg-black">
            <video
              src={nestAbsoluteAssetUrl(videoRaw)}
              playsInline
              muted={muted}
              controls
              preload="metadata"
              className="h-auto w-full object-contain"
            />
            {!isPostType ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3 text-white">
                <p className="text-sm">{String(p.title ?? '')}</p>
                <p className="text-lg font-bold">
                  <span className={!isAuthenticated ? 'blur-sm' : ''}>
                    {Number(p.price ?? 0).toLocaleString('cs-CZ')} Kč
                  </span>
                </p>
                <p className="text-xs">{String(p.city ?? '')}</p>
              </div>
            ) : null}
          </div>
        </button>
      ) : null}

      {editingPostId !== id ? (
        <div className="px-3 py-2">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
            {String(p.description ?? '')}
          </p>
        </div>
      ) : null}

      {showFeedVideo ? (
        <div className="px-3">
          <button
            type="button"
            onClick={onToggleMute}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600"
          >
            {muted ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
            {muted ? 'Zapnout zvuk' : 'Ztlumit'}
          </button>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 px-3 pb-3 md:px-4 md:pb-4">
        <button
          type="button"
          onClick={() => onToggleReaction('LIKE')}
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-sm ${
            liked
              ? 'border-rose-200 bg-rose-50 text-rose-600'
              : 'border-zinc-200 bg-white text-zinc-600'
          }`}
        >
          <Heart className="size-4" />
          <span>{likeCount}</span>
        </button>
        <button
          type="button"
          onClick={() => onToggleReaction('DISLIKE')}
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-2 text-sm ${
            disliked
              ? 'border-slate-300 bg-slate-100 text-slate-700'
              : 'border-zinc-200 bg-white text-zinc-600'
          }`}
        >
          <ThumbsDown className="size-4" />
          <span>{dislikeCount}</span>
        </button>
        <button
          type="button"
          onClick={onToggleComments}
          className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
        >
          <MessageCircle className="size-4" />
          {comments.length || Number(p._count?.comments ?? 0)}
        </button>
        <ShareButtons title={shareTitle} url={shareUrl} variant="pill" label="Sdílet" />
      </div>

      {commentsOpen ? (
        <div className="mx-3 mb-3 space-y-2 rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 md:mx-4">
          <div className="flex items-center gap-2">
            <input
              value={commentInput}
              onChange={(e) => onCommentInput(e.target.value)}
              placeholder="Napsat komentář..."
              className="h-9 flex-1 rounded-lg border border-zinc-200 bg-white px-2 text-sm outline-none"
            />
            <button
              type="button"
              onClick={onSendComment}
              className="h-9 rounded-lg bg-orange-500 px-3 text-xs font-semibold text-white"
            >
              Odeslat
            </button>
          </div>
          <div className="space-y-2">
            {comments.map((c) => (
              <div key={c.id} className="rounded-lg bg-white px-2 py-1.5">
                <p className="text-xs font-semibold text-zinc-700">
                  {c.user?.name || c.user?.email || 'Uživatel'}
                </p>
                <p className="text-sm text-zinc-800">{c.content}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </article>
  );
}
