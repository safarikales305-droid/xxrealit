'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';

export type ShortsTopicOption = {
  id: string;
  slug: string;
  label: string;
};

type Props = {
  selected: string[];
  onChange: (slugs: string[]) => void;
  variant?: 'mobile' | 'desktop';
};

export function ShortsTopicChips({ selected, onChange, variant = 'desktop' }: Props) {
  const [topics, setTopics] = useState<ShortsTopicOption[]>([]);

  useEffect(() => {
    if (!API_BASE_URL) return;
    void fetch(`${API_BASE_URL}/feed/shorts/topics`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setTopics(data as ShortsTopicOption[]);
      })
      .catch(() => undefined);
  }, []);

  const toggle = (slug: string) => {
    if (!slug) {
      onChange([]);
      return;
    }
    if (selected.includes(slug)) {
      onChange(selected.filter((s) => s !== slug));
    } else {
      onChange([...selected, slug]);
    }
  };

  if (!topics.length) return null;

  const isMobile = variant === 'mobile';

  return (
    <div
      className={
        isMobile
          ? 'border-b border-zinc-200/90 bg-white/95 backdrop-blur-sm'
          : 'border-b border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur-sm lg:px-6'
      }
      data-no-swipe
    >
      {!isMobile ? (
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
          Téma videa
        </p>
      ) : null}
      <div
        className={`shorts-topic-scroller flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          isMobile ? 'touch-pan-x px-3 py-2' : ''
        }`}
        style={{ touchAction: 'pan-x' }}
      >
        <button
          type="button"
          data-no-swipe
          onClick={() => onChange([])}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            selected.length === 0
              ? 'border-2 border-orange-500 bg-orange-50 text-orange-800'
              : 'border border-transparent bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
          }`}
        >
          Vše
        </button>
        {topics.map((t) => {
          const active = selected.includes(t.slug);
          return (
            <button
              key={t.id}
              type="button"
              data-no-swipe
              onClick={() => toggle(t.slug)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-2 border-orange-500 bg-orange-50 text-orange-800'
                  : 'border border-transparent bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
