'use client';

import { useAuthContext } from '@/components/providers/auth-provider';
import type { UserRole } from '@/lib/roles';
import { isUserRole } from '@/lib/roles';

export function useAuth() {
  const { user, loading, refresh, logout } = useAuthContext();

  const role =
    user?.role && isUserRole(user.role) ? (user.role as UserRole) : undefined;

  return {
    user,
    status: loading ? 'loading' : user ? 'authenticated' : 'unauthenticated',
    isLoading: loading,
    isAuthenticated: Boolean(user),
    refresh,
    logout,
    role,
    apiAccessToken: null as string | null,
  };
}
