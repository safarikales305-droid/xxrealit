'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminWhatsAppStats,
  type WhatsAppAdminStats,
} from '@/lib/nest-client';

export default function AdminWhatsAppIntegrationPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [stats, setStats] = useState<WhatsAppAdminStats | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const data = await nestAdminWhatsAppStats(token);
    if (!data) {
      setLoadError('Nepodařilo se načíst stav WhatsApp integrace.');
      setStats(null);
      return;
    }
    setStats(data);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  const configured = stats?.configured ?? false;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Integrace
            </p>
            <h1 className="text-xl font-bold text-zinc-900">WhatsApp</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Cloud API (volitelné) a přehled leadů z tlačítek wa.me.
            </p>
          </div>
          <Link
            href="/admin"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700"
          >
            ← Administrace
          </Link>
        </div>

        {loadError ? <p className="mb-3 text-sm text-red-600">{loadError}</p> : null}

        <div className="space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
              Cloud API — stav konfigurace
            </p>
            <p
              className={`mt-2 text-lg font-bold ${configured ? 'text-emerald-700' : 'text-amber-700'}`}
            >
              {configured ? 'Nakonfigurováno' : 'Není nakonfigurováno (wa.me funguje i bez API)'}
            </p>
            {!configured && stats?.missing?.length ? (
              <ul className="mt-3 list-disc pl-5 text-sm text-zinc-700">
                {stats.missing.map((key) => (
                  <li key={key}>
                    <code className="rounded bg-zinc-100 px-1 text-xs">{key}</code>
                  </li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-sm text-zinc-600">
              API verze: <code className="text-xs">{stats?.apiVersion ?? 'v20.0'}</code>
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Webhook URL</p>
            <p className="mt-2 break-all font-mono text-xs text-zinc-600">
              {stats?.webhookUri ?? '— nastavte API_PUBLIC_URL a WHATSAPP_WEBHOOK_VERIFY_TOKEN —'}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Záznamy zpráv
              </p>
              <p className="mt-2 text-2xl font-bold text-zinc-900">{stats?.messageCount ?? '—'}</p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                Kliknutí wa.me (leady)
              </p>
              <p className="mt-2 text-2xl font-bold text-zinc-900">{stats?.clickCount ?? '—'}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-zinc-900">Poslední chyby (Cloud API)</p>
            {!stats?.recentErrors?.length ? (
              <p className="mt-2 text-sm text-zinc-500">Žádné zaznamenané chyby.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                {stats.recentErrors.map((err) => (
                  <li
                    key={err.id}
                    className="rounded-lg border border-red-100 bg-red-50/50 px-3 py-2"
                  >
                    <p className="text-xs text-zinc-500">
                      {new Date(err.createdAt).toLocaleString('cs-CZ')}
                    </p>
                    <p className="mt-1">{err.message || 'Neznámá chyba'}</p>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
            >
              Obnovit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
