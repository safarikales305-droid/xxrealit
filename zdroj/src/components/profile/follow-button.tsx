'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  userId: string;
  /** `null` = viewer not logged in */
  initialFollowing: boolean | null;
  initialFollowersCount: number;
  /** Po změně sledování (např. obnovit feed). */
  onFollowChange?: (following: boolean) => void;
};

export function FollowButton({
  userId,
  initialFollowing,
  initialFollowersCount,
  onFollowChange,
}: Props) {
  const router = useRouter();
  const [following, setFollowing] = useState<boolean | null>(initialFollowing);
  const [count, setCount] = useState(initialFollowersCount);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (initialFollowing === null) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm text-zinc-500">
          <Link href="/login" className="font-semibold text-[#e85d00] hover:underline">
            Přihlaste se
          </Link>
          , abyste mohli sledovat.
        </p>
        <p className="text-sm text-zinc-500">
          <span className="font-semibold text-zinc-800">{count}</span> sledujících
        </p>
      </div>
    );
  }

  async function toggle() {
    setLoading(true);
    setError(null);
    try {
      const method = following ? 'DELETE' : 'POST';
      const res = await fetch(`/api/users/${encodeURIComponent(userId)}/follow`, {
        method,
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as {
        followersCount?: number;
        message?: string;
      };
      if (!res.ok) {
        setError(typeof data.message === 'string' ? data.message : 'Akce selhala.');
        return;
      }
      const nextFollowing = !following;
      setFollowing(nextFollowing);
      if (typeof data.followersCount === 'number') {
        setCount(data.followersCount);
      } else {
        setCount((c) => (nextFollowing ? c + 1 : Math.max(0, c - 1)));
      }
      onFollowChange?.(nextFollowing);
      router.refresh();
      if (nextFollowing) {
        window.dispatchEvent(new Event('xxrealit:posts-refresh'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={loading}
        className={`rounded-full px-6 py-2.5 text-sm font-semibold transition ${
          following
            ? 'border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50'
            : 'bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] text-white shadow-md hover:opacity-95 disabled:opacity-60'
        }`}
      >
        {loading ? '…' : following ? 'Sledujete' : 'Sledovat'}
      </button>
      <p className="text-sm text-zinc-500">
        <span className="font-semibold text-zinc-800">{count}</span> sledujících
      </p>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
