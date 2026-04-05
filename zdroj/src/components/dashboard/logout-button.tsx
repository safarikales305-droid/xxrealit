'use client';

import { useAuth } from '@/hooks/use-auth';

export function LogoutButton() {
  const { logout } = useAuth();

  return (
    <button
      type="button"
      onClick={() => logout()}
      className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
    >
      Odhlásit
    </button>
  );
}
