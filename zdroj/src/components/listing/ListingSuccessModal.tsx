'use client';

import Link from 'next/link';
import { ListingPublishStatusPanel } from '@/components/listing/ListingPublishStatusPanel';
import type { PropertyCreationMeta } from '@/lib/nest-client';

type Props = {
  open: boolean;
  propertyId: string;
  requiresApproval: boolean;
  listingStatus: string;
  bonusMessage?: string | null;
  socialPublish: PropertyCreationMeta['socialPublish'];
  onAddAnother: () => void;
  onClose: () => void;
};

export function ListingSuccessModal({
  open,
  propertyId,
  requiresApproval,
  listingStatus,
  bonusMessage,
  socialPublish,
  onAddAnother,
  onClose,
}: Props) {
  if (!open) return null;

  const isActive = !requiresApproval && (listingStatus === 'ACTIVE' || listingStatus === 'APPROVED');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl sm:p-8"
      >
        <div className="text-center">
          <div className="text-4xl">✅</div>
          <h2 className="mt-3 text-2xl font-bold tracking-tight text-zinc-900">
            Inzerát byl úspěšně vložen
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-zinc-600">
            {isActive
              ? 'Váš inzerát je nyní aktivní a zobrazuje se na portálu XXREALIT.'
              : 'Inzerát čeká na schválení administrátorem. Po schválení se zobrazí veřejně.'}
          </p>
        </div>

        {bonusMessage ? (
          <p className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-medium text-orange-900">
            {bonusMessage}
          </p>
        ) : null}

        <div className="mt-6">
          <ListingPublishStatusPanel summary={socialPublish} />
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Link
            href={`/inzerat/upravit/${propertyId}`}
            className="inline-flex items-center justify-center rounded-xl bg-[#ff6a00] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#e85f00]"
          >
            Přejít do správy inzerátu
          </Link>
          <Link
            href={`/nemovitost/${propertyId}`}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Zobrazit inzerát
          </Link>
          <Link
            href={`/inzerat/shorts-editor/${propertyId}`}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Vytvořit Shorts video z fotek
          </Link>
          <button
            type="button"
            onClick={onAddAnother}
            className="inline-flex items-center justify-center rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
          >
            Přidat další inzerát
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-xl px-4 py-2 text-sm text-zinc-500 hover:text-zinc-800"
        >
          Zavřít
        </button>
      </div>
    </div>
  );
}
