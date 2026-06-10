'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import {
  nestAdminApproveProfessionalVerification,
  nestAdminProfessionalVerificationRequests,
  nestAdminRejectProfessionalVerification,
  type ProfessionalVerificationRequestRow,
} from '@/lib/nest-client';

export default function AdminProfessionalVerificationPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [rows, setRows] = useState<ProfessionalVerificationRequestRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    const data = await nestAdminProfessionalVerificationRequests(token);
    if (!data) {
      setLoadError('Nepodařilo se načíst žádosti o ověření.');
      setRows([]);
      return;
    }
    setRows(data);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || !user || user.role !== 'ADMIN')) {
      router.replace('/');
    }
  }, [isLoading, token, user, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function approve(userId: string) {
    if (!token) return;
    if (!window.confirm('Schválit ověření profesionálního profilu?')) return;
    setBusyId(userId);
    setMsg(null);
    const r = await nestAdminApproveProfessionalVerification(token, userId);
    setBusyId(null);
    if (!r.ok) {
      setMsg(r.error ?? 'Schválení selhalo.');
      return;
    }
    setMsg('Profil byl schválen.');
    await refresh();
  }

  async function reject(userId: string) {
    if (!token) return;
    if (!window.confirm('Zamítnout žádost o ověření?')) return;
    setBusyId(userId);
    setMsg(null);
    const r = await nestAdminRejectProfessionalVerification(token, userId);
    setBusyId(null);
    if (!r.ok) {
      setMsg(r.error ?? 'Zamítnutí selhalo.');
      return;
    }
    setMsg('Žádost byla zamítnuta.');
    await refresh();
  }

  if (isLoading) {
    return <div className="min-h-[40vh] bg-zinc-50" />;
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Admin</p>
            <h1 className="text-xl font-bold text-zinc-900">Žádosti o ověření profesionálů</h1>
          </div>
          <Link href="/admin" className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">
            ← Administrace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        {loadError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</p>
        ) : null}
        {msg ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{msg}</p>
        ) : null}

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-600">
            Žádné čekající žádosti o ověření.
          </div>
        ) : (
          <ul className="space-y-4">
            {rows.map((row) => {
              const avatar =
                row.avatarUrl && row.avatarUrl.trim()
                  ? nestAbsoluteAssetUrl(row.avatarUrl) || row.avatarUrl
                  : null;
              return (
                <li
                  key={row.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col gap-4 sm:flex-row">
                    <div className="size-16 shrink-0 overflow-hidden rounded-full bg-zinc-100">
                      {avatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={avatar} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="flex size-full items-center justify-center text-lg font-semibold text-zinc-400">
                          {(row.name ?? row.email).charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-semibold text-zinc-900">{row.name ?? 'Bez jména'}</p>
                      <p className="text-sm text-zinc-600">{row.email}</p>
                      <p className="mt-1 text-sm font-medium text-orange-800">{row.roleLabel}</p>
                      {row.companyOrBrand ? (
                        <p className="text-sm text-zinc-600">{row.companyOrBrand}</p>
                      ) : null}
                      {row.requestedAt ? (
                        <p className="mt-1 text-xs text-zinc-500">
                          Žádost: {new Date(row.requestedAt).toLocaleString('cs-CZ')}
                        </p>
                      ) : null}
                      {row.bio ? (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">
                          {row.bio}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-row gap-2 sm:flex-col">
                      <button
                        type="button"
                        disabled={busyId === row.userId}
                        onClick={() => void approve(row.userId)}
                        className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        Schválit
                      </button>
                      <button
                        type="button"
                        disabled={busyId === row.userId}
                        onClick={() => void reject(row.userId)}
                        className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                      >
                        Zamítnout
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
