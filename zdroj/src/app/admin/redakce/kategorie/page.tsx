'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { EditorialCenterShell } from '@/components/admin/redakce/EditorialCenterShell';
import {
  nestEditorialCategories,
  nestEditorialCreateCategory,
  nestEditorialUpdateCategory,
  type ContentSourceCategory,
} from '@/lib/editorial-center-client';

export default function RedakceKategoriePage() {
  const router = useRouter();
  const { user, isLoading, apiAccessToken } = useAuth();
  const [categories, setCategories] = useState<ContentSourceCategory[]>([]);
  const [newLabel, setNewLabel] = useState('');

  const load = () => {
    if (!apiAccessToken) return;
    void nestEditorialCategories(apiAccessToken).then((c) => c && setCategories(c));
  };

  useEffect(() => {
    if (!isLoading && user?.role !== 'ADMIN') router.replace('/');
  }, [isLoading, user, router]);

  useEffect(load, [apiAccessToken]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-orange-600" />
      </div>
    );
  }

  return (
    <EditorialCenterShell title="Kategorie zdrojů" subtitle="Správa kategorií pro YouTube kanály a RSS.">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!apiAccessToken || !newLabel.trim()) return;
          const slug = newLabel
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
          void nestEditorialCreateCategory(apiAccessToken, { slug, label: newLabel.trim() }).then(() => {
            setNewLabel('');
            load();
          });
        }}
      >
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nová kategorie…"
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white">
          Přidat
        </button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div key={c.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <input
              defaultValue={c.label}
              className="w-full border-b border-transparent bg-transparent font-semibold text-zinc-900 focus:border-orange-300 focus:outline-none"
              onBlur={(e) => {
                if (!apiAccessToken || e.target.value === c.label) return;
                void nestEditorialUpdateCategory(apiAccessToken, c.id, { label: e.target.value }).then(load);
              }}
            />
            <p className="mt-1 text-xs text-zinc-500">{c.slug}</p>
            <p className="mt-2 text-xs text-zinc-600">{c._count?.sources ?? 0} zdrojů</p>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.active}
                onChange={(e) => {
                  if (!apiAccessToken) return;
                  void nestEditorialUpdateCategory(apiAccessToken, c.id, { active: e.target.checked }).then(load);
                }}
              />
              Aktivní
            </label>
          </div>
        ))}
      </div>
    </EditorialCenterShell>
  );
}
