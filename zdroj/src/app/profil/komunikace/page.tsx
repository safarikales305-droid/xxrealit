'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { CommunicationShell } from '@/components/communication/CommunicationShell';
import { useAuth } from '@/hooks/use-auth';
import { canAccessCommunication } from '@/lib/communication-roles';

export default function KomunikaceHubPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/prihlaseni?redirect=/profil/komunikace');
      return;
    }
    if (!canAccessCommunication(user.role)) {
      router.replace('/profil/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading || !user || !canAccessCommunication(user.role)) {
    return <div className="px-4 py-12 text-center text-zinc-500">Načítám…</div>;
  }

  const cards = [
    {
      href: '/profil/podpora',
      title: 'Moje komunikace s podporou',
      desc: 'Dotazy na portál, technická podpora a odpovědi zákaznického centra.',
    },
    {
      href: '/profil/komunikace/whatsapp',
      title: 'WhatsApp centrum',
      desc: 'Odesílání zpráv, historie a hromadné oslovení zájemců o inzerát.',
    },
    {
      href: '/profil/komunikace/emaily',
      title: 'E-mail centrum',
      desc: 'Individuální i hromadné e-maily, šablony a historie odeslání.',
    },
    {
      href: '/profil/marketing',
      title: 'Hromadné kampaně',
      desc: 'Marketing přes WhatsApp, e-mail nebo interní zprávu podle cílové skupiny.',
    },
    {
      href: '/profil/kontakty',
      title: 'CRM zájemců',
      desc: 'Kontakty, poznámky, štítky, připomínky a export do CSV.',
    },
  ];

  return (
    <CommunicationShell title="Přehled">
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-orange-200 hover:shadow-md"
          >
            <p className="font-semibold text-zinc-900">{c.title}</p>
            <p className="mt-2 text-sm text-zinc-600">{c.desc}</p>
          </Link>
        ))}
      </div>
    </CommunicationShell>
  );
}
