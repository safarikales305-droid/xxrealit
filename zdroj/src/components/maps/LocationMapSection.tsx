'use client';

import { useState } from 'react';
import { MapPin, Navigation, ExternalLink } from 'lucide-react';
import { ShareButtons } from '@/components/share/ShareButtons';
import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleMapsEmbedUrl,
  buildGoogleMapsSearchUrl,
  formatMapAddress,
  hasMapLocation,
  type MapLocationInput,
} from '@/lib/location-maps';

type Props = {
  title?: string;
  location: MapLocationInput;
  shareTitle?: string;
  shareUrl?: string;
  shareDescription?: string;
  className?: string;
};

export function LocationMapSection({
  title = 'Kde nás najdete',
  location,
  shareTitle,
  shareUrl,
  shareDescription,
  className = '',
}: Props) {
  const [mapActive, setMapActive] = useState(false);

  if (!hasMapLocation(location)) return null;

  const address = formatMapAddress(location);
  const embedUrl = buildGoogleMapsEmbedUrl(location);
  const mapsUrl = buildGoogleMapsSearchUrl(location);
  const navUrl = buildGoogleMapsDirectionsUrl(location);

  return (
    <section className={`rounded-2xl border border-zinc-200 bg-white p-5 ${className}`}>
      <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
        <MapPin className="size-5 text-orange-600" aria-hidden />
        {title}
      </h2>

      {location.name ? <p className="mt-2 font-medium text-zinc-900">{location.name}</p> : null}
      {address ? <p className="mt-1 text-sm text-zinc-600">{address}</p> : null}

      {embedUrl ? (
        <div className="relative mt-4 aspect-[16/10] w-full overflow-hidden rounded-xl bg-zinc-100">
          {mapActive ? (
            <iframe
              title={title}
              src={embedUrl}
              className="absolute inset-0 h-full w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <button
              type="button"
              onClick={() => setMapActive(true)}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-zinc-100 to-zinc-200 text-sm font-semibold text-zinc-700 transition hover:from-orange-50 hover:to-amber-50"
            >
              <MapPin className="size-8 text-orange-600" />
              Zobrazit mapu
            </button>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {navUrl ? (
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-4 py-2 text-sm font-semibold text-white shadow-md"
          >
            <Navigation className="size-4" />
            Navigovat
          </a>
        ) : null}
        {mapsUrl ? (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-800"
          >
            <ExternalLink className="size-4" />
            Otevřít v Google Maps
          </a>
        ) : null}
        {shareUrl && shareTitle ? (
          <ShareButtons
            title={shareTitle}
            url={shareUrl}
            label="Sdílet"
            variant="pill"
            tone="brand"
          />
        ) : null}
      </div>
      {shareDescription ? (
        <p className="mt-2 text-xs text-zinc-500">{shareDescription}</p>
      ) : null}
    </section>
  );
}
