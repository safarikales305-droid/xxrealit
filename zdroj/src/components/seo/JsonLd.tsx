'use client';

import Script from 'next/script';

type Props = {
  data: Record<string, unknown> | Array<Record<string, unknown>>;
};

export function JsonLd({ data }: Props) {
  return (
    <Script
      id={`jsonld-${JSON.stringify(data).slice(0, 24)}`}
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
