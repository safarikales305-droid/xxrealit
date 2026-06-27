'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { fetchMySupportTickets } from '@/lib/support-tickets-api';
import type { SupportTicket } from '@/lib/support-tickets';
import { supportCategoryLabel, supportStatusLabel } from '@/lib/support-tickets';
import { SupportContactButton } from '@/components/support/SupportContactButton';

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function statusClass(status: string): string {
  if (status === 'NEW' || status === 'WAITING_REPLY') return 'bg-amber-100 text-amber-900';
  if (status === 'RESOLVED' || status === 'CLOSED') return 'bg-green-100 text-green-800';
  return 'bg-blue-100 text-blue-900';
}

export default function ProfilPodporaPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, apiAccessToken } = useAuth();
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!apiAccessToken) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const data = await fetchMySupportTickets(apiAccessToken);
    setRows(data);
    setLoading(false);
  }, [apiAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/prihlaseni?redirect=/profil/podpora');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return <div className="px-4 py-12 text-center text-zinc-500">Načítám…</div>;
  }

  return (
    <div className="min-h-[100dvh] bg-[#fafafa] pb-16 text-zinc-900">
      <div className="mx-auto max-w-2xl px-4 pt-6 sm:px-6">
        <Link href="/profil/dashboard" className="text-sm font-semibold text-[#e85d00] hover:underline">
          ← Profil
        </Link>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Moje komunikace s podporou</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Všechny vaše dotazy a odpovědi zákaznické podpory na jednom místě.
        </p>

        <div className="mt-6">
          <SupportContactButton label="Napsat na podporu" />
        </div>

        {loading ? (
          <p className="mt-8 text-sm text-zinc-500">Načítám dotazy…</p>
        ) : rows.length === 0 ? (
          <p className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
            Zatím nemáte žádné dotazy. Použijte tlačítko výše pro kontakt s podporou.
          </p>
        ) : (
          <ul className="mt-6 space-y-2">
            {rows.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/profil/podpora/${t.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-orange-200 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-zinc-900">{t.subject}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {supportCategoryLabel(t.category)} · {t.publicId}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${statusClass(t.status)}`}
                    >
                      {supportStatusLabel(t.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-zinc-400">{formatWhen(t.lastMessageAt)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
