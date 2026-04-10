'use client';

import { absoluteShareUrl } from '@/lib/public-share-url';
import { ShareButtons } from '@/components/share/ShareButtons';

type Props = {
  propertyId: string;
  title: string;
};

export function NemovitostShareBar({ propertyId, title }: Props) {
  const url = absoluteShareUrl(`/nemovitost/${encodeURIComponent(propertyId)}`);
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <ShareButtons title={title} url={url} variant="pill" label="Sdílet" />
    </div>
  );
}
