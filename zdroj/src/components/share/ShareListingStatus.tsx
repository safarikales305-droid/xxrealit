import Link from 'next/link';

type Props = {
  title: string;
  message: string;
  listingId?: string;
};

export function ShareListingNotFound({ title, message, listingId }: Props) {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-2xl flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-bold text-zinc-900">{title}</h1>
      <p className="mt-3 text-sm text-zinc-600">{message}</p>
      {listingId ? (
        <p className="mt-2 break-all text-xs text-zinc-400">ID: {listingId}</p>
      ) : null}
      <Link
        href="/"
        className="mt-6 inline-flex rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-5 py-2.5 text-sm font-semibold text-white shadow-sm"
      >
        Zpět na úvod
      </Link>
    </div>
  );
}

export function ShareListingInactive({ listingId }: { listingId?: string }) {
  return (
    <ShareListingNotFound
      title="Inzerát již není aktivní"
      message="Tento odkaz vede na inzerát, který byl vypnutý, vypršel nebo byl stažen z nabídky."
      listingId={listingId}
    />
  );
}
