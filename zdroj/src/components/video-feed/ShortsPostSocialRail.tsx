'use client';

import { useEffect, useState } from 'react';
import { Heart, MessageCircle, Share2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAddPostComment,
  nestFetchPostComments,
  nestTogglePostFavorite,
  type PostComment,
} from '@/lib/nest-client';
import {
  openShortsEmailSignupForInteraction,
  useShortsEmailSignup,
} from '@/hooks/use-shorts-email-signup';
import {
  clearPendingCommentDraft,
  clearSignupPendingIntent,
  readPendingCommentDraft,
  readSignupPendingIntent,
  savePendingCommentDraft,
} from '@/lib/shorts-email-signup-storage';
import { useMobileShortsHeader } from '@/components/video-feed/mobile-shorts-header-context';
import { ShortsCommentsSheet } from './ShortsCommentsSheet';

type Props = {
  postId: string;
  initialLikeCount?: number;
  initialCommentCount?: number;
  initialLikedByMe?: boolean;
  shareUrl?: string;
  shareTitle?: string;
};

export function ShortsPostSocialRail({
  postId,
  initialLikeCount = 0,
  initialCommentCount = 0,
  initialLikedByMe = false,
  shareUrl,
  shareTitle,
}: Props) {
  const { user, apiAccessToken } = useAuth();
  const { settings } = useShortsEmailSignup();
  const mobileHeader = useMobileShortsHeader();
  const [liked, setLiked] = useState(initialLikedByMe);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');

  useEffect(() => {
    setLiked(initialLikedByMe);
    setLikeCount(initialLikeCount);
    setCommentCount(initialCommentCount);
  }, [initialLikedByMe, initialLikeCount, initialCommentCount, postId]);

  useEffect(() => {
    mobileHeader?.setScrollLocked(commentsOpen);
    return () => mobileHeader?.setScrollLocked(false);
  }, [commentsOpen, mobileHeader]);

  const loadComments = async () => {
    setCommentsLoading(true);
    const rows = await nestFetchPostComments(postId);
    setComments(rows);
    setCommentCount(rows.length);
    setCommentsLoading(false);
  };

  const openComments = () => {
    const saved = readPendingCommentDraft(postId);
    if (saved) setCommentDraft(saved);
    setCommentsOpen(true);
    void loadComments();
  };

  const requestGuestSignup = (intent: 'like' | 'comment', draft?: string) => {
    if (!settings) return;
    if (intent === 'comment' && draft?.trim()) {
      savePendingCommentDraft(postId, draft);
    }
    openShortsEmailSignupForInteraction(settings, {
      intent,
      postId,
      draft: draft?.trim() || undefined,
    });
  };

  const toggleLike = () => {
    if (!user || !apiAccessToken) {
      requestGuestSignup('like');
      return;
    }
    void nestTogglePostFavorite(apiAccessToken, postId).then((res) => {
      if (res.ok) {
        setLiked(res.liked);
        setLikeCount(res.likeCount);
      }
    });
  };

  const submitComment = async (text: string) => {
    if (!user || !apiAccessToken) {
      requestGuestSignup('comment', text);
      return { ok: false as const, error: 'Přihlaste se e-mailem.' };
    }
    const res = await nestAddPostComment(apiAccessToken, postId, text);
    if (res.ok) {
      clearPendingCommentDraft(postId);
      await loadComments();
    } else if (res.error?.includes('401') || res.error?.toLowerCase().includes('auth')) {
      requestGuestSignup('comment', text);
    }
    return res;
  };

  useEffect(() => {
    if (!user || !apiAccessToken) return;
    const intent = readSignupPendingIntent();
    if (!intent || intent.postId !== postId) return;

    if (intent.intent === 'like') {
      clearSignupPendingIntent();
      void nestTogglePostFavorite(apiAccessToken, postId).then((res) => {
        if (res.ok) {
          setLiked(res.liked);
          setLikeCount(res.likeCount);
        }
      });
      return;
    }

    if (intent.intent === 'comment') {
      const draft = intent.draft?.trim() || readPendingCommentDraft(postId);
      if (draft) setCommentDraft(draft);
      setCommentsOpen(true);
      void loadComments();
      clearSignupPendingIntent();
    }
  }, [user, apiAccessToken, postId]);

  const onShare = async () => {
    const url = shareUrl ?? (typeof window !== 'undefined' ? window.location.href : '');
    const title = shareTitle ?? 'XXREALIT Shorts';
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      <div className="pointer-events-auto flex flex-col items-center gap-4 lg:gap-5">
        <button
          type="button"
          data-no-swipe
          onClick={toggleLike}
          className="flex flex-col items-center gap-1 text-white lg:text-zinc-800"
          aria-label={liked ? 'Odebrat srdíčko' : 'Líbí se mi'}
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm lg:size-12 lg:border lg:border-zinc-200 lg:bg-white lg:shadow-sm">
            <Heart
              className={`size-5 transition-transform duration-150 ${
                liked
                  ? 'scale-110 fill-[#ff6a00] text-[#ff6a00] lg:fill-orange-500 lg:text-orange-500'
                  : 'text-white lg:text-zinc-700'
              }`}
              strokeWidth={liked ? 2 : 1.75}
            />
          </span>
          <span className="text-[11px] font-semibold tabular-nums">{likeCount}</span>
        </button>

        <button
          type="button"
          data-no-swipe
          onClick={openComments}
          className="flex flex-col items-center gap-1 text-white lg:text-zinc-800"
          aria-label="Komentáře"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm lg:size-12 lg:border lg:border-zinc-200 lg:bg-white lg:shadow-sm">
            <MessageCircle className="size-5" />
          </span>
          <span className="text-[11px] font-semibold tabular-nums">{commentCount}</span>
        </button>

        <button
          type="button"
          data-no-swipe
          onClick={() => void onShare()}
          className="flex flex-col items-center gap-1 text-white lg:text-zinc-800"
          aria-label="Sdílet"
        >
          <span className="flex size-11 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm lg:size-12 lg:border lg:border-zinc-200 lg:bg-white lg:shadow-sm">
            <Share2 className="size-5" />
          </span>
        </button>
      </div>

      <ShortsCommentsSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        comments={comments}
        loading={commentsLoading}
        isLoggedIn={Boolean(user)}
        initialDraft={commentDraft}
        onDraftChange={(text) => {
          setCommentDraft(text);
          savePendingCommentDraft(postId, text);
        }}
        onSubmit={submitComment}
        onRequestSignup={(draft) => requestGuestSignup('comment', draft)}
      />
    </>
  );
}
