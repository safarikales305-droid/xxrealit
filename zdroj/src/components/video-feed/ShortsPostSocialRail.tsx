'use client';

import { useCallback, useEffect, useState } from 'react';
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
  const [liked, setLiked] = useState(initialLikedByMe);
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [commentCount, setCommentCount] = useState(initialCommentCount);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);

  useEffect(() => {
    setLiked(initialLikedByMe);
    setLikeCount(initialLikeCount);
    setCommentCount(initialCommentCount);
  }, [initialLikedByMe, initialLikeCount, initialCommentCount, postId]);

  const loadComments = useCallback(async () => {
    setCommentsLoading(true);
    const rows = await nestFetchPostComments(postId);
    setComments(rows);
    setCommentCount(rows.length);
    setCommentsLoading(false);
  }, [postId]);

  const openComments = () => {
    setCommentsOpen(true);
    void loadComments();
  };

  const toggleLike = () => {
    if (!user || !apiAccessToken) {
      if (settings) {
        openShortsEmailSignupForInteraction(settings, {
          intent: 'like',
          postId,
        });
      }
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
      if (settings) {
        openShortsEmailSignupForInteraction(settings, {
          intent: 'comment',
          postId,
          draft: text,
        });
      }
      return { ok: false as const, error: 'Přihlaste se e-mailem.' };
    }
    const res = await nestAddPostComment(apiAccessToken, postId, text);
    if (res.ok) {
      await loadComments();
    }
    return res;
  };

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
          <span
            className={`flex size-11 items-center justify-center rounded-full backdrop-blur-sm lg:size-12 lg:border lg:border-zinc-200 lg:bg-white lg:shadow-sm ${
              liked ? 'bg-orange-500/90 lg:bg-orange-50' : 'bg-black/40 lg:bg-white'
            }`}
          >
            <Heart className={`size-5 ${liked ? 'fill-orange-500 text-orange-500' : ''}`} />
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
        onSubmit={submitComment}
        onRequestSignup={(draft) => {
          if (settings) {
            openShortsEmailSignupForInteraction(settings, {
              intent: 'comment',
              postId,
              draft,
            });
          }
        }}
      />
    </>
  );
}
