'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PropertyGrid } from '@/components/property-grid';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { nestFetchFavorites, nestFetchMe, nestUploadAvatar } from '@/lib/nest-client';
import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';

export default function ProfilPage() {
  const { user, isAuthenticated, isLoading, apiAccessToken, refresh } = useAuth();
  const [nestAvatar, setNestAvatar] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<PropertyFeedItem[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadNestProfile = useCallback(async () => {
    if (!apiAccessToken) return;
    const me = await nestFetchMe(apiAccessToken);
    setNestAvatar(me?.avatarUrl ?? null);
  }, [apiAccessToken]);

  const loadFavorites = useCallback(async () => {
    if (!apiAccessToken) {
      setFavorites([]);
      return;
    }
    setFavLoading(true);
    setFavError(null);
    const raw = await nestFetchFavorites(apiAccessToken);
    setFavLoading(false);
    if (!raw) {
      setFavError('Oblíbené se nepodařilo načíst (zkontroluj Nest API a JWT).');
      setFavorites([]);
      return;
    }
    const items: PropertyFeedItem[] = [];
    for (const row of raw) {
      const n = safeNormalizePropertyFromApi(row);
      if (n) items.push({ ...n, liked: true });
    }
    setFavorites(items);
  }, [apiAccessToken]);

  useEffect(() => {
    void loadNestProfile();
  }, [loadNestProfile]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !apiAccessToken) return;
    setUploading(true);
    setUploadError(null);
    const res = await nestUploadAvatar(apiAccessToken, file);
    setUploading(false);
    e.target.value = '';
    if (res.error) {
      setUploadError(res.error);
      return;
    }
    if (res.avatarUrl) {
      setNestAvatar(res.avatarUrl);
    }
    await refresh();
  }

  /** avatarUrl z Nest GET /users/me nebo z Next session po refresh */
  const avatarUrl = nestAvatar ?? user?.avatar ?? null;
  const imgSrc = (() => {
    if (!avatarUrl) return null;
    if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
    if (avatarUrl.startsWith('/uploads/')) {
      return nestAbsoluteAssetUrl(avatarUrl) || avatarUrl;
    }
    return avatarUrl;
  })();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] text-zinc-600">
        Načítání…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-medium text-zinc-800">Nejste přihlášeni</p>
        <Link
          href="/login"
          className="mt-4 inline-block w-full rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] py-3 text-sm font-semibold text-white md:w-auto md:px-8"
        >
          Přihlásit se
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] px-4 py-10 text-zinc-900">
      <div className="mx-auto max-w-4xl">
        <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Domů
        </Link>

        <div className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Můj profil</h1>

          <div className="mt-6 flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt=""
                className="h-24 w-24 shrink-0 rounded-full object-cover ring-2 ring-zinc-100"
              />
            ) : (
              <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-2xl font-semibold text-zinc-600">
                {user.email.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm text-zinc-500">E-mail</p>
              <p className="truncate font-medium text-zinc-900">{user.email}</p>
              <label className="mt-4 block">
                <span className="text-sm font-medium text-zinc-700">
                  Nahrát avatar (POST /upload/avatar → PATCH /users/avatar)
                </span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  disabled={uploading || !apiAccessToken}
                  onChange={(ev) => void onAvatarChange(ev)}
                  className="mt-2 block w-full max-w-xs text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-orange-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-orange-600 md:w-auto"
                />
              </label>
              {uploading ? (
                <p className="mt-2 text-sm text-zinc-500">Nahrávám…</p>
              ) : null}
              {uploadError ? (
                <p className="mt-2 text-sm text-red-600">{uploadError}</p>
              ) : null}
              {!apiAccessToken ? (
                <p className="mt-2 text-xs text-amber-700">
                  Pro avatar a oblíbené z Nest nastavte{' '}
                  <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_URL</code> a přihlaste se
                  (stejný uživatel v Nest DB + stejný JWT_SECRET).
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-900">Oblíbené nemovitosti</h2>
          {favLoading ? (
            <p className="mt-4 text-sm text-zinc-500">Načítám oblíbené…</p>
          ) : favError ? (
            <p className="mt-4 text-sm text-red-600">{favError}</p>
          ) : favorites.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600">
              Zatím žádné — přidejte ❤️ u nemovitosti na hlavní stránce.
            </p>
          ) : (
            <div className="mt-4">
              <PropertyGrid properties={favorites} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
