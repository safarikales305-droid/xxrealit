import { redirect } from 'next/navigation';

const RESERVED = new Set(['tipy', 'zpravy', 'dashboard', 'podpora', 'komunikace']);

/** /profil/:id → veřejný profil (legacy odkazy z katalogu makléřů). */
export default async function ProfilUserRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ fromListing?: string }>;
}) {
  const { id } = await params;
  const fromListing = (await searchParams).fromListing?.trim();
  const trimmed = id.trim();
  if (!trimmed || RESERVED.has(trimmed)) {
    redirect('/profil');
  }
  const qs = fromListing ? `?fromListing=${encodeURIComponent(fromListing)}` : '';
  redirect(`/profile/${encodeURIComponent(trimmed)}${qs}`);
}
