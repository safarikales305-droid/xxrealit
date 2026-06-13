/** Chyby Meta OAuth / Graph API související s neschválenými pages scope. */
export function isFacebookPageScopeError(...parts: (string | undefined | null)[]): boolean {
  const text = parts
    .filter((p): p is string => Boolean(p?.trim()))
    .join(' ')
    .toLowerCase();
  if (!text) return false;
  return (
    text.includes('invalid scope') ||
    text.includes('invalid_scopes') ||
    text.includes('pages_show_list') ||
    text.includes('pages_read_engagement') ||
    text.includes('pages_read_user_content') ||
    text.includes('feature unavailable') ||
    text.includes('app not active') ||
    (text.includes('permission') && text.includes('pages_'))
  );
}

export const FACEBOOK_PAGE_REVIEW_REQUIRED_MSG =
  'Propojení Facebook stránky vyžaduje schválení oprávnění v Meta Review nebo testovací účet v roli Admin/Tester.';
