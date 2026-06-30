/** Po změně veřejného profilu nebo publikování příspěvku invaliduj cache a obnov UI. */
export function invalidatePublicProfileAndPostsCache(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('xxrealit:user-profile-updated'));
  window.dispatchEvent(new Event('xxrealit:posts-refresh'));
}

export async function afterPublicProfileSaved(refreshAuth?: () => Promise<void>): Promise<void> {
  invalidatePublicProfileAndPostsCache();
  if (refreshAuth) {
    await refreshAuth();
  }
}
