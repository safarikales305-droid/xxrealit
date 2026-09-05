export function buildAiReelListingTrackingUrl(params: {
  origin: string;
  propertyId: string;
  jobId: string;
  platform: 'facebook' | 'instagram' | 'youtube' | 'shorts' | 'portal';
}): string {
  const base = params.origin.replace(/\/+$/, '');
  const path = `/nemovitost/${params.propertyId}`;
  const q = new URLSearchParams({
    utm_source: params.platform,
    utm_medium: 'ai_reel',
    utm_campaign: 'sreality_import',
    listingId: params.propertyId,
    aiReelId: params.jobId,
  });
  return `${base}${path}?${q.toString()}`;
}
