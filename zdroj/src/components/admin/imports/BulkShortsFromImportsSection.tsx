'use client';

import { useMemo, useState } from 'react';
import { nestAdminBulkShortsDraftsFromImported, type AdminImportSourceRow } from '@/lib/nest-client';

type Props = {
  token: string;
  branches: AdminImportSourceRow[];
};

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function BulkShortsFromImportsSection({ token, branches }: Props) {
  const [portalKey, setPortalKey] = useState('');
  const [categoryKey, setCategoryKey] = useState('');
  const [city, setCity] = useState('');
  const [onlyNewImports, setOnlyNewImports] = useState(false);
  const [limit, setLimit] = useState(40);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const portalOptions = useMemo(
    () => uniqueSorted(branches.map((b) => b.portalKey || '').filter((k) => k && k !== 'other')),
    [branches],
  );

  const categoryOptions = useMemo(() => {
    const q = portalKey.trim();
    const subset = q ? branches.filter((b) => (b.portalKey || '') === q) : branches;
    return uniqueSorted(subset.map((b) => b.categoryKey || '').filter(Boolean));
  }, [branches, portalKey]);

  async function submit() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    const r = await nestAdminBulkShortsDraftsFromImported(token, {
      sourcePortalKey: portalKey.trim() || undefined,
      importCategoryKey: categoryKey.trim() || undefined,
      city: city.trim() || undefined,
      onlyNewImports: onlyNewImports || undefined,
      limit,
    });
    setBusy(false);
    if (!r.ok) {
      setErr(r.error ?? 'Požadavek selhal');
      return;
    }
    const d = r.data;
    if (!d) return;
    setMsg(`Hotovo: vytvořeno ${d.succeeded} / ${d.attempted} (limit ${d.requestedLimit}).`);
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">Generovat shorts z importovaných inzerátů</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Hromadně vytvoří koncepty shorts s náhodnou hudbou z knihovny. Filtrujte podle portálu, kategorie importní
        větve, města nebo jen čerstvých importů (48 h).
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-zinc-600">Portál (sourcePortalKey)</span>
          <select
            value={portalKey}
            onChange={(e) => {
              setPortalKey(e.target.value);
              setCategoryKey('');
            }}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          >
            <option value="">Všechny portály</option>
            {portalOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-zinc-600">Kategorie větve (importCategoryKey)</span>
          <select
            value={categoryKey}
            onChange={(e) => setCategoryKey(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          >
            <option value="">Vše</option>
            {categoryOptions.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-zinc-600">Město (část názvu)</span>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="např. Praha"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs text-zinc-600">Max. počet</span>
          <input
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Number.parseInt(e.target.value, 10) || 1)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2"
          />
        </label>
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm text-zinc-800">
        <input
          type="checkbox"
          checked={onlyNewImports}
          onChange={(e) => setOnlyNewImports(e.target.checked)}
        />
        <span>Jen nové importy (importováno za posledních 48 h)</span>
      </label>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Generuji…' : 'Spustit hromadné generování'}
        </button>
      </div>
      {err ? <p className="mt-3 text-sm text-red-700">{err}</p> : null}
      {msg ? <p className="mt-3 text-sm text-emerald-800">{msg}</p> : null}
    </section>
  );
}
