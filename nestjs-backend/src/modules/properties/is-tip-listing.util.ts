/** Tipovaný inzerát — placený kontakt s odměnou tipaři. */
export type TipListingFields = {
  isTiparTip?: boolean | null;
  listingType?: string | null;
};

export function isTipListing(listing: TipListingFields): boolean {
  if (listing.isTiparTip === true) return true;
  const lt = String(listing.listingType ?? '')
    .trim()
    .toUpperCase();
  return lt === 'TIP';
}
