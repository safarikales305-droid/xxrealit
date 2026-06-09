export type ResolvedContact = {
  contactName: string | null;
  phone: string | null;
  email: string | null;
};

export function contactFromFields(row: {
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}): ResolvedContact {
  return {
    contactName: row.contactName?.trim() || null,
    phone: row.contactPhone?.trim() || null,
    email: row.contactEmail?.trim().toLowerCase() || null,
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 15;
}

export function isContactComplete(contact: ResolvedContact): boolean {
  const name = contact.contactName?.trim() ?? '';
  const phone = contact.phone?.trim() ?? '';
  const email = contact.email?.trim() ?? '';
  return (
    name.length >= 1 &&
    isValidPhone(phone) &&
    isValidEmail(email)
  );
}

export function mergeContact(
  primary: ResolvedContact,
  fallback: ResolvedContact,
): ResolvedContact {
  return {
    contactName: primary.contactName || fallback.contactName,
    phone: primary.phone || fallback.phone,
    email: primary.email || fallback.email,
  };
}

export function resolveListingContact(input: {
  listing?: {
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
  } | null;
  tip?: {
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
  } | null;
  owner?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } | null;
}): ResolvedContact {
  const fromTip = input.tip ? contactFromFields(input.tip) : contactFromFields({});
  const fromListing = input.listing ? contactFromFields(input.listing) : contactFromFields({});
  const primary = input.tip ? fromTip : fromListing;
  const secondary = input.tip ? fromListing : fromTip;
  const merged = mergeContact(primary, secondary);
  const ownerFallback: ResolvedContact = {
    contactName: input.owner?.name?.trim() || null,
    phone: input.owner?.phone?.trim() || null,
    email: input.owner?.email?.trim().toLowerCase() || null,
  };
  return mergeContact(merged, ownerFallback);
}
