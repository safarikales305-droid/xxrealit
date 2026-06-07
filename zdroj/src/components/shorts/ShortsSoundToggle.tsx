'use client';

import { Volume2, VolumeX } from 'lucide-react';

type Props = {
  muted: boolean;
  onToggle: () => void;
  className?: string;
  /** `rail` = pravý sloupec akcí; `overlay` = plovoucí na videu (sdílený přehrávač). */
  variant?: 'overlay' | 'rail';
  /** Světlý desktop rail vedle videa. */
  desktopLight?: boolean;
};

const railBase =
  'inline-flex size-14 shrink-0 items-center justify-center rounded-full border-2 shadow-[0_8px_32px_rgba(0,0,0,0.45)] backdrop-blur-md transition active:scale-95 touch-manipulation';

const railDark =
  `${railBase} border-white/35 bg-black/65 text-white hover:border-orange-400/80 hover:bg-orange-600/95`;

const railLight =
  `${railBase} border-zinc-200 bg-white text-zinc-800 shadow-md backdrop-blur-none hover:border-orange-300 hover:bg-orange-50 hover:text-orange-900`;

export function ShortsSoundToggle({
  muted,
  onToggle,
  className = '',
  variant = 'overlay',
  desktopLight = false,
}: Props) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onToggle();
  };

  if (variant === 'rail') {
    const railClass = desktopLight ? railLight : railDark;
    return (
      <button
        type="button"
        className={`${railClass} ${className}`.trim()}
        onClick={handleClick}
        aria-label={muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
        aria-pressed={!muted}
        title={muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
      >
        {muted ? (
          <VolumeX className="size-6" strokeWidth={2.25} aria-hidden />
        ) : (
          <Volume2 className="size-6" strokeWidth={2.25} aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`sound-toggle sound-toggle--overlay ${className}`.trim()}
      onClick={handleClick}
      aria-label={muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
      aria-pressed={!muted}
      title={muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
    >
      {muted ? (
        <VolumeX className="size-4 shrink-0 sm:size-[1.1rem]" strokeWidth={2.25} aria-hidden />
      ) : (
        <Volume2 className="size-4 shrink-0 sm:size-[1.1rem]" strokeWidth={2.25} aria-hidden />
      )}
      <span className="hidden min-[380px]:inline">
        {muted ? 'Zvuk vypnutý' : 'Zvuk zapnutý'}
      </span>
    </button>
  );
}
