'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';

export function LogoutButton() {
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <button
      type="button"
      onClick={() => {
        void (async () => {
          await logout();
          router.push('/');
          router.refresh();
        })();
      }}
      className="rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
    >
      Odhlásit
    </button>
  );
}
