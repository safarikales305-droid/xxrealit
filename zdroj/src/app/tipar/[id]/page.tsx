'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestFetchMe,
  nestTiparGetPost,
  nestTiparUnlockContact,
  type TiparPostRow,
} from '@/lib/nest-client';

export default function TiparDetailPage() {
  const params = useParams<{ id: string }>();
  const id = (params?.id ?? '').trim();
  const { apiAccessToken } = useAuth();
  const [post, setPost] = useState<TiparPostRow | null>(null);
  const [credit, setCredit] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const row = await nestTiparGetPost(apiAccessToken, id);
      setPost(row);
    })();
  }, [id, apiAccessToken]);

  useEffect(() => {
    if (!apiAccessToken) return;
    void nestFetchMe(apiAccessToken).then((me) => {
      if (me) setCredit(me.creditBalance ?? 0);
    });
  }, [apiAccessToken]);

  async function unlock() {
    if (!apiAccessToken || !post) return;
    setBusy(true);
    setError(null);
    const r = await nestTiparUnlockContact(apiAccessToken, post.id);
    setBusy(false);
    if (!r.ok) {
      if (r.code === 'INSUFFICIENT_CREDIT') {
        setShowCreditModal(true);
        return;
      }
      setError(r.error ?? 'Odemčení kontaktu selhalo');
      return;
    }
    if (r.data?.creditBalance != null) setCredit(r.data.creditBalance);
    const refreshed = await nestTiparGetPost(apiAccessToken, post.id);
    if (refreshed) setPost(refreshed);
  }

  if (!post) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center text-sm text-zinc-500">
        Načítám tip…
      </main>
    );
  }

  const unlocked = Boolean(post.contactUnlocked);
  const heroImage = post.mainImage ?? post.images?.[0] ?? null;
  const galleryImages = (post.images ?? []).filter((url) => url !== heroImage);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Zpět
      </Link>
      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {post.videoUrl ? (
          <video
            src={post.videoUrl}
            controls
            playsInline
            className="aspect-[9/16] max-h-[70vh] w-full bg-black object-contain sm:max-h-[520px]"
          />
        ) : heroImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={heroImage} alt="" className="aspect-[4/3] w-full object-cover" />
        ) : null}

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">{post.title}</h1>
            {post.isShorts ? (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                Shorts tip na nemovitost
              </span>
            ) : null}
          </div>
          <p className="mt-2 text-sm text-zinc-600">{post.city}</p>
          {post.propertyPrice != null && post.propertyPrice > 0 ? (
            <p className="mt-1 text-lg font-semibold text-[#e85d00]">
              {post.propertyPrice.toLocaleString('cs-CZ')} Kč
            </p>
          ) : null}
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-800">
            {post.description}
          </p>
          {post.ownerNote ? (
            <p className="mt-3 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-700">{post.ownerNote}</p>
          ) : null}
          {post.sourceUrl ? (
            <a
              href={post.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-block text-sm font-semibold text-[#e85d00] hover:underline"
            >
              Odkaz na zdroj
            </a>
          ) : null}

          {galleryImages.length > 0 ? (
            <div className="mt-4">
              <h2 className="mb-2 text-sm font-semibold text-zinc-800">Galerie</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {galleryImages.map((url) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={url} src={url} alt="" className="h-28 w-full rounded-lg object-cover" />
                ))}
              </div>
            </div>
          ) : null}

          <section className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
          <h2 className="text-sm font-semibold text-zinc-900">Kontakt na prodejce</h2>
          {unlocked ? (
            <div className="mt-2 space-y-1 text-sm text-zinc-800">
              {post.contact?.contactName ? <p>{post.contact.contactName}</p> : null}
              {post.contact?.contactPhone ? (
                <p>
                  <a href={`tel:${post.contact.contactPhone}`} className="font-semibold text-[#e85d00]">
                    {post.contact.contactPhone}
                  </a>
                </p>
              ) : null}
              {post.contact?.contactEmail ? (
                <p>
                  <a href={`mailto:${post.contact.contactEmail}`} className="font-semibold text-[#e85d00]">
                    {post.contact.contactEmail}
                  </a>
                </p>
              ) : null}
            </div>
          ) : (
            <>
              <p className="mt-2 text-sm text-zinc-600">Kontakt je skrytý do odemčení kreditem.</p>
              {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
              <button
                type="button"
                disabled={busy || !apiAccessToken}
                onClick={() => void unlock()}
                className="mt-3 rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy
                  ? 'Zpracovávám…'
                  : `Získat kontakt za ${post.contactUnlockPrice.toLocaleString('cs-CZ')} Kč`}
              </button>
              {!apiAccessToken ? (
                <p className="mt-2 text-xs text-zinc-500">
                  Pro odemčení se{' '}
                  <Link href="/login" className="font-semibold text-[#e85d00]">
                    přihlaste
                  </Link>
                  .
                </p>
              ) : null}
            </>
          )}
        </section>
        </div>
      </div>

      {showCreditModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Dobijte si kredit</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Nemáte dostatek kreditu. Dobijte si kredit v administraci nebo kontaktujte podporu.
            </p>
            {credit != null ? (
              <p className="mt-2 text-sm">
                Váš kredit: <strong>{credit.toLocaleString('cs-CZ')} Kč</strong>
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => setShowCreditModal(false)}
              className="mt-4 rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Zavřít
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
