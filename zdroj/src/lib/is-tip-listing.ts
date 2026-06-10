/** Tipovaný inzerát — placený kontakt s odměnou tipaři. */
export type TipListingLike = {
  isTip?: boolean | null;
  isTiparTip?: boolean | null;
  listingType?: string | null;
};

export function isTipListing(listing: TipListingLike | null | undefined): boolean {
  if (!listing) return false;
  if (listing.isTip === true || listing.isTiparTip === true) return true;
  const lt = String(listing.listingType ?? '')
    .trim()
    .toUpperCase();
  return lt === 'TIP';
}

export const TIP_LISTING_TOOLTIP =
  'Kontakt je zpoplatněn kreditem a odměna je rozdělena mezi tipaře a portál.';
