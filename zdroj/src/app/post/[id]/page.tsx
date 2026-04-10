import { redirect } from 'next/navigation';

type Props = { params: Promise<{ id: string }> };

export default async function PostLegacyRedirect({ params }: Props) {
  const { id } = await params;
  redirect(`/prispevky/${encodeURIComponent(id)}`);
}
