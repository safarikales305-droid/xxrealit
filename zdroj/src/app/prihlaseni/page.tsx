import { redirect } from 'next/navigation';

type Props = {
  searchParams?: Promise<{
    redirect?: string;
    callbackUrl?: string;
    email?: string;
    source?: string;
  }>;
};

export default async function PrihlaseniAliasPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const qs = new URLSearchParams();
  if (sp.redirect) qs.set('redirect', sp.redirect);
  if (sp.callbackUrl) qs.set('callbackUrl', sp.callbackUrl);
  if (sp.email) qs.set('email', sp.email);
  if (sp.source) qs.set('source', sp.source);
  const suffix = qs.toString();
  redirect(suffix ? `/login?${suffix}` : '/login');
}
