'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestFetchPropertyDetailJson, nestPatchMyProperty } from '@/lib/nest-client';

function pickStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}
function pickNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function pickBool(v: unknown): boolean {
  return v === true;
}

export default function UpravitInzeratPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const router = useRouter();
  const { apiAccessToken, isAuthenticated, isLoading } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id || !apiAccessToken) return;
    setLoadErr(null);
    const raw = await nestFetchPropertyDetailJson(id, apiAccessToken);
    if (!raw || typeof raw !== 'object') {
      setLoadErr('Inzerát se nepodařilo načíst nebo k němu nemáte přístup.');
      return;
    }
    const root = raw as Record<string, unknown>;
    const p = root.property;
    if (!p || typeof p !== 'object') {
      setLoadErr('Neplatná odpověď serveru.');
      return;
    }
    const o = p as Record<string, unknown>;
    setTitle(pickStr(o.title));
    setDescription(pickStr(o.description));
    setPrice(String(pickNum(o.price)));
    setCity(pickStr(o.city));
    setRegion(pickStr(o.region));
    setIsActive(pickBool(o.isActive) !== false);
  }, [id, apiAccessToken]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-600">Načítání…</div>
    );
  }

  if (!isAuthenticated || !apiAccessToken) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-zinc-800">Pro úpravu inzerátu se přihlaste.</p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-3 text-sm font-semibold text-white"
        >
          Přihlásit se
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-10 pb-20">
      <Link href="/profil" className="text-sm font-semibold text-[#e85d00] hover:underline">
        ← Profil
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900">Upravit inzerát</h1>
      {loadErr ? (
        <p className="mt-4 text-sm text-red-600">{loadErr}</p>
      ) : (
        <form
          className="mt-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setSaveErr(null);
            const p = Number(price);
            if (!Number.isFinite(p) || p < 0) {
              setSaveErr('Neplatná cena.');
              return;
            }
            setSaving(true);
            void nestPatchMyProperty(apiAccessToken, id, {
              title: title.trim(),
              description: description.trim(),
              price: p,
              city: city.trim(),
              region: region.trim(),
              isActive,
            }).then((r) => {
              setSaving(false);
              if (!r.ok) {
                setSaveErr(r.error ?? 'Uložení se nezdařilo.');
                return;
              }
              router.push('/profil');
              router.refresh();
            });
          }}
        >
          <label className="block text-sm font-semibold text-zinc-800">
            Název
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Popis
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              rows={6}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Cena (číslo)
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
              inputMode="numeric"
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Město
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm font-semibold text-zinc-800">
            Region
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-800">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="size-4 rounded border-zinc-300"
            />
            Inzerát je aktivní (veřejně po schválení a v časovém okně)
          </label>
          {saveErr ? <p className="text-sm text-red-600">{saveErr}</p> : null}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-[#ff6a00] to-[#ff3c00] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? 'Ukládám…' : 'Uložit změny'}
            </button>
            <Link
              href={`/nemovitost/${id}`}
              className="rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-semibold text-zinc-800"
            >
              Zrušit
            </Link>
          </div>
        </form>
      )}
    </div>
  );
}
