'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestFacebookUrlImportStatus,
  nestFacebookUrlImportSync,
  nestFacebookUrlImportUpdateSettings,
  type FacebookUrlImportStatus,
} from '@/lib/nest-client';

const USER_ERROR_FALLBACK =
  'Facebook obsah se nepodařilo automaticky načíst. Zkontrolujte, že stránka je veřejná.';

const IMPORTING_MSG = 'Importuji poslední 3 příspěvky…';

type Props = {
  token: string | null;
};

function statusLabel(status: FacebookUrlImportStatus['facebookImportStatus']): string {
  switch (status) {
    case 'RUNNING':
      return 'Probíhá import…';
    case 'OK':
      return 'Poslední import proběhl v pořádku';
    case 'ERROR':
      return 'Poslední import selhal';
    default:
      return 'Import zatím nebyl spuštěn';
  }
}

function formatImportResult(imported: number): string {
  if (imported === 0) return 'Nebyl nalezen žádný veřejný příspěvek.';
  return `Import dokončen – importováno ${imported} příspěvků.`;
}

export function FacebookUrlImportCard({ token }: Props) {
  const [urlInput, setUrlInput] = useState('');
  const [status, setStatus] = useState<FacebookUrlImportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const s = await nestFacebookUrlImportStatus(token);
    setStatus(s);
    if (s?.facebookUrl) setUrlInput(s.facebookUrl);
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function runImportAfterSettings() {
    setImporting(true);
    setOk(IMPORTING_MSG);
    const syncRes = await nestFacebookUrlImportSync(token!);
    setImporting(false);
    setBusy(false);
    if (!syncRes.ok) {
      setOk(null);
      setError(syncRes.error ?? USER_ERROR_FALLBACK);
      void refresh();
      return;
    }
    if (syncRes.error) {
      setOk(null);
      setError(syncRes.error);
    } else {
      setError(null);
      setOk(formatImportResult(syncRes.imported ?? 0));
    }
    void refresh();
  }

  async function handleAddPage() {
    if (!token) return;
    const trimmed = urlInput.trim();
    if (!trimmed) {
      setError('Zadejte URL veřejné Facebook stránky nebo profilu.');
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await nestFacebookUrlImportUpdateSettings(token, {
      facebookUrl: trimmed,
      facebookImportEnabled: true,
    });
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? 'Uložení URL selhalo.');
      return;
    }
    setStatus(res.status ?? null);
    await runImportAfterSettings();
  }

  async function handleSyncNow() {
    if (!token) return;
    setBusy(true);
    setError(null);
    setOk(IMPORTING_MSG);
    setImporting(true);
    const res = await nestFacebookUrlImportSync(token);
    setImporting(false);
    setBusy(false);
    if (!res.ok) {
      setOk(null);
      setError(res.error ?? USER_ERROR_FALLBACK);
      void refresh();
      return;
    }
    if (res.error) {
      setOk(null);
      setError(res.error);
    } else {
      setError(null);
      setOk(formatImportResult(res.imported ?? 0));
    }
    void refresh();
  }

  async function handleDisable() {
    if (!token) return;
    setBusy(true);
    setError(null);
    setOk(null);
    const res = await nestFacebookUrlImportUpdateSettings(token, {
      facebookImportEnabled: false,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Vypnutí importu selhalo.');
      return;
    }
    setStatus(res.status ?? null);
    setOk('Automatický import z Facebooku byl vypnut.');
    void refresh();
  }

  if (!token) return null;

  const importEnabled = Boolean(status?.facebookImportEnabled);
  const hasUrl = Boolean(status?.facebookUrl?.trim());
  const isWorking = busy || importing;

  return (
    <div className="space-y-4 rounded-xl border border-[#1877F2]/25 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Import z Facebook URL</p>
        <p className="mt-1 text-sm text-zinc-600">
          Vložte odkaz na veřejnou Facebook stránku nebo profil. Po přidání se automaticky
          importují poslední 3 veřejné příspěvky do feedu xxrealit — bez Meta Pages API.
        </p>
      </div>

      {loading ? <p className="text-sm text-zinc-500">Načítám…</p> : null}

      {!loading ? (
        <>
          <label className="block text-sm font-semibold text-zinc-800">
            URL Facebook stránky
            <input
              type="url"
              inputMode="url"
              placeholder="https://www.facebook.com/vase-stranka"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-zinc-500">
            Povolené domény: facebook.com, www.facebook.com, m.facebook.com
          </p>

          {hasUrl ? (
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-xs text-zinc-700">
              <p>
                <span className="font-semibold">Stav:</span>{' '}
                {importing ? 'Probíhá import…' : statusLabel(status?.facebookImportStatus ?? 'IDLE')}
              </p>
              {status?.facebookLastSyncAt ? (
                <p className="mt-1">
                  Poslední synchronizace:{' '}
                  {new Date(status.facebookLastSyncAt).toLocaleString('cs-CZ')}
                </p>
              ) : null}
              {status?.facebookImportError ? (
                <p className="mt-1 text-red-700">{status.facebookImportError}</p>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {ok ? (
            <p
              className={`text-sm ${importing ? 'text-[#1877F2]' : 'text-emerald-700'}`}
            >
              {ok}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isWorking}
              onClick={() => void handleAddPage()}
              className="rounded-full bg-[#1877F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#166fe0] disabled:opacity-60"
            >
              Přidat Facebook stránku
            </button>
            <button
              type="button"
              disabled={isWorking || !hasUrl}
              onClick={() => void handleSyncNow()}
              className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
            >
              Spustit import příspěvků
            </button>
            {importEnabled ? (
              <button
                type="button"
                disabled={isWorking}
                onClick={() => void handleDisable()}
                className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                Vypnout import
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
