'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { ROLE_LABELS, type UserRole } from '@/lib/roles';
import {
  nestAdminRegistrationRequirementPatch,
  nestAdminRegistrationRequirementsList,
  type RegistrationRequirementRoleSetting,
} from '@/lib/marketing-bonus';

const ROLES: UserRole[] = [
  'USER',
  'AGENT',
  'AGENCY',
  'COMPANY',
  'CRAFTSMAN',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
];

const FIELDS: Array<{
  key: keyof Omit<RegistrationRequirementRoleSetting, 'role' | 'updatedAt'>;
  label: string;
}> = [
  { key: 'requireFirstListing', label: 'Povinné vložení prvního inzerátu' },
  { key: 'requireFirstPost', label: 'Povinné vložení prvního příspěvku' },
  { key: 'requireFacebookPage', label: 'Povinné propojení Facebook stránky' },
  { key: 'requireProfileComplete', label: 'Povinné doplnění profilu' },
  { key: 'requirePhoneVerified', label: 'Povinné ověření telefonu' },
  { key: 'requireEmailVerified', label: 'Povinné ověření emailu' },
];

export default function AdminRegistrationSettingsPage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const [rows, setRows] = useState<RegistrationRequirementRoleSetting[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyRole, setBusyRole] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    const list = await nestAdminRegistrationRequirementsList(token);
    if (list) setRows(list);
  }, [token]);

  useEffect(() => {
    if (!isLoading && (!token || user?.role !== 'ADMIN')) router.replace('/');
  }, [isLoading, token, user?.role, router]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  async function toggle(
    role: string,
    key: keyof Omit<RegistrationRequirementRoleSetting, 'role' | 'updatedAt'>,
    value: boolean,
  ) {
    if (!token) return;
    setBusyRole(role);
    setMsg(null);
    const r = await nestAdminRegistrationRequirementPatch(token, role, { [key]: value });
    setBusyRole(null);
    if (!r.ok) {
      setMsg(r.error ?? 'Uložení selhalo.');
      return;
    }
    setRows((prev) => prev.map((row) => (row.role === role ? r.setting : row)));
    setMsg('Uloženo.');
  }

  if (isLoading) return <div className="min-h-[40vh] bg-zinc-50" />;

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <Link href="/admin" className="text-sm font-semibold text-orange-600 hover:underline">
          ← Administrace
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-zinc-900">Nastavení registrace</h1>
        <p className="mt-2 text-sm text-zinc-600">
          Povinné kroky po registraci podle role. Dokud uživatel nesplní aktivní podmínky, neuvidí
          běžný portál.
        </p>
        {msg ? <p className="mt-3 text-sm text-zinc-700">{msg}</p> : null}

        <div className="mt-8 space-y-6">
          {ROLES.map((role) => {
            const row = rows.find((r) => r.role === role);
            if (!row) return null;
            return (
              <section
                key={role}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <h2 className="text-lg font-semibold text-zinc-900">
                  {ROLE_LABELS[role] ?? role}
                </h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {FIELDS.map((field) => (
                    <label
                      key={field.key}
                      className="flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-100 bg-zinc-50/80 px-3 py-2.5"
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(row[field.key])}
                        disabled={busyRole === role}
                        onChange={(e) => void toggle(role, field.key, e.target.checked)}
                      />
                      <span className="text-sm text-zinc-800">{field.label}</span>
                    </label>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
