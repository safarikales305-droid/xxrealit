/** Mask person name for locked listing contact, e.g. "Martin Dvořák" → "M***** D*****". */
export function blurPersonName(name: string | null | undefined): string {
  const raw = (name ?? '').trim();
  if (!raw) return 'Uživatel';
  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (part.length <= 1) return `${part}*****`;
      return `${part[0]}${'*'.repeat(Math.min(5, Math.max(1, part.length - 1)))}`;
    })
    .join(' ');
}
