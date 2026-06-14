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
    text.includes('pages_manage_metadata') ||
    text.includes('pages_manage_posts') ||
    text.includes('pages_read_user_content') ||
    text.includes('feature unavailable') ||
    text.includes('app not active') ||
    (text.includes('permission') && text.includes('pages_'))
  );
}

export const FACEBOOK_PAGES_LIST_PERMISSION_MSG =
  'Pro výběr Facebook stránky je potřeba schválení oprávnění pages_show_list, pages_read_engagement a pages_manage_metadata v Meta aplikaci.';

export const FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MSG =
  'Propojení Facebook stránky vyžaduje povolení Pages oprávnění v Meta aplikaci.';

/** @deprecated Použijte FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MSG */
export const FACEBOOK_PAGE_REVIEW_REQUIRED_MSG = FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MSG;
