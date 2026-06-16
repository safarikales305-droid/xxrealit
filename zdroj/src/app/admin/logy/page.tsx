'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminActivityLogs, type ActivityLogRow } from '@/lib/communication-api';

const CATEGORIES = [
  '',
  'WHATSAPP',
  'EMAIL',
  'FACEBOOK_IMPORT',
  'BONUS',
  'CREDITS',
  'REGISTRATION',
  'INVITE',
  'MARKETING_CAMPAIGN',
];

export default function AdminLogyPage() {
  const router = useRouter();
  const { user, apiAccessToken, isLoading } = useAuth();
  const token = apiAccessToken;
  const [category, setCategory] = useState('');
  const [items, setItems] = useState<ActivityLogRow[]>([]);
  const [total, setTotal] = useState(0);

  const refresh = useCallback(async () => {
    if (!token) return;
    const data = await nestAdminActivityLogs(token, {
      category: category || undefined,
      limit: 100,
    });
    setItems(data.items);
    setTotal(data.total);
  }, [token, category]);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [user, isLoading, router, refresh]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin" className="text-sm text-orange-600 hover:underline">
            ← Administrace
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">Logy systému</h1>
        </div>
        <select
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c || 'all'} value={c}>
              {c || 'Všechny kategorie'}
            </option>
          ))}
        </select>
      </div>

      <p className="text-sm text-zinc-500">Celkem záznamů: {total}</p>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b text-zinc-500">
              <th className="p-3">Datum</th>
              <th className="p-3">Kategorie</th>
              <th className="p-3">Uživatel</th>
              <th className="p-3">Zpráva</th>
            </tr>
          </thead>
          <tbody>
            {items.map((l) => (
              <tr key={l.id} className="border-b border-zinc-100">
                <td className="p-3 whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString('cs-CZ')}
                </td>
                <td className="p-3">{l.category}</td>
                <td className="p-3">{l.user?.name ?? l.user?.email ?? '—'}</td>
                <td className="p-3">{l.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
