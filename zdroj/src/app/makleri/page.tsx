import { redirect } from 'next/navigation';

type Props = { searchParams: Promise<Record<string, string | undefined>> };

export default async function MakleriRedirectPage({ searchParams }: Props) {
  const params = await searchParams;
  const qs = new URLSearchParams({ filter: 'agents', ...params });
  redirect(`/profesionalove?${qs.toString()}`);
}
