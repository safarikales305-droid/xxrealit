'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { AuthPageShell } from '@/components/auth/auth-page-shell';
import { useAuth } from '@/hooks/use-auth';
import {
  nestPropertySeekerRecordShare,
  nestPropertySeekerStatus,
} from '@/lib/nest-client';
import {
  PROPERTY_SEEKER_SHARE_MESSAGE,
  PROPERTY_SEEKER_SHARE_REQUIRED,
} from '@/lib/property-seeker-routing';

export default function SdileniPortaluPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [shareCount, setShareCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  const refresh = useCallback(async () => {
    if (!apiAccessToken) return;
    setLoadingStatus(true);
    const status = await nestPropertySeekerStatus(apiAccessToken);
    if (status) {
      setShareCount(status.shareCount);
      if (status.onboardingComplete) {
        router.replace('/');
        router.refresh();
      }
    }
    setLoadingStatus(false);
  }, [apiAccessToken, router]);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/login?redirect=/registrace/sdileni');
      return;
    }
    if (user.role !== 'PROPERTY_SEEKER') {
      router.replace('/');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  async function handleShare() {
    if (!apiAccessToken) return;
    setBusy(true);
    setError(null);
    const encoded = encodeURIComponent(PROPERTY_SEEKER_SHARE_MESSAGE);
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener,noreferrer');
    const r = await nestPropertySeekerRecordShare(apiAccessToken);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? 'Nepodařilo se zaznamenat sdílení.');
      return;
    }
    if (typeof r.shareCount === 'number') setShareCount(r.shareCount);
    if (r.completed) {
      router.replace('/');
      router.refresh();
    }
  }

  const remaining = Math.max(0, PROPERTY_SEEKER_SHARE_REQUIRED - shareCount);

  return (
    <AuthPageShell variant="register">
      <h1 className="mb-2 text-center text-lg font-semibold text-zinc-900">
        Sdílejte portál 5 přátelům
      </h1>
      <p className="mb-4 text-center text-sm text-zinc-600">
        Než vstoupíte do portálu, sdílejte XXrealit.cz alespoň {PROPERTY_SEEKER_SHARE_REQUIRED}×
        přes WhatsApp. Po každém kliknutí na tlačítko sdílení se započítá jedno sdílení.
      </p>

      <div className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-sm text-zinc-700">
        <p className="font-medium text-zinc-900">Text zprávy:</p>
        <p className="mt-2 whitespace-pre-wrap">{PROPERTY_SEEKER_SHARE_MESSAGE}</p>
      </div>

      <p className="mb-4 text-center text-sm font-semibold text-zinc-800">
        {loadingStatus
          ? 'Načítám…'
          : `Sdíleno ${shareCount} / ${PROPERTY_SEEKER_SHARE_REQUIRED}${
              remaining > 0 ? ` (zbývá ${remaining})` : ''
            }`}
      </p>

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <button
        type="button"
        disabled={busy || loadingStatus || shareCount >= PROPERTY_SEEKER_SHARE_REQUIRED}
        onClick={() => void handleShare()}
        className="w-full rounded-full bg-[#25D366] py-3 text-sm font-semibold text-white shadow-lg transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Ukládám…' : 'Sdílet přes WhatsApp'}
      </button>
    </AuthPageShell>
  );
}
