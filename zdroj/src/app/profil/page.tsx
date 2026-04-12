'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PropertyGrid } from '@/components/property-grid';
import { useAuth } from '@/hooks/use-auth';
import { useMessagesUnreadCount } from '@/hooks/use-messages-unread';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestDeleteCover,
  nestFetchFavorites,
  nestFetchMe,
  nestPatchProfileBio,
  nestUploadAvatar,
  nestUploadCover,
  NEST_PROFILE_IMAGE_MAX_BYTES,
} from '@/lib/nest-client';
import {
  safeNormalizePropertyFromApi,
  type PropertyFeedItem,
} from '@/types/property';

const BIO_MAX = 500;
const ACCEPT_IMAGES = 'image/jpeg,image/jpg,image/png,image/webp';

function assertImageFile(file: File): string | null {
  const okMime = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  const lower = file.name.toLowerCase();
  const okExt = /\.(jpe?g|png|webp)$/.test(lower);
  if (!okMime && !okExt) {
    return 'Nepodporovaný formát. Použijte JPG, PNG nebo WebP.';
  }
  if (file.size > NEST_PROFILE_IMAGE_MAX_BYTES) {
    return `Soubor je příliš velký (max. ${NEST_PROFILE_IMAGE_MAX_BYTES / (1024 * 1024)} MB).`;
  }
  return null;
}

export default function ProfilPage() {
  const { user, isAuthenticated, isLoading, apiAccessToken, refresh, setUser } = useAuth();
  const unreadMessages = useMessagesUnreadCount(apiAccessToken);
  const [nestAvatar, setNestAvatar] = useState<string | null>(null);
  const [nestCover, setNestCover] = useState<string | null>(null);
  const [nestBio, setNestBio] = useState<string | null>(null);
  const [favorites, setFavorites] = useState<PropertyFeedItem[]>([]);
  const [favLoading, setFavLoading] = useState(false);
  const [favError, setFavError] = useState<string | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [coverUploading, setCoverUploading] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [bioError, setBioError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [bioDraft, setBioDraft] = useState('');
  const [bioEditing, setBioEditing] = useState(false);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    window.setTimeout(() => setSuccessMsg(null), 4000);
  }, []);

  const loadNestProfile = useCallback(async () => {
    if (!apiAccessToken) return;
    const me = await nestFetchMe(apiAccessToken);
    /** Při chybě GET /users/me nesmazat už načtené URL — držíme stav z auth / posledního uploadu. */
    if (!me) return;
    setNestAvatar(me.avatarUrl ?? null);
    setNestCover(me.coverImageUrl ?? null);
    setNestBio(me.bio ?? null);
    setBioDraft(me.bio ?? '');
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

  /** Po návratu na stránku: pokud Nest /users/me nestihl, použij avatar z auth session. */
  useEffect(() => {
    if (user?.avatar) {
      setNestAvatar((prev) => prev ?? user.avatar ?? null);
    }
  }, [user?.avatar]);

  useEffect(() => {
    const c = user?.coverImage;
    if (typeof c === 'string' && c.trim()) {
      setNestCover((prev) => prev ?? c);
    }
  }, [user?.coverImage]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  const avatarUrl = nestAvatar ?? user?.avatar ?? null;
  const coverUrl = nestCover ?? (user as { coverImage?: string | null })?.coverImage ?? null;
  const bioText = nestBio ?? (user as { bio?: string | null })?.bio ?? null;

  const imgSrc = useMemo(() => {
    if (!avatarUrl) return null;
    if (/^https?:\/\//i.test(avatarUrl)) return avatarUrl;
    if (avatarUrl.startsWith('/uploads/')) {
      return nestAbsoluteAssetUrl(avatarUrl) || avatarUrl;
    }
    return avatarUrl;
  }, [avatarUrl]);

  const coverSrc = useMemo(() => {
    if (!coverUrl) return null;
    if (/^https?:\/\//i.test(coverUrl)) return coverUrl;
    if (coverUrl.startsWith('/uploads/')) {
      return nestAbsoluteAssetUrl(coverUrl) || coverUrl;
    }
    return coverUrl;
  }, [coverUrl]);

  const displayAvatarSrc = avatarPreview ?? imgSrc;
  const displayCoverSrc = coverPreview ?? coverSrc;

  async function onAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !apiAccessToken) return;
    const err = assertImageFile(file);
    if (err) {
      setAvatarError(err);
      return;
    }
    setAvatarError(null);
    const local = URL.createObjectURL(file);
    setAvatarPreview(local);
    setAvatarUploading(true);
    const res = await nestUploadAvatar(apiAccessToken, file);
    setAvatarUploading(false);
    URL.revokeObjectURL(local);
    setAvatarPreview(null);
    if (res.error) {
      setAvatarError(res.error);
      return;
    }
    if (res.avatarUrl) {
      setNestAvatar(res.avatarUrl);
    }
    await refresh();
    setUser((prev) =>
      prev
        ? {
            ...prev,
            avatar: res.avatarUrl ?? prev.avatar ?? null,
          }
        : prev,
    );
    showSuccess('Profilová fotka byla uložena.');
  }

  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !apiAccessToken) return;
    const err = assertImageFile(file);
    if (err) {
      setCoverError(err);
      return;
    }
    setCoverError(null);
    const local = URL.createObjectURL(file);
    setCoverPreview(local);
    setCoverUploading(true);
    const res = await nestUploadCover(apiAccessToken, file);
    setCoverUploading(false);
    URL.revokeObjectURL(local);
    setCoverPreview(null);
    if (res.error) {
      setCoverError(res.error);
      return;
    }
    if (res.coverImageUrl) {
      setNestCover(res.coverImageUrl);
    }
    await refresh();
    setUser((prev) =>
      prev
        ? {
            ...prev,
            coverImage: res.coverImageUrl ?? prev.coverImage ?? null,
          }
        : prev,
    );
    showSuccess('Cover obrázek byl uložen.');
  }

  async function onDeleteCover() {
    if (!apiAccessToken) return;
    setCoverError(null);
    setCoverUploading(true);
    const res = await nestDeleteCover(apiAccessToken);
    setCoverUploading(false);
    if (!res.ok) {
      setCoverError(res.error ?? 'Smazání cover se nezdařilo.');
      return;
    }
    setNestCover(null);
    await refresh();
    setUser((prev) => (prev ? { ...prev, coverImage: null } : prev));
    showSuccess('Cover byl odstraněn.');
  }

  async function onSaveBio() {
    if (!apiAccessToken) return;
    if (bioDraft.length > BIO_MAX) {
      setBioError(`Bio může mít maximálně ${BIO_MAX} znaků.`);
      return;
    }
    setBioError(null);
    setBioSaving(true);
    const res = await nestPatchProfileBio(apiAccessToken, bioDraft.trim() || null);
    setBioSaving(false);
    if (!res.ok) {
      setBioError(res.error ?? 'Uložení bio se nezdařilo.');
      return;
    }
    setNestBio(res.bio ?? null);
    setBioEditing(false);
    await refresh();
    setUser((prev) => (prev ? { ...prev, bio: res.bio ?? null } : prev));
    showSuccess('Popis „O mně“ byl uložen.');
  }

  if (isLoading) {
    return (
      <div className="flex h-[100dvh] items-center justify-center overflow-y-auto bg-[#fafafa] text-zinc-600">
        Načítání…
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="mx-auto h-[100dvh] max-w-lg overflow-y-auto px-4 py-16 text-center">
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
    <div className="min-h-[100dvh] overflow-x-hidden bg-[#fafafa] pb-16 text-zinc-900">
      <div className="mx-auto max-w-3xl px-4 pt-6 sm:px-6">
        <Link href="/" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Domů
        </Link>
      </div>

      {successMsg ? (
        <div className="mx-auto mt-4 max-w-3xl px-4 sm:px-6">
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
          >
            {successMsg}
          </div>
        </div>
      ) : null}

      <div className="mx-auto mt-6 max-w-3xl px-4 sm:px-6">
        <section className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-sm">
          {/* Cover */}
          <div className="relative aspect-[21/9] min-h-[140px] w-full sm:min-h-[168px] md:aspect-[3/1] md:min-h-[200px]">
            {displayCoverSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayCoverSrc}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-orange-400 via-rose-400 to-violet-600 opacity-95" />
            )}
            {coverUploading ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black/35 text-sm font-medium text-white backdrop-blur-[2px]">
                Nahrávám cover…
              </div>
            ) : null}
          </div>

          <div className="relative px-4 pb-8 pt-0 sm:px-8">
            <div className="-mt-14 flex flex-col gap-6 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-end">
                <div className="relative shrink-0">
                  <div className="rounded-full bg-white p-1 shadow-md ring-2 ring-white">
                    {displayAvatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={displayAvatarSrc}
                        alt=""
                        className="size-28 rounded-full object-cover sm:size-32"
                      />
                    ) : (
                      <div className="flex size-28 items-center justify-center rounded-full bg-zinc-100 text-3xl font-semibold text-zinc-500 sm:size-32">
                        {user.email.charAt(0).toUpperCase()}
                      </div>
                    )}
                    {avatarUploading ? (
                      <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs font-medium text-white">
                        Nahrávám…
                      </div>
                    ) : null}
                  </div>
                </div>
                <div className="min-w-0 text-center sm:pb-1 sm:text-left">
                  <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    {user.email}
                  </h1>
                  {bioText && !bioEditing ? (
                    <p className="mt-2 max-w-xl whitespace-pre-wrap text-sm leading-relaxed text-zinc-600">
                      {bioText}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-2 sm:justify-end">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept={ACCEPT_IMAGES}
                  className="hidden"
                  disabled={avatarUploading || !apiAccessToken}
                  onChange={(ev) => void onAvatarChange(ev)}
                />
                <button
                  type="button"
                  disabled={avatarUploading || !apiAccessToken}
                  onClick={() => avatarInputRef.current?.click()}
                  className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800 disabled:opacity-50"
                >
                  Změnit profilovou fotku
                </button>
                <input
                  ref={coverInputRef}
                  type="file"
                  accept={ACCEPT_IMAGES}
                  className="hidden"
                  disabled={coverUploading || !apiAccessToken}
                  onChange={(ev) => void onCoverChange(ev)}
                />
                <button
                  type="button"
                  disabled={coverUploading || !apiAccessToken}
                  onClick={() => coverInputRef.current?.click()}
                  className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 disabled:opacity-50"
                >
                  Změnit cover
                </button>
                {coverSrc ? (
                  <button
                    type="button"
                    disabled={coverUploading || !apiAccessToken}
                    onClick={() => void onDeleteCover()}
                    className="rounded-full border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Smazat cover
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!apiAccessToken}
                  onClick={() => {
                    setBioEditing((v) => !v);
                    setBioDraft(bioText ?? '');
                    setBioError(null);
                  }}
                  className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-900 transition hover:bg-orange-100 disabled:opacity-50"
                >
                  {bioEditing ? 'Zrušit úpravu bio' : 'Upravit bio'}
                </button>
              </div>
            </div>

            {avatarError ? (
              <p className="mt-4 text-sm text-red-600">{avatarError}</p>
            ) : null}
            {coverError ? (
              <p className="mt-2 text-sm text-red-600">{coverError}</p>
            ) : null}

            {bioEditing ? (
              <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4">
                <label className="block text-sm font-semibold text-zinc-800">
                  O mně (max. {BIO_MAX} znaků)
                </label>
                <textarea
                  value={bioDraft}
                  onChange={(e) => setBioDraft(e.target.value)}
                  rows={5}
                  maxLength={BIO_MAX}
                  className="mt-2 w-full resize-y rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none ring-orange-500/30 focus:ring-2"
                  placeholder="Krátký popis o sobě…"
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-zinc-500">
                    {bioDraft.length}/{BIO_MAX}
                  </span>
                  <button
                    type="button"
                    disabled={bioSaving || !apiAccessToken}
                    onClick={() => void onSaveBio()}
                    className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                  >
                    {bioSaving ? 'Ukládám…' : 'Uložit bio'}
                  </button>
                </div>
                {bioError ? <p className="mt-2 text-sm text-red-600">{bioError}</p> : null}
              </div>
            ) : null}

            {!apiAccessToken ? (
              <p className="mt-6 text-xs text-amber-800">
                Pro změny profilu přes Nest API nastavte{' '}
                <code className="rounded bg-amber-100 px-1">NEXT_PUBLIC_API_URL</code> a přihlaste se
                (JWT v cookie).
              </p>
            ) : null}
          </div>
        </section>

        <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-zinc-900">Zprávy</h2>
            {unreadMessages > 0 ? (
              <span className="rounded-full bg-orange-500 px-2.5 py-0.5 text-xs font-bold text-white">
                {unreadMessages > 99 ? '99+' : unreadMessages} nových
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            Doručené a odeslané zprávy k inzerátům. Po otevření konverzace se nepřečtené označí jako
            přečtené.
          </p>
          <Link
            href="/profil/zpravy"
            className="mt-4 inline-flex items-center justify-center rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-800"
          >
            Otevřít schránku
          </Link>
        </section>

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
