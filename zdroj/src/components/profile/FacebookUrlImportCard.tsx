'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  nestFacebookUrlImportManualPost,
  nestFacebookUrlImportStatus,
  nestFacebookUrlImportSync,
  nestFacebookUrlImportUpdateSettings,
  type FacebookUrlImportStatus,
} from '@/lib/nest-client';

const IMPORTING_MSG = 'Importuji poslední 3 příspěvky…';

const BLOCKED_MSG =
  'Facebook blokuje automatické načtení. Zkuste vložit odkaz na konkrétní veřejný příspěvek, nebo příspěvek vytvořte přímo na xxrealit.';

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

function formatSyncResult(
  imported: number,
  error: string | null | undefined,
): { ok: string | null; err: string | null } {
  if (error?.trim()) {
    return { ok: null, err: error.trim() };
  }
  if (imported === 0) {
    return { ok: null, err: 'Nebyl nalezen žádný veřejný příspěvek.' };
  }
  return { ok: `Import dokončen – importováno ${imported} příspěvků.`, err: null };
}

export function FacebookUrlImportCard({ token }: Props) {
  const [urlInput, setUrlInput] = useState('');
  const [status, setStatus] = useState<FacebookUrlImportStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualPostUrl, setManualPostUrl] = useState('');
  const [manualText, setManualText] = useState('');
  const [manualImageUrl, setManualImageUrl] = useState('');
  const [manualBusy, setManualBusy] = useState(false);

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
      setError(syncRes.error ?? BLOCKED_MSG);
      void refresh();
      return;
    }
    const formatted = formatSyncResult(syncRes.imported ?? 0, syncRes.error);
    setOk(formatted.ok);
    setError(formatted.err);
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
      setError(res.error ?? BLOCKED_MSG);
      void refresh();
      return;
    }
    const formatted = formatSyncResult(res.imported ?? 0, res.error);
    setOk(formatted.ok);
    setError(formatted.err);
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

  async function handleManualPost() {
    if (!token) return;
    const postUrl = manualPostUrl.trim();
    if (!postUrl) {
      setError('Zadejte URL konkrétního Facebook příspěvku nebo Reels.');
      return;
    }
    setManualBusy(true);
    setError(null);
    setOk(null);
    const res = await nestFacebookUrlImportManualPost(token, {
      postUrl,
      text: manualText.trim() || undefined,
      imageUrl: manualImageUrl.trim() || undefined,
    });
    setManualBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Ruční import selhal.');
      return;
    }
    setOk('Facebook příspěvek byl přidán do feedu.');
    setManualPostUrl('');
    setManualText('');
    setManualImageUrl('');
    void refresh();
  }

  if (!token) return null;

  const importEnabled = Boolean(status?.facebookImportEnabled);
  const hasUrl = Boolean(status?.facebookUrl?.trim());
  const isWorking = busy || importing || manualBusy;

  return (
    <div className="space-y-4 rounded-xl border border-[#1877F2]/25 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-zinc-900">Import z Facebook URL</p>
        <p className="mt-1 text-sm text-zinc-600">
          Vložte odkaz na veřejnou Facebook stránku. Po přidání se automaticky importují poslední 3
          veřejné příspěvky. Pokud Facebook blokuje automatické načtení, použijte ruční přidání
          konkrétního příspěvku níže.
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
              placeholder="https://www.facebook.com/kovokan.cz"
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
            <p className={`text-sm ${importing ? 'text-[#1877F2]' : 'text-emerald-700'}`}>{ok}</p>
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

          <div className="border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={() => setManualOpen((v) => !v)}
              className="text-sm font-semibold text-[#1877F2] hover:underline"
            >
              {manualOpen ? 'Skrýt ruční přidání' : 'Přidat Facebook příspěvek ručně'}
            </button>
            {manualOpen ? (
              <div className="mt-3 space-y-3 rounded-lg border border-zinc-100 bg-zinc-50/80 p-3">
                <p className="text-xs text-zinc-600">
                  Vložte odkaz na konkrétní veřejný příspěvek, Reels nebo foto z Facebooku.
                </p>
                <label className="block text-sm font-semibold text-zinc-800">
                  URL příspěvku
                  <input
                    type="url"
                    value={manualPostUrl}
                    onChange={(e) => setManualPostUrl(e.target.value)}
                    placeholder="https://www.facebook.com/.../posts/..."
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-semibold text-zinc-800">
                  Text příspěvku (volitelné)
                  <textarea
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    rows={3}
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-sm font-semibold text-zinc-800">
                  URL obrázku (volitelné)
                  <input
                    type="url"
                    value={manualImageUrl}
                    onChange={(e) => setManualImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={isWorking}
                  onClick={() => void handleManualPost()}
                  className="rounded-full border border-[#1877F2] bg-white px-4 py-2 text-sm font-semibold text-[#1877F2] hover:bg-[#1877F2]/5 disabled:opacity-60"
                >
                  Přidat Facebook příspěvek ručně
                </button>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
