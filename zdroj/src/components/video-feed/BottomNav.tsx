'use client';

import type { ViewMode } from '@/components/home/navbar';

type BottomNavProps = {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

export function BottomNav({ viewMode, onChange }: BottomNavProps) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[80] border-t border-zinc-200 bg-white/95 p-2 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onChange('shorts')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            viewMode === 'shorts' ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-700'
          }`}
        >
          Shorts
        </button>
        <button
          type="button"
          onClick={() => onChange('posts')}
          className={`rounded-lg px-4 py-2 text-sm font-semibold ${
            viewMode === 'posts' ? 'bg-orange-500 text-white' : 'bg-zinc-100 text-zinc-700'
          }`}
        >
          Posts
        </button>
      </div>
    </nav>
  );
}
