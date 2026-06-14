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
    text.includes('feature unavailable') ||
    text.includes('app not active') ||
    (text.includes('permission') && text.includes('pages_'))
  );
}

export const FACEBOOK_PAGES_LIST_PERMISSION_MESSAGE =
  'Pro výběr Facebook stránky je potřeba schválení oprávnění pages_show_list, pages_read_engagement, pages_manage_metadata a pages_manage_posts v Meta aplikaci.';

export const FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MESSAGE =
  'Propojení Facebook stránky vyžaduje povolení Pages oprávnění v Meta aplikaci.';

export const FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_LOG = 'FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE';

/** @deprecated Použijte FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MESSAGE */
export const FACEBOOK_PAGE_REVIEW_REQUIRED_MESSAGE = FACEBOOK_PAGE_SCOPES_NOT_AVAILABLE_MESSAGE;
