/** Dočasné logy navigace na detail inzerátu (dev nebo NEXT_PUBLIC_DEBUG_LISTING_NAV=1). */
export function shouldLogListingDetailNav(): boolean {
  if (process.env.NODE_ENV === 'development') return true;
  return process.env.NEXT_PUBLIC_DEBUG_LISTING_NAV === '1';
}

export function logListingDetailNavigation(
  action: string,
  data: Record<string, unknown>,
): void {
  if (!shouldLogListingDetailNav()) return;
  // eslint-disable-next-line no-console
  console.log(`[listing-detail] ${action}`, {
    ...data,
    at: new Date().toISOString(),
  });
}
