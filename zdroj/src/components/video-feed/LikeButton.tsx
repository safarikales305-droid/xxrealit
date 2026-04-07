'use client';

import { memo } from 'react';

type LikeButtonProps = {
  liked: boolean;
  onToggle: () => void;
};

function LikeButtonBase({ liked, onToggle }: LikeButtonProps) {
  return (
    <button
      type="button"
      aria-label={liked ? 'Odebrat like' : 'Přidat like'}
      onClick={onToggle}
      className="inline-flex size-12 items-center justify-center rounded-full bg-black/40 text-2xl backdrop-blur"
    >
      <span className={liked ? 'text-red-500' : 'text-white'}>{liked ? '♥' : '♡'}</span>
    </button>
  );
}

export const LikeButton = memo(LikeButtonBase);
