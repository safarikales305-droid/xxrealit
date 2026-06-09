import { redirect } from 'next/navigation';

const RESERVED = new Set(['tipy', 'zpravy', 'dashboard']);

/** /profil/:id → veřejný profil (legacy odkazy z katalogu makléřů). */
export default async function ProfilUserRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trimmed = id.trim();
  if (!trimmed || RESERVED.has(trimmed)) {
    redirect('/profil');
  }
  redirect(`/profile/${encodeURIComponent(trimmed)}`);
}
