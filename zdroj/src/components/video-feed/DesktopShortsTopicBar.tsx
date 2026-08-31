'use client';

import { ShortsTopicChips } from '@/components/video-feed/ShortsTopicChips';

type Props = {
  selected: string[];
  onChange: (slugs: string[]) => void;
  topicFilterEmpty?: boolean;
  onClearTopics?: () => void;
};

/** Desktop topic bar above Shorts feed. */
export function DesktopShortsTopicBar({
  selected,
  onChange,
  topicFilterEmpty,
  onClearTopics,
}: Props) {
  return (
    <>
      <ShortsTopicChips selected={selected} onChange={onChange} variant="desktop" />
      {topicFilterEmpty ? (
        <p className="shrink-0 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-center text-sm text-zinc-600">
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
