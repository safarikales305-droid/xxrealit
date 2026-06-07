export type OgMetaForShare = {
  isReadyForFacebook?: boolean;
  facebookShareImageUrl?: string | null;
  facebookShareImageAt?: string | null;
  thumbnailUrl?: string | null;
  mainImage?: string | null;
  firstGalleryImage?: string | null;
  videoThumbnail?: string | null;
  selectedOgImage?: string | null;
  selectedSource?: string | null;
  isLogoFallback?: boolean;
};

function isPublicImageUrl(raw: string | null | undefined): boolean {
  const t = raw?.trim();
  return Boolean(t && /^https?:\/\//i.test(t));
}

/** Priorita: facebookShareImageUrl → thumbnail → main → galerie → videoThumbnail → selectedOg (logo až poslední). */
export function pickFacebookShareImage(meta: OgMetaForShare | null): string | null {
  if (!meta) return null;
  const fbReady =
    Boolean(meta.isReadyForFacebook) ||
    Boolean(meta.facebookShareImageUrl?.trim() && meta.facebookShareImageAt?.trim());
  const chain = [
    fbReady ? meta.facebookShareImageUrl : null,
    meta.thumbnailUrl,
    meta.mainImage,
    meta.firstGalleryImage,
    meta.videoThumbnail,
  ];
  for (const raw of chain) {
    if (isPublicImageUrl(raw)) return raw!.trim();
  }
  if (meta.isLogoFallback && isPublicImageUrl(meta.selectedOgImage)) {
    return meta.selectedOgImage!.trim();
  }
  if (!meta.isLogoFallback && isPublicImageUrl(meta.selectedOgImage)) {
    return meta.selectedOgImage!.trim();
  }
  return null;
}

export function hasNonLogoFallbackImage(meta: OgMetaForShare | null): boolean {
  if (!meta) return false;
  const fbReady =
    Boolean(meta.isReadyForFacebook) ||
    Boolean(meta.facebookShareImageUrl?.trim() && meta.facebookShareImageAt?.trim());
  const chain = [
    fbReady ? meta.facebookShareImageUrl : null,
    meta.thumbnailUrl,
    meta.mainImage,
    meta.firstGalleryImage,
    meta.videoThumbnail,
  ];
  return chain.some((raw) => isPublicImageUrl(raw));
}

export function logFacebookShareReady(
  meta: OgMetaForShare | null,
  isWaitingBlocked: boolean,
): void {
  const selectedImage = pickFacebookShareImage(meta);
  // eslint-disable-next-line no-console
  console.log('FACEBOOK SHARE READY', {
    facebookShareImageUrl: meta?.facebookShareImageUrl ?? null,
    thumbnailUrl: meta?.thumbnailUrl ?? null,
    mainImage: meta?.mainImage ?? null,
    firstGalleryImage: meta?.firstGalleryImage ?? null,
    selectedImage,
    isWaitingBlocked,
  });
}

const PREVIEW_WAIT_MS = 8000;
const POLL_MS = 400;

export async function waitForFacebookShareMeta(
  fetchMeta: () => Promise<OgMetaForShare | null>,
): Promise<{ meta: OgMetaForShare | null; noImageWarning: boolean }> {
  const start = Date.now();
  let lastMeta: OgMetaForShare | null = null;

  while (Date.now() - start < PREVIEW_WAIT_MS) {
    lastMeta = await fetchMeta();
    const blocked = Date.now() - start < PREVIEW_WAIT_MS;
    if (lastMeta?.isReadyForFacebook) {
      logFacebookShareReady(lastMeta, blocked);
      return {
        meta: lastMeta,
        noImageWarning: !pickFacebookShareImage(lastMeta),
      };
    }
    if (hasNonLogoFallbackImage(lastMeta)) {
      logFacebookShareReady(lastMeta, blocked);
      return {
        meta: lastMeta,
        noImageWarning: false,
      };
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  if (!lastMeta) {
    lastMeta = await fetchMeta();
  }
  logFacebookShareReady(lastMeta, false);
  return {
    meta: lastMeta,
    noImageWarning: !pickFacebookShareImage(lastMeta),
  };
}
