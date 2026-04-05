/**
 * Role „PRIVATE_SELLER“ pro portál soukromého prodejce.
 * Z localStorage `user` mapujeme API roli `USER` na PRIVATE_SELLER.
 * Bez uloženého uživatele (dev) bereme PRIVATE_SELLER jako simulaci přihlášení.
 */
export function getEffectiveRole(): string {
  if (typeof window === 'undefined') {
    return 'PRIVATE_SELLER';
  }

  const raw = localStorage.getItem('user');
  if (raw) {
    try {
      const u = JSON.parse(raw) as { role?: string };
      if (
        u.role === 'USER' ||
        u.role === 'PRIVATE_SELLER' ||
        u.role === 'uzivatel'
      ) {
        return 'PRIVATE_SELLER';
      }
      return u.role ?? 'GUEST';
    } catch {
      return 'GUEST';
    }
  }

  return 'PRIVATE_SELLER';
}

export function isPrivateSeller(): boolean {
  return getEffectiveRole() === 'PRIVATE_SELLER';
}
