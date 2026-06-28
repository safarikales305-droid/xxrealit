'use client';

import { Heart } from 'lucide-react';

type Props = {
  liked: boolean;
  likeBusy: boolean;
  onFavorite: () => void;
  onShare: () => void;
  onMessage: () => void;
  onCall?: () => void;
  showCall: boolean;
  messageDisabled: boolean;
};

export function ListingMobileStickyBar({
  liked,
  likeBusy,
  onFavorite,
  onShare,
  onMessage,
  onCall,
  showCall,
  messageDisabled,
}: Props) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] border-t border-zinc-200 bg-white/95 px-3 py-2 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-md xl:hidden">
      <div className="mx-auto flex max-w-lg items-center justify-between gap-1">
        <button
          type="button"
          disabled={likeBusy}
          onClick={onFavorite}
          className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-zinc-700"
        >
          <Heart className={`size-5 ${liked ? 'fill-orange-500 text-orange-500' : ''}`} />
          Oblíbené
        </button>
        <button
          type="button"
          onClick={onShare}
          className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-zinc-700"
        >
          <span className="text-lg">📤</span>
          Sdílet
        </button>
        <button
          type="button"
          onClick={onMessage}
          disabled={messageDisabled}
          className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-zinc-700 disabled:opacity-40"
        >
          <span className="text-lg">✉</span>
          Zpráva
        </button>
        {showCall && onCall ? (
          <button
            type="button"
            onClick={onCall}
            className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg bg-[#e85d00] text-[10px] font-bold text-white"
          >
            <span className="text-lg">📞</span>
            Zavolat
          </button>
        ) : (
          <button
            type="button"
            onClick={onMessage}
            disabled={messageDisabled}
            className="flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg bg-[#e85d00] text-[10px] font-bold text-white disabled:opacity-40"
          >
            Kontakt
          </button>
        )}
      </div>
    </div>
  );
}
