'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ContactLeadModal } from '@/components/listing/ContactLeadModal';
import { useAuth } from '@/hooks/use-auth';
import { FacebookShortsShare } from '@/components/share/FacebookShortsShare';
import { ShortsVideoFrame } from '@/components/tipar/shorts-video-frame';
import { listingShareUrl, tipShareUrl } from '@/lib/public-share-url';
import {
  nestFetchMe,
  nestTiparGetPost,
  nestTiparUnlockContact,
  type TiparPostRow,
} from '@/lib/nest-client';

type Props = {
  id: string;
};

export function TiparDetailClient({ id }: Props) {
  const router = useRouter();
  const { user, apiAccessToken } = useAuth();
  const [post, setPost] = useState<TiparPostRow | null>(null);
  const [credit, setCredit] = useState<number | null>(null);
  const [contactLeadOpen, setContactLeadOpen] = useState(false);
  const [contactLeadBusy, setContactLeadBusy] = useState(false);
  const [contactLeadError, setContactLeadError] = useState<string | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [revealedContact, setRevealedContact] = useState<{
    contactName: string | null;
    contactPhone: string | null;
    contactEmail: string | null;
  } | null>(null);

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

  const shareUrl = useMemo(() => {
    if (post?.publishedPropertyId) {
      return listingShareUrl(post.publishedPropertyId, {
        listingType: post.isShorts ? 'SHORTS' : 'CLASSIC',
        videoUrl: post.videoUrl ?? post.generatedVideoUrl,
      });
    }
    if (!post) return tipShareUrl(id, false);
    return tipShareUrl(id, Boolean(post.isShorts));
  }, [id, post]);

  function handleShowContact() {
    if (!apiAccessToken) {
      router.push(`/login?redirect=${encodeURIComponent(`/tipar/${id}`)}`);
      return;
    }
    setContactLeadError(null);
    setContactLeadOpen(true);
  }

  async function handleContactLeadSubmit(lead: { name: string; email: string; phone: string }) {
    if (!apiAccessToken || !post) return;
    setContactLeadBusy(true);
    setContactLeadError(null);
    const r = await nestTiparUnlockContact(apiAccessToken, post.id, lead);
    setContactLeadBusy(false);
    if (!r.ok) {
      if (r.code === 'INSUFFICIENT_CREDIT') {
        setContactLeadOpen(false);
        setShowCreditModal(true);
        return;
      }
      setContactLeadError(r.error ?? 'Odemčení kontaktu selhalo');
      return;
    }
    if (r.data?.creditBalance != null) setCredit(r.data.creditBalance);
    if (r.data?.contact) {
      setRevealedContact(r.data.contact);
    }
    setContactLeadOpen(false);
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

  const unlocked = Boolean(post.contactUnlocked) || Boolean(revealedContact);
  const contactUnlockAvailable = post.contactUnlockAvailable !== false;
  const displayContact = revealedContact ?? post.contact;
  const heroImage = post.mainImage ?? post.images?.[0] ?? null;
  const galleryImages = (post.images ?? []).filter((url) => url !== heroImage);
  const playbackVideo = post.videoUrl || post.generatedVideoUrl || null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/" className="text-sm text-zinc-500 hover:underline">
        ← Zpět
      </Link>
      <div className="mt-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
        {playbackVideo ? (
          <ShortsVideoFrame src={playbackVideo} className="max-md:rounded-none" />
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

          <FacebookShortsShare
            listingUrl={shareUrl}
            title={post.title}
            city={post.city}
            price={post.propertyPrice}
            videoUrl={playbackVideo}
            apiAccessToken={apiAccessToken}
          />

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
                {displayContact?.contactName ? <p>{displayContact.contactName}</p> : null}
                {displayContact?.contactPhone ? (
                  <p>
                    <a href={`tel:${displayContact.contactPhone}`} className="font-semibold text-[#e85d00]">
                      {displayContact.contactPhone}
                    </a>
                  </p>
                ) : null}
                {displayContact?.contactEmail ? (
                  <p>
                    <a href={`mailto:${displayContact.contactEmail}`} className="font-semibold text-[#e85d00]">
                      {displayContact.contactEmail}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : contactUnlockAvailable ? (
              <>
                <p className="mt-2 text-sm text-zinc-600">
                  Kontakt je skrytý do vyplnění formuláře
                  {post.contactUnlockPrice > 0
                    ? ` a odečtení ${post.contactUnlockPrice.toLocaleString('cs-CZ')} Kč kreditu`
                    : ''}
                  .
                </p>
                {contactLeadError && !contactLeadOpen ? (
                  <p className="mt-2 text-sm text-red-600">{contactLeadError}</p>
                ) : null}
                <button
                  type="button"
                  disabled={!apiAccessToken}
                  onClick={handleShowContact}
                  className="mt-3 rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Zobrazit kontakt
                  {post.contactUnlockPrice > 0
                    ? ` (${post.contactUnlockPrice.toLocaleString('cs-CZ')} Kč)`
                    : ''}
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
            ) : (
              <p className="mt-2 text-sm text-zinc-600">Kontakt u tohoto tipu není vyplněný.</p>
            )}
          </section>
        </div>
      </div>

      <ContactLeadModal
        open={contactLeadOpen}
        busy={contactLeadBusy}
        error={contactLeadError}
        defaultName={user?.name ?? ''}
        defaultEmail={user?.email ?? ''}
        unlockPrice={post.contactUnlockPrice}
        onClose={() => setContactLeadOpen(false)}
        onSubmit={handleContactLeadSubmit}
      />

      {showCreditModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Dobijte si kredit</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Nemáte dostatek kreditu. Dobijte si kredit v profilu.
            </p>
            {credit != null ? (
              <p className="mt-2 text-sm">
                Váš kredit: <strong>{credit.toLocaleString('cs-CZ')} Kč</strong>
              </p>
            ) : null}
            <div className="mt-4 flex gap-2">
              <Link
                href="/profil"
                className="rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
              >
                Dobít kredit
              </Link>
              <button
                type="button"
                onClick={() => setShowCreditModal(false)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
