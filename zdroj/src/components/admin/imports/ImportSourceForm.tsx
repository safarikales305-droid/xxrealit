'use client';

import { useMemo, useState } from 'react';
import type { AdminImportSourceRow } from '@/lib/nest-client';

const CATEGORY_PRESETS = [
  { key: 'byty', label: 'Byty' },
  { key: 'domy', label: 'Domy' },
  { key: 'pozemky', label: 'Pozemky' },
  { key: 'komercni', label: 'Komerční' },
  { key: 'garaze', label: 'Garáže' },
  { key: 'chaty-chalupy', label: 'Chaty a chalupy' },
  { key: 'ostatni', label: 'Ostatní' },
];

type Props = {
  open: boolean;
  branch?: AdminImportSourceRow | null;
  defaultPortalKey?: string;
  onClose: () => void;
  onSubmit: (payload: Record<string, unknown>) => void;
};

function inferCategoryFromUrl(url: string): { key: string; label: string } {
  const t = (url ?? '').toLowerCase();
  if (t.includes('/byty/')) return { key: 'byty', label: 'Byty' };
  if (t.includes('/domy/')) return { key: 'domy', label: 'Domy' };
  if (t.includes('/pozemky/')) return { key: 'pozemky', label: 'Pozemky' };
  if (t.includes('/komercni/')) return { key: 'komercni', label: 'Komerční' };
  if (t.includes('/garaze/')) return { key: 'garaze', label: 'Garáže' };
  if (t.includes('/chaty/') || t.includes('/chalupy/')) return { key: 'chaty-chalupy', label: 'Chaty a chalupy' };
  return { key: 'ostatni', label: 'Ostatní' };
}

export function ImportSourceForm({ open, branch, defaultPortalKey, onClose, onSubmit }: Props) {
  const sourceTypeFromBranch = branch?.method === 'apify' || branch?.portal === 'apify' ? 'APIFY' : 'SCRAPER';
  const [sourceType, setSourceType] = useState<'SCRAPER' | 'APIFY'>(sourceTypeFromBranch);
  const [portalKey, setPortalKey] = useState(branch?.portalKey || defaultPortalKey || 'reality_cz');
  const [portalLabel, setPortalLabel] = useState(
    branch?.portalLabel || (defaultPortalKey === 'century21_cz' ? 'CENTURY 21' : 'Reality.cz'),
  );
  const [method, setMethod] = useState(branch?.method || (sourceType === 'APIFY' ? 'apify' : 'scraper'));
  const [categoryKey, setCategoryKey] = useState(branch?.categoryKey || 'byty');
  const [categoryLabel, setCategoryLabel] = useState(branch?.categoryLabel || 'Byty');
  const [endpointUrl, setEndpointUrl] = useState(branch?.endpointUrl || '');
  const [actorId, setActorId] = useState(branch?.actorId || '');
  const [actorTaskId, setActorTaskId] = useState(branch?.actorTaskId || '');
  const [datasetId, setDatasetId] = useState(branch?.datasetId || '');
  const [startUrl, setStartUrl] = useState(branch?.startUrl || '');
  const [sourcePortal, setSourcePortal] = useState(branch?.sourcePortal || '');
  const [notes, setNotes] = useState(branch?.notes || '');
  const [apifyApiKey, setApifyApiKey] = useState('');
  const [isActive, setIsActive] = useState(branch?.isActive ?? true);
  const [intervalMinutes, setIntervalMinutes] = useState(branch?.intervalMinutes || 120);
  const [limitPerRun, setLimitPerRun] = useState(branch?.limitPerRun || 100);
  const [enabled, setEnabled] = useState(branch?.enabled ?? false);
  const title = branch ? 'Upravit importní větev' : 'Přidat importní větev';

  const detected = useMemo(() => inferCategoryFromUrl(endpointUrl), [endpointUrl]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-4 shadow-xl">
        <h3 className="mb-3 text-base font-semibold">{title}</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-600">Portál key</span>
            <select value={portalKey} onChange={(e) => setPortalKey(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2">
              <option value="reality_cz">reality_cz</option>
              <option value="century21_cz">century21_cz</option>
              <option value="apify">apify</option>
              <option value="xml_feed">xml_feed</option>
              <option value="csv_feed">csv_feed</option>
              <option value="other">other</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-600">Portál label</span>
            <input value={portalLabel} onChange={(e) => setPortalLabel(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-600">Typ zdroje</span>
            <select
              value={sourceType}
              onChange={(e) => {
                const next = e.target.value === 'APIFY' ? 'APIFY' : 'SCRAPER';
                setSourceType(next);
                if (next === 'APIFY') {
                  setMethod('apify');
                  setPortalKey('apify');
                  if (!portalLabel || portalLabel.toLowerCase() === 'reality.cz') setPortalLabel('APIFY');
                } else {
                  if (method === 'apify') setMethod('scraper');
                  if (portalKey === 'apify') setPortalKey('reality_cz');
                }
              }}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            >
              <option value="SCRAPER">SCRAPER</option>
              <option value="APIFY">APIFY</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-600">Metoda (interní)</span>
            <input value={method} onChange={(e) => setMethod(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-600">Kategorie (preset)</span>
            <select
              value={categoryKey}
              onChange={(e) => {
                setCategoryKey(e.target.value);
                const preset = CATEGORY_PRESETS.find((x) => x.key === e.target.value);
                if (preset) setCategoryLabel(preset.label);
              }}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            >
              {CATEGORY_PRESETS.map((x) => (
                <option key={x.key} value={x.key}>{x.label}</option>
              ))}
            </select>
          </label>
          {sourceType !== 'APIFY' ? (
          <label className="text-sm md:col-span-2">
            <span className="mb-1 block text-xs text-zinc-600">Start URL</span>
            <input
              value={endpointUrl}
              onChange={(e) => setEndpointUrl(e.target.value)}
              onBlur={() => {
                if (!branch) {
                  setCategoryKey(detected.key);
                  setCategoryLabel(detected.label);
                }
              }}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2"
            />
            {portalKey === 'century21_cz' ? (
              <p className="mt-1 text-xs text-zinc-500">
                Pro CENTURY21 použijte URL výpisu (`/nemovitosti?...`). Detail inzerátu se načítá přes Playwright render.
              </p>
            ) : null}
          </label>
          ) : null}
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-600">Kategorie key</span>
            <input value={categoryKey} onChange={(e) => setCategoryKey(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-600">Kategorie label</span>
            <input value={categoryLabel} onChange={(e) => setCategoryLabel(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-600">Interval (min)</span>
            <input type="number" min={1} value={intervalMinutes} onChange={(e) => setIntervalMinutes(Number.parseInt(e.target.value, 10) || 1)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-zinc-600">Limit</span>
            <input type="number" min={1} value={limitPerRun} onChange={(e) => setLimitPerRun(Number.parseInt(e.target.value, 10) || 1)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
          </label>
          {sourceType === 'APIFY' ? (
            <>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Actor ID</span>
                <input value={actorId} onChange={(e) => setActorId(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Task ID (volitelné)</span>
                <input value={actorTaskId} onChange={(e) => setActorTaskId(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Dataset ID (volitelné)</span>
                <input value={datasetId} onChange={(e) => setDatasetId(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">APIFY_URL</span>
                <input
                  value={startUrl}
                  onChange={(e) => setStartUrl(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                  placeholder="https://api.apify.com/v2/datasets/.../items?format=json"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs text-zinc-600">Source portal</span>
                <input value={sourcePortal} onChange={(e) => setSourcePortal(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-xs text-zinc-600">Poznámky</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-zinc-200 px-3 py-2" />
              </label>
              <label className="text-sm md:col-span-2">
                <span className="mb-1 block text-xs text-zinc-600">APIFY API klíč</span>
                <input
                  type="password"
                  value={apifyApiKey}
                  onChange={(e) => setApifyApiKey(e.target.value)}
                  className="w-full rounded-lg border border-zinc-200 px-3 py-2"
                  placeholder="apify_api_..."
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  Nevyplněné pole ponechá existující klíč beze změny. Klíč se ukládá jen backendu.
                </p>
                {branch?.credentialsJson && typeof branch.credentialsJson === 'object' && (branch.credentialsJson as Record<string, unknown>).apifyToken ? (
                  <p className="mt-1 text-[11px] font-medium text-emerald-700">V této větvi je již APIFY klíč uložen.</p>
                ) : null}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                <span>isActive</span>
              </label>
            </>
          ) : null}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            <span>Enabled</span>
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold">Zavřít</button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                id: branch?.id,
                portalKey,
                portalLabel,
                method: sourceType === 'APIFY' ? 'apify' : method,
                categoryKey,
                categoryLabel,
                endpointUrl: sourceType === 'APIFY' ? null : endpointUrl || null,
                actorId: actorId || null,
                actorTaskId: actorTaskId || null,
                datasetId: datasetId || null,
                startUrl: startUrl || null,
                sourcePortal: sourcePortal || null,
                notes: notes || null,
                credentialsJson:
                  sourceType === 'APIFY' && apifyApiKey.trim()
                    ? { apifyToken: apifyApiKey.trim() }
                    : undefined,
                isActive,
                intervalMinutes,
                limitPerRun,
                enabled,
              })
            }
            className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white"
          >
            Uložit
          </button>
        </div>
      </div>
    </div>
  );
}
