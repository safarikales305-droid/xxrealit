'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ContactLeadModal } from '@/components/listing/ContactLeadModal';
import { nestListingUnlockContact } from '@/lib/nest-client';
import { isTipListing } from '@/lib/is-tip-listing';

export type ContactGateListing = {
  id: string;
  contactUnlocked?: boolean;
  sellerContactVisible?: boolean;
  buyerInterestSubmitted?: boolean;
  contactUnlockPrice?: number;
  contactUnlockAvailable?: boolean;
  isTiparTip?: boolean;
  isTip?: boolean;
};

type UseContactGateOptions = {
  listing: ContactGateListing;
  isOwner: boolean;
  isAuthenticated: boolean;
  apiAccessToken: string | null;
  viewerRole?: string | null;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  onAfterUnlock?: () => void;
  onLoginRequired?: () => void;
};

const PROPERTY_SEEKER_TIP_MSG =
  'Tip na nemovitost je dostupný pouze uživatelům s placeným kreditem.';

export function useContactGate({
  listing,
  isOwner,
  isAuthenticated,
  apiAccessToken,
  viewerRole = null,
  defaultName = '',
  defaultEmail = '',
  defaultPhone = '',
  onAfterUnlock,
  onLoginRequired,
}: UseContactGateOptions) {
  const listingId = listing.id;
  const isTip = isTipListing(listing);
  const isPropertySeekerViewer = viewerRole === 'PROPERTY_SEEKER';
  const propertySeekerTipBlocked = isTip && isPropertySeekerViewer;
  const contactUnlockPrice = listing.contactUnlockPrice ?? 0;
  const contactUnlockAvailable = listing.contactUnlockAvailable !== false;

  const [localUnlocked, setLocalUnlocked] = useState(false);
  const [interestSubmitted, setInterestSubmitted] = useState(
    Boolean(listing.buyerInterestSubmitted),
  );
  const [contactLeadOpen, setContactLeadOpen] = useState(false);
  const [contactLeadBusy, setContactLeadBusy] = useState(false);
  const [contactLeadError, setContactLeadError] = useState<string | null>(null);
  const [showCreditModal, setShowCreditModal] = useState(false);
  const [contactSuccessMsg, setContactSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    setInterestSubmitted(Boolean(listing.buyerInterestSubmitted));
    setLocalUnlocked(false);
    setContactSuccessMsg(null);
  }, [listing.id, listing.buyerInterestSubmitted, listing.contactUnlocked, listing.sellerContactVisible]);

  const contactRevealed =
    isOwner ||
    Boolean(listing.contactUnlocked) ||
    Boolean(listing.sellerContactVisible) ||
    localUnlocked;
  const contactLocked = !isOwner && !contactRevealed;

  const openContactForm = useCallback(() => {
    if (!isAuthenticated || !apiAccessToken) {
      onLoginRequired?.();
      return;
    }
    if (propertySeekerTipBlocked) {
      setContactLeadError(PROPERTY_SEEKER_TIP_MSG);
      return;
    }
    if (isOwner || contactRevealed) return;
    if (!isTip && interestSubmitted) return;
    setContactLeadError(null);
    setContactLeadOpen(true);
  }, [
    apiAccessToken,
    contactRevealed,
    interestSubmitted,
    isAuthenticated,
    isOwner,
    isTip,
    onLoginRequired,
    propertySeekerTipBlocked,
  ]);

  const requestMessaging = useCallback(
    (onAllowed: () => void, listingOverride?: ContactGateListing) => {
      const target = listingOverride ?? listing;
      const revealed =
        isOwner ||
        Boolean(target.contactUnlocked) ||
        Boolean(target.sellerContactVisible);
      const locked = !isOwner && !revealed;

      if (!isAuthenticated || !apiAccessToken) {
        onLoginRequired?.();
        return 'login-required' as const;
      }
      if (isTipListing(target) && viewerRole === 'PROPERTY_SEEKER') {
        setContactLeadError(PROPERTY_SEEKER_TIP_MSG);
        return 'contact-required' as const;
      }
      if (isOwner) return 'own-listing' as const;
      if (locked) {
        setContactLeadError(null);
        setContactLeadOpen(true);
        return 'contact-required' as const;
      }
      onAllowed();
      return 'allowed' as const;
    },
    [
      apiAccessToken,
      isAuthenticated,
      isOwner,
      listing,
      onLoginRequired,
      viewerRole,
    ],
  );

  const submitContactUnlock = useCallback(
    async (
      lead: { name: string; email: string; phone: string; message?: string },
      listingOverride?: ContactGateListing,
    ) => {
      const targetId = listingOverride?.id ?? listingId;
      if (!apiAccessToken) return;
      setContactLeadBusy(true);
      setContactLeadError(null);
      const r = await nestListingUnlockContact(apiAccessToken, targetId, lead);
      setContactLeadBusy(false);
      if (!r.ok) {
        if (r.code === 'PROPERTY_SEEKER_TIP_BLOCKED') {
          setContactLeadError(
            r.error ?? PROPERTY_SEEKER_TIP_MSG,
          );
          return;
        }
        if (r.code === 'INSUFFICIENT_CREDIT') {
          setContactLeadOpen(false);
          setShowCreditModal(true);
          return;
        }
        if (r.code === 'BONUS_NOT_ALLOWED_FOR_TIP' || r.code === 'REAL_CREDIT_REQUIRED') {
          setContactLeadError(
            r.error ?? 'Pro odemknutí tipu je nutné dobít placený kredit přes QR kód.',
          );
          return;
        }
        setContactLeadError(
          r.error ?? (isTip ? 'Odemčení kontaktu se nezdařilo.' : 'Odeslání zájmu se nezdařilo.'),
        );
        return;
      }
      if (!r.data) {
        setContactLeadError(
          isTip ? 'Odemčení kontaktu se nezdařilo.' : 'Odeslání zájmu se nezdařilo.',
        );
        return;
      }

      setContactLeadOpen(false);

      const unlocked =
        r.data.contactUnlocked === true ||
        r.data.alreadyUnlocked === true ||
        r.data.sellerContactVisible === true ||
        r.data.status === 'UNLOCKED' ||
        Boolean(r.data.phone || r.data.email || r.data.contactName);

      if (!isTip && r.data.submitted) {
        setInterestSubmitted(true);
        setContactSuccessMsg(
          r.data.message ?? 'Děkujeme, prodejce vás bude brzy kontaktovat.',
        );
      } else if (unlocked) {
        setContactSuccessMsg('Kontakt byl odemčen. Vaše údaje byly odeslány inzerentovi.');
      }

      if (unlocked) {
        setLocalUnlocked(true);
        onAfterUnlock?.();
      }
    },
    [apiAccessToken, isTip, listingId, onAfterUnlock],
  );

  const [activeListing, setActiveListing] = useState<ContactGateListing>(listing);

  useEffect(() => {
    setActiveListing(listing);
  }, [listing]);

  const submitForActiveListing = useCallback(
    (lead: { name: string; email: string; phone: string; message?: string }) =>
      submitContactUnlock(lead, activeListing),
    [activeListing, submitContactUnlock],
  );

  const requestMessagingFor = useCallback(
    (target: ContactGateListing, onAllowed: () => void) => {
      setActiveListing(target);
      return requestMessaging(onAllowed, target);
    },
    [requestMessaging],
  );

  return {
    isTip,
    propertySeekerTipBlocked,
    propertySeekerTipMessage: PROPERTY_SEEKER_TIP_MSG,
    contactLocked,
    contactRevealed,
    contactUnlockPrice,
    contactUnlockAvailable,
    interestSubmitted,
    contactSuccessMsg,
    contactLeadOpen,
    contactLeadBusy,
    contactLeadError,
    showCreditModal,
    setShowCreditModal,
    setContactLeadOpen,
    openContactForm,
    requestMessaging,
    requestMessagingFor,
    submitContactUnlock,
    submitForActiveListing,
  };
}

type ContactGateModalsProps = {
  gate: ReturnType<typeof useContactGate>;
  defaultName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
};

export function ContactGateModals({
  gate,
  defaultName = '',
  defaultEmail = '',
  defaultPhone = '',
}: ContactGateModalsProps) {
  return (
    <>
      <ContactLeadModal
        open={gate.contactLeadOpen}
        busy={gate.contactLeadBusy}
        error={gate.contactLeadError}
        defaultName={defaultName}
        defaultEmail={defaultEmail}
        defaultPhone={defaultPhone}
        unlockPrice={gate.contactUnlockPrice}
        mode={gate.isTip ? 'unlock' : 'interest'}
        onClose={() => gate.setContactLeadOpen(false)}
        onSubmit={(lead) => void gate.submitForActiveListing(lead)}
      />

      {gate.showCreditModal && !gate.propertySeekerTipBlocked ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold">Dobijte kredit</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Nemáte dostatek kreditu pro zobrazení kontaktu. Dobijte si kredit v profilu.
            </p>
            <div className="mt-4 flex gap-2">
              <Link
                href="/profil/dashboard?tab=settings"
                className="rounded-full bg-[#e85d00] px-4 py-2 text-sm font-semibold text-white"
              >
                Dobít kredit
              </Link>
              <button
                type="button"
                onClick={() => gate.setShowCreditModal(false)}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700"
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
