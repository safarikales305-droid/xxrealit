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
};

export function ShortsTopicChips({ selected, onChange }: Props) {
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

  return (
    <div className="border-b border-zinc-200 bg-white/95 px-3 py-2 backdrop-blur-sm lg:px-6">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Téma videa</p>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => onChange([])}
          className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
            selected.length === 0
              ? 'bg-orange-600 text-white'
              : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
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
              onClick={() => toggle(t.slug)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                active ? 'bg-orange-600 text-white' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
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
