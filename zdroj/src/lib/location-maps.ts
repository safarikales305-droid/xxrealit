export type MapLocationInput = {
  name?: string | null;
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  region?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function formatMapAddress(loc: MapLocationInput): string | null {
  const parts = [
    loc.street?.trim(),
    [loc.postalCode?.trim(), loc.city?.trim()].filter(Boolean).join(' '),
    loc.region?.trim(),
    loc.country?.trim() || 'Česko',
  ].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(', ');
}

export function hasMapLocation(loc: MapLocationInput): boolean {
  if (
    typeof loc.latitude === 'number' &&
    typeof loc.longitude === 'number' &&
    Number.isFinite(loc.latitude) &&
    Number.isFinite(loc.longitude)
  ) {
    return true;
  }
  return Boolean(formatMapAddress(loc));
}

export function buildGoogleMapsSearchUrl(loc: MapLocationInput): string | null {
  if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    return `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`;
  }
  const address = formatMapAddress(loc);
  if (!address) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}

export function buildGoogleMapsDirectionsUrl(loc: MapLocationInput): string | null {
  if (typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
  }
  const address = formatMapAddress(loc);
  if (!address) return null;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
}

export function buildGoogleMapsEmbedUrl(loc: MapLocationInput): string | null {
  const openUrl = buildGoogleMapsSearchUrl(loc);
  if (!openUrl) return null;
  const q = openUrl.split('query=')[1];
  if (!q) return null;
  return `https://maps.google.com/maps?q=${q}&z=14&output=embed`;
}
