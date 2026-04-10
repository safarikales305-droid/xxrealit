import { redirect } from 'next/navigation';

type Props = {
  searchParams?: Promise<{ redirect?: string; callbackUrl?: string }>;
};

export default async function PrihlaseniAliasPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  if (sp.redirect) qs.set('redirect', sp.redirect);
  if (sp.callbackUrl) qs.set('callbackUrl', sp.callbackUrl);
  const suffix = qs.toString();
  redirect(suffix ? `/login?${suffix}` : '/login');
}
