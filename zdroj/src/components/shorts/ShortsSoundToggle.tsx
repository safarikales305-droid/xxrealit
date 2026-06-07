'use client';

type Props = {
  muted: boolean;
  onToggle: () => void;
  className?: string;
};

export function ShortsSoundToggle({ muted, onToggle, className = '' }: Props) {
  return (
    <button
      type="button"
      className={`sound-toggle ${className}`.trim()}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={muted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
      aria-pressed={!muted}
    >
      {muted ? '🔇 Zvuk vypnutý' : '🔊 Zvuk zapnutý'}
    </button>
  );
}
