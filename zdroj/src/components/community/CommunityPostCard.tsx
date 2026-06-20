'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Heart, MessageCircle, Pencil, ThumbsDown, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { absoluteShareUrl } from '@/lib/public-share-url';
import { ShareButtons } from '@/components/share/ShareButtons';
import type { ListingPost, PostComment } from '@/lib/nest-client';
import { LinkPreviewCard, type LinkPreviewData } from '@/components/community/LinkPreviewCard';
import { FacebookPostMediaBlock } from '@/components/community/FacebookPostMediaBlock';
import { PostSoundAudio } from '@/components/community/PostSoundAudio';
import {
  isFacebookImportPost,
  resolveFacebookPostMedia,
} from '@/lib/facebook-post-media';

export type CommunityPostCardProps = {
  post: ListingPost;
  currentUserId: string | undefined;
  isAuthenticated: boolean;
  guestPreview?: boolean;
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
  guestPreview = false,
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
  const router = useRouter();
  const id = String(p.id ?? '');
  const resolvedMedia = resolveFacebookPostMedia(p);
  const shareTitle =
    (p.title ?? '').trim().slice(0, 120) ||
    (p.description ?? '').trim().slice(0, 80) ||
    'Příspěvek';
  const shareUrl = absoluteShareUrl(`/prispevky/${encodeURIComponent(id)}`);

  const externalUrl = String(p.externalUrl ?? '').trim();
  const linkPreview: LinkPreviewData | null = externalUrl
    ? {
        url: externalUrl,
        title: String(p.previewTitle ?? '').trim() || externalUrl,
        description: String(p.previewDescription ?? '').trim(),
        image: String(p.previewImage ?? '').trim(),
        siteName: String(p.previewSiteName ?? '').trim(),
      }
    : null;

  const authorId = String(p.user?.id ?? '').trim();
  const author = String(p.user?.name ?? 'Autor').trim() || 'Autor';
  const authorHref = authorId
    ? p.user?.profileHref ??
      (p.user?.role === 'AGENT' ? `/agent/${authorId}` : `/profile/${authorId}`)
    : null;
  const isOwner = authorId === String(currentUserId ?? '');
  const interactionsLocked = guestPreview || !isAuthenticated;
  const [shareHint, setShareHint] = useState<string | null>(null);

  function handleGuestShare() {
    setShareHint('Pro sdílení příspěvků se přihlaste.');
    const redirectPath =
      typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '/?tab=posts';
    window.setTimeout(() => {
      router.push(`/prihlaseni?redirect=${encodeURIComponent(redirectPath)}`);
    }, 400);
  }

  const isFacebookImport = isFacebookImportPost(p);
  const facebookLink = String(p.facebookPermalink ?? p.externalUrl ?? '').trim();
  const hasFeedMedia = resolvedMedia.mode !== 'none';
  const showNativeFeedVideo =
    resolvedMedia.mode === 'video' && !resolvedMedia.isFacebookVideo;
  const showMuteForVideo = showNativeFeedVideo && !p.soundTrack;
  const hasPostSound = Boolean(p.soundTrack?.fileUrl || p.soundTrack?.previewUrl);
  const postText = String(p.description ?? '').trim();

  const actionRow = (
    <div className="flex flex-wrap items-center gap-2 px-3 py-3 md:px-4">
      <button
        type="button"
        onClick={interactionsLocked ? undefined : () => onToggleReaction('LIKE')}
        disabled={interactionsLocked}
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
        onClick={interactionsLocked ? undefined : () => onToggleReaction('DISLIKE')}
        disabled={interactionsLocked}
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
        onClick={interactionsLocked ? undefined : onToggleComments}
        disabled={interactionsLocked}
        className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-600"
      >
        <MessageCircle className="size-4" />
        {comments.length || Number(p._count?.comments ?? 0)}
      </button>
      {interactionsLocked ? (
        <button
          type="button"
          onClick={handleGuestShare}
          className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700"
        >
          Sdílet
        </button>
      ) : (
        <ShareButtons title={shareTitle} url={shareUrl} variant="pill" label="Sdílet" />
      )}
    </div>
  );

  return (
    <article className="relative mx-auto w-full min-w-0 max-w-full overflow-hidden rounded-none border-x-0 border-b border-t-0 border-slate-200 bg-white sm:rounded-3xl sm:border sm:shadow-sm">
      {isOwner && !interactionsLocked ? (
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

      <div className="px-3 pt-3 md:px-4 md:pt-4">
        <p className="text-xs font-medium text-zinc-500">
          {authorHref ? (
            <Link href={authorHref} className="font-semibold text-zinc-800 hover:text-orange-600">
              {author}
            </Link>
          ) : (
            author
          )}
          {isFacebookImport ? (
            <span className="ml-2 inline-flex items-center rounded-full bg-[#1877F2]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1877F2]">
              Facebook
            </span>
          ) : null}
        </p>
        {isFacebookImport && facebookLink ? (
          <p className="pt-1">
            <a
              href={facebookLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-[#1877F2] hover:underline"
            >
              Otevřít na Facebooku
            </a>
          </p>
        ) : null}
        {Number.isFinite(p.distanceKm) ? (
          <p className="pt-1 text-[11px] font-medium text-zinc-500">
            {Number(p.distanceKm).toFixed(1)} km od vás
          </p>
        ) : null}
      </div>

      {editingPostId === id ? (
        <div className="px-3 pb-2 md:px-4">
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

      {editingPostId !== id && postText ? (
        <div className="px-3 pb-2 md:px-4">
          <p
            className={`whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 ${interactionsLocked ? 'blur-[3px]' : ''}`}
          >
            {postText}
          </p>
        </div>
      ) : null}

      {editingPostId !== id && linkPreview && !hasFeedMedia && !isFacebookImport ? (
        <div className={`px-3 pb-2 md:px-4 ${interactionsLocked ? 'pointer-events-none blur-sm' : ''}`}>
          <LinkPreviewCard preview={linkPreview} compact />
        </div>
      ) : null}

      {hasFeedMedia ? (
        <>
          <FacebookPostMediaBlock
            media={resolvedMedia}
            facebookPostType={p.facebookPostType ?? null}
            compact
            blurred={interactionsLocked}
            muted={showNativeFeedVideo ? (hasPostSound ? true : muted) : false}
            showMuteToggle={showMuteForVideo}
            onToggleMute={onToggleMute}
            onOpenDetail={interactionsLocked ? undefined : onOpenDetail}
            edgeToEdge
            className="mt-0"
          />
          {hasPostSound ? <PostSoundAudio soundTrack={p.soundTrack} /> : null}
        </>
      ) : null}

      {showMuteForVideo && !interactionsLocked ? (
        <div className="px-3 pb-1 md:px-4">
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

      {actionRow}
      {shareHint ? (
        <p className="px-3 pb-2 text-xs font-medium text-orange-700 md:px-4">{shareHint}</p>
      ) : null}

      {commentsOpen && !interactionsLocked ? (
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
                  {c.user?.name || 'Uživatel'}
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
