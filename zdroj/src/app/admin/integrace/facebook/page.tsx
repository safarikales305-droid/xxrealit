'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestFacebookConfigStatus,
  type FacebookConfigStatus,
} from '@/lib/nest-client';

export default function AdminFacebookIntegrationPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [config, setConfig] = useState<FacebookConfigStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setLoadError(null);
    setRefreshing(true);
    const data = await nestFacebookConfigStatus();
    setRefreshing(false);
    if (!data) {
      setLoadError('Nepodařilo se načíst stav Facebook integrace.');
      setConfig(null);
      return;
    }
    setConfig(data);
  }, []);

  useEffect(() => {
    if (!isLoading && (!user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  useEffect(() => {
    if (user?.role === 'ADMIN') void refresh();
  }, [user?.role, refresh]);

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  const configured = config?.configured ?? false;

  return (
    <div className="min-h-screen bg-zinc-50 px-4 py-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Integrace
            </p>
            <h1 className="text-xl font-bold text-zinc-900">Facebook</h1>
            <p className="mt-1 text-sm text-zinc-600">
              Konfigurace Meta aplikace pro propojení Facebook stránek profesionálů.
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
              Stav konfigurace
            </p>
            <p
              className={`mt-2 text-lg font-bold ${configured ? 'text-emerald-700' : 'text-amber-700'}`}
            >
              {configured ? 'Nakonfigurováno' : 'Není nakonfigurováno'}
            </p>
            {!configured && config?.missing?.length ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-zinc-800">Chybějící povinné proměnné:</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-zinc-700">
                  {config.missing.map((key) => (
                    <li key={key}>
                      <code className="rounded bg-zinc-100 px-1 text-xs">{key}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {config?.envChecks?.length ? (
              <div className="mt-4">
                <p className="text-sm font-medium text-zinc-800">Kontrola env proměnných (runtime):</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {config.envChecks.map((row) => (
                    <li key={row.key} className="flex flex-wrap items-center gap-2">
                      <code className="rounded bg-zinc-100 px-1 text-xs">{row.key}</code>
                      <span
                        className={
                          row.present
                            ? 'font-semibold text-emerald-700'
                            : 'font-semibold text-amber-800'
                        }
                      >
                        {row.present ? 'OK' : 'chybí'}
                      </span>
                      {!row.required ? (
                        <span className="text-xs text-zinc-500">(doporučeno)</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {config?.recommendedMissing?.length ? (
              <div className="mt-3">
                <p className="text-sm font-medium text-zinc-800">Doporučené proměnné:</p>
                <ul className="mt-1 list-disc pl-5 text-sm text-zinc-600">
                  {config.recommendedMissing.map((key) => (
                    <li key={key}>
                      <code className="rounded bg-zinc-100 px-1 text-xs">{key}</code>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">URI</p>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-medium text-zinc-800">OAuth Redirect URI</dt>
                <dd className="mt-1 break-all font-mono text-xs text-zinc-600">
                  {config?.oauthRedirectUri ?? '— nastavte FACEBOOK_OAUTH_REDIRECT_URI —'}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-800">Webhook URI</dt>
                <dd className="mt-1 break-all font-mono text-xs text-zinc-600">
                  {config?.webhookUri ??
                    '— nastavte API_PUBLIC_URL a FACEBOOK_WEBHOOK_VERIFY_TOKEN —'}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-zinc-700">
              Podrobný návod krok za krokem je v souboru{' '}
              <code className="rounded bg-zinc-100 px-1 text-xs">ADMIN_SETUP_FACEBOOK.md</code>{' '}
              v kořeni repozitáře (Meta App, App ID, App Secret, Railway Variables).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/admin/facebook-propojeni"
                className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
              >
                Přehled uživatelských propojení →
              </Link>
              <button
                type="button"
                disabled={refreshing}
                onClick={() => void refresh()}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
              >
                {refreshing ? 'Obnovuji…' : 'Obnovit stav'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
