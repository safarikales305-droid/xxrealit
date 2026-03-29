'use client';

import { useSession } from 'next-auth/react';
import type { UserRole } from '@/lib/roles';

export function useAuth() {
  const { data: session, status, update } = useSession();

  const user = session?.user;
  const role = user?.role;

  return {
    session,
    status,
    update,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    user,
    /** Nest API JWT for Bearer authorization (credentials login only until OAuth is linked). */
    apiAccessToken: session?.apiAccessToken,
    role: role as UserRole | undefined,
  };
}
