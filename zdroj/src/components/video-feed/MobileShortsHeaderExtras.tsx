'use client';

import { ShortsTopicChips } from '@/components/video-feed/ShortsTopicChips';

type Props = {
  selected: string[];
  onChange: (slugs: string[]) => void;
  topicFilterEmpty?: boolean;
  onClearTopics?: () => void;
  activeLocationLabel?: string | null;
  shortsTargetMissing?: boolean;
};

/** Mobilní horní panel Shorts: topic filtr + bannery (nav je v Navbar). */
export function MobileShortsHeaderExtras({
  selected,
  onChange,
  topicFilterEmpty,
  onClearTopics,
  activeLocationLabel,
  shortsTargetMissing,
}: Props) {
  return (
    <>
      {activeLocationLabel ? (
        <p className="border-b border-zinc-200 bg-white px-3 py-1.5 text-center text-xs text-zinc-700">
          Aktivní lokalita: <span className="font-semibold">{activeLocationLabel}</span>
        </p>
      ) : null}
      {shortsTargetMissing ? (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-xs text-amber-900">
          Toto video již není dostupné — zobrazujeme nejbližší Shorts.
        </p>
      ) : null}
      <ShortsTopicChips selected={selected} onChange={onChange} variant="mobile" />
      {topicFilterEmpty ? (
        <p className="border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 text-center text-xs text-zinc-600">
          Pro toto téma zatím nemáme dost videí.{' '}
          <button
            type="button"
            className="font-semibold text-orange-700 underline"
            onClick={onClearTopics}
          >
            Zobrazit všechna témata
          </button>
        </p>
      ) : null}
    </>
  );
}
