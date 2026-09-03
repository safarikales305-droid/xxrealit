'use client';

import { useState } from 'react';

type Props = {
  text: string;
  className?: string;
  maxLines?: 2 | 3;
};

export function ShortsMobileExpandableText({ text, className = '', maxLines = 2 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const trimmed = text.trim();
  if (!trimmed) return null;

  const likelyLong = trimmed.length > 72 || trimmed.split('\n').length > maxLines;

  return (
    <div className={className}>
      <p
        className={
          expanded
            ? 'text-sm leading-snug text-white/90'
            : maxLines === 3
              ? 'line-clamp-3 text-sm leading-snug text-white/90'
              : 'line-clamp-2 text-sm leading-snug text-white/90'
        }
      >
        {trimmed}
      </p>
      {likelyLong && !expanded ? (
        <button
          type="button"
          data-no-swipe
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
          className="mt-0.5 text-xs font-semibold text-orange-300 underline-offset-2 hover:underline"
        >
          Více
        </button>
      ) : null}
    </div>
  );
}
