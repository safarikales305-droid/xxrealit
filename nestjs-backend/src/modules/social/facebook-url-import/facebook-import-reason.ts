export type FacebookImportDetectedReason =
  | 'OK'
  | 'NO_PUBLIC_POSTS'
  | 'FACEBOOK_BLOCKED'
  | 'URL_NOT_AVAILABLE'
  | 'PARSER_NO_SUPPORTED_POSTS';

export const FACEBOOK_BLOCKED_CODE = 'FACEBOOK_BLOCKED';

export const FACEBOOK_BLOCKED_USER_MSG =
  'Facebook blokuje automatický import. Vložte konkrétní odkaz na příspěvek nebo video ručně.';

export function userMessageForImportReason(
  reason: FacebookImportDetectedReason,
  opts?: { allDuplicates?: boolean },
): string | null {
  if (opts?.allDuplicates) {
    return 'Všechny nalezené příspěvky už byly importovány dříve.';
  }
  switch (reason) {
    case 'OK':
      return null;
    case 'NO_PUBLIC_POSTS':
      return 'Stránka nemá dostupné veřejné příspěvky, které by šlo automaticky načíst.';
    case 'FACEBOOK_BLOCKED':
      return FACEBOOK_BLOCKED_USER_MSG;
    case 'URL_NOT_AVAILABLE':
      return 'Zadaná URL není dostupná (chyba sítě, přesměrování nebo stránka neexistuje).';
    case 'PARSER_NO_SUPPORTED_POSTS':
      return 'Stránku se podařilo načíst, ale parser nenašel podporovaný typ příspěvku (posts, permalink, reel, video, photo).';
    default:
      return 'Import se nezdařil z neznámého důvodu.';
  }
}
