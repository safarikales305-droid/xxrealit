'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminBrokerContacts,
  nestAdminBrokerContactDetail,
  nestAdminBrokerContactsBulkUpdate,
  nestAdminDownloadBrokerContactsCsv,
  nestAdminPatchBrokerContact,
  nestApiConfigured,
  type AdminImportedBrokerContactRow,
} from '@/lib/nest-client';

type DetailRow = AdminImportedBrokerContactRow & {
  listings?: Array<{
    id: string;
    propertyId: string;
    sourceUrl: string | null;
    property: {
      id: string;
      title: string;
      city: string;
      price: number | null;
      importSourceUrl: string | null;
      importExternalId: string | null;
      importSource: string | null;
    };
  }>;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('cs-CZ');
  } catch {
    return iso;
  }
}

export default function AdminImportedBrokersPage() {
  const { user, apiAccessToken } = useAuth();
  const token = apiAccessToken;

  const [items, setItems] = useState<AdminImportedBrokerContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const take = 30;
  const [search, setSearch] = useState('');
  const [portal, setPortal] = useState('');
  const [hasEmail, setHasEmail] = useState<boolean | undefined>(undefined);
  const [hasPhone, setHasPhone] = useState<boolean | undefined>(undefined);
  const [profileCreated, setProfileCreated] = useState<boolean | undefined>(undefined);
  const [outreachStatus, setOutreachStatus] = useState('');
  const [sort, setSort] = useState('lastSeen_desc');
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<DetailRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');

  const apiOk = useMemo(() => nestApiConfigured(), []);

  const load = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setLoadErr(null);
    const data = await nestAdminBrokerContacts(token, {
      search: search.trim() || undefined,
      portal: portal.trim() || undefined,
      hasEmail,
      hasPhone,
      profileCreated,
      outreachStatus: outreachStatus.trim() || undefined,
      sort,
      skip,
      take,
    });
    setBusy(false);
    if (!data) {
      setLoadErr('Nepodařilo se načíst kontakty (zkontrolujte JWT a migrace DB).');
      setItems([]);
      setTotal(0);
      return;
    }
    setItems(data.items);
    setTotal(data.total);
  }, [
    token,
    search,
    portal,
    hasEmail,
    hasPhone,
    profileCreated,
    outreachStatus,
    sort,
    skip,
    take,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openDetail(id: string) {
    if (!token) return;
    const row = await nestAdminBrokerContactDetail(token, id);
    if (row && typeof row === 'object') {
      setDetail(row as DetailRow);
      setNotesDraft(
        typeof (row as { notes?: string }).notes === 'string'
          ? String((row as { notes?: string }).notes)
          : '',
      );
      setDetailOpen(true);
    }
  }

  async function saveNotes(id: string) {
    if (!token) return;
    const r = await nestAdminPatchBrokerContact(token, id, { notes: notesDraft });
    if (r.ok) void load();
  }

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  if (!token || !user || user.role !== 'ADMIN') {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center text-sm text-zinc-600">
        Tato sekce je jen pro administrátory.{' '}
        <Link className="font-semibold text-orange-600" href="/prihlaseni">
          Přihlaste se
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-lg font-bold text-[#e85d00]">
              ← Admin
            </Link>
            <span className="text-sm font-semibold text-zinc-800">Databáze makléřů (import)</span>
          </div>
          <Link href="/admin/importy" className="text-sm font-semibold text-zinc-600 hover:text-zinc-900">
            Importy
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        {!apiOk ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Není nastavené <code className="font-mono">NEXT_PUBLIC_API_URL</code>.
          </p>
        ) : null}

        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-semibold text-zinc-600">
            Fulltext
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Jméno, e-mail, telefon…"
            />
          </label>
          <label className="flex min-w-[120px] flex-col gap-1 text-xs font-semibold text-zinc-600">
            Portál
            <input
              value={portal}
              onChange={(e) => setPortal(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              placeholder="reality_cz…"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
            Řazení
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="lastSeen_desc">Naposledy nalezen ↓</option>
              <option value="lastSeen_asc">Naposledy nalezen ↑</option>
              <option value="listings_desc">Počet inzerátů ↓</option>
              <option value="listings_asc">Počet inzerátů ↑</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
            Stav oslovení
            <select
              value={outreachStatus}
              onChange={(e) => setOutreachStatus(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="">(vše)</option>
              <option value="none">none</option>
              <option value="contacted">contacted</option>
              <option value="emailed">emailed</option>
              <option value="prepared_mail">prepared_mail</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-white p-3 text-sm shadow-sm">
          <FilterChip
            label="Má e-mail"
            active={hasEmail === true}
            onClick={() => setHasEmail(hasEmail === true ? undefined : true)}
          />
          <FilterChip
            label="Bez e-mailu"
            active={hasEmail === false}
            onClick={() => setHasEmail(hasEmail === false ? undefined : false)}
          />
          <FilterChip
            label="Má telefon"
            active={hasPhone === true}
            onClick={() => setHasPhone(hasPhone === true ? undefined : true)}
          />
          <FilterChip
            label="Profil založen"
            active={profileCreated === true}
            onClick={() => setProfileCreated(profileCreated === true ? undefined : true)}
          />
          <FilterChip
            label="Profil nezaložen"
            active={profileCreated === false}
            onClick={() => setProfileCreated(profileCreated === false ? undefined : false)}
          />
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="ml-auto rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Načítám…' : 'Obnovit'}
          </button>
        </div>

        {loadErr ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadErr}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-zinc-600">
            Vybráno: <strong>{selectedIds.length}</strong>
          </span>
          <button
            type="button"
            className="rounded-full border border-zinc-300 px-3 py-1.5 font-semibold hover:bg-zinc-50"
            onClick={() => {
              const next: Record<string, boolean> = {};
              for (const x of items) next[x.id] = true;
              setSelected(next);
            }}
          >
            Vybrat stránku
          </button>
          <button
            type="button"
            className="rounded-full border border-zinc-300 px-3 py-1.5 font-semibold hover:bg-zinc-50"
            onClick={() => setSelected({})}
          >
            Zrušit výběr
          </button>
          <button
            type="button"
            className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 font-semibold text-orange-900 hover:bg-orange-100"
            onClick={async () => {
              if (!token || selectedIds.length === 0) return;
              const r = await nestAdminBrokerContactsBulkUpdate(token, {
                ids: selectedIds,
                outreachStatus: 'contacted',
              });
              if (r.ok) {
                setSelected({});
                void load();
              }
            }}
          >
            Hromadně: kontaktováno
          </button>
          <button
            type="button"
            className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 font-semibold text-orange-900 hover:bg-orange-100"
            onClick={async () => {
              if (!token || selectedIds.length === 0) return;
              const r = await nestAdminBrokerContactsBulkUpdate(token, {
                ids: selectedIds,
                outreachStatus: 'emailed',
              });
              if (r.ok) {
                setSelected({});
                void load();
              }
            }}
          >
            Hromadně: obesláno
          </button>
          <button
            type="button"
            className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-900 hover:bg-emerald-100"
            onClick={async () => {
              if (!token || selectedIds.length === 0) return;
              const r = await nestAdminBrokerContactsBulkUpdate(token, {
                ids: selectedIds,
                outreachStatus: 'prepared_mail',
              });
              if (r.ok) {
                setSelected({});
                void load();
              }
            }}
          >
            Připravit hrom. e-mail
          </button>
          <button
            type="button"
            className="rounded-full border border-zinc-300 px-3 py-1.5 font-semibold hover:bg-zinc-50"
            onClick={async () => {
              if (!token) return;
              const r = await nestAdminDownloadBrokerContactsCsv(token, {
                search: search.trim() || undefined,
                portal: portal.trim() || undefined,
                hasEmail,
                hasPhone,
              });
              if (r.ok && r.blob) {
                const url = URL.createObjectURL(r.blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'imported-broker-contacts.csv';
                a.click();
                URL.revokeObjectURL(url);
              }
            }}
          >
            Export CSV (filtry)
          </button>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-bold uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2"> </th>
                <th className="px-3 py-2">Jméno</th>
                <th className="px-3 py-2">Kancelář</th>
                <th className="px-3 py-2">E-mail</th>
                <th className="px-3 py-2">Telefon</th>
                <th className="px-3 py-2">Portál</th>
                <th className="px-3 py-2">Inzeráty</th>
                <th className="px-3 py-2">Stav</th>
                <th className="px-3 py-2">Profil</th>
                <th className="px-3 py-2">Oslovení</th>
                <th className="px-3 py-2">Naposledy</th>
                <th className="px-3 py-2"> </th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.id} className="border-b border-zinc-100 hover:bg-orange-50/30">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[row.id])}
                      onChange={(e) =>
                        setSelected((prev) => ({ ...prev, [row.id]: e.target.checked }))
                      }
                    />
                  </td>
                  <td className="max-w-[180px] truncate px-3 py-2 font-medium">{row.fullName || '—'}</td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-zinc-600">{row.companyName || '—'}</td>
                  <td className="max-w-[160px] truncate px-3 py-2">{row.email || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2">{row.phone || '—'}</td>
                  <td className="px-3 py-2 text-xs text-zinc-600">{row.sourcePortal || '—'}</td>
                  <td className="px-3 py-2 tabular-nums">{row.listingCount}</td>
                  <td className="px-3 py-2 text-xs">{row.status}</td>
                  <td className="px-3 py-2">{row.profileCreated ? 'Ano' : 'Ne'}</td>
                  <td className="px-3 py-2 text-xs">{row.outreachStatus}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-500">
                    {fmtDate(row.lastSeenAt)}
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void openDetail(row.id)}
                      className="text-xs font-bold text-orange-700 hover:underline"
                    >
                      Detail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between text-sm text-zinc-600">
          <span>
            Zobrazeno {items.length} / {total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={skip <= 0 || busy}
              onClick={() => setSkip(Math.max(0, skip - take))}
              className="rounded-full border border-zinc-300 px-4 py-1.5 font-semibold disabled:opacity-40"
            >
              Předchozí
            </button>
            <button
              type="button"
              disabled={skip + take >= total || busy}
              onClick={() => setSkip(skip + take)}
              className="rounded-full border border-zinc-300 px-4 py-1.5 font-semibold disabled:opacity-40"
            >
              Další
            </button>
          </div>
        </div>
      </main>

      {detailOpen && detail ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">{detail.fullName}</h2>
                <p className="text-sm text-zinc-500">{detail.companyName || '—'}</p>
              </div>
              <button
                type="button"
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold"
                onClick={() => setDetailOpen(false)}
              >
                Zavřít
              </button>
            </div>
            <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <Dt label="E-mail" value={detail.email} />
              <Dt label="Telefon" value={detail.phone} />
              <Dt label="Portál" value={detail.sourcePortal} />
              <Dt label="Město" value={detail.city} />
              <Dt label="Stav" value={detail.status} />
              <Dt label="Oslovení" value={detail.outreachStatus} />
              <Dt label="Inzerátů" value={String(detail.listingCount)} />
              <Dt label="Profil založen" value={detail.profileCreated ? 'Ano' : 'Ne'} />
              <Dt label="Source URL" value={detail.sourceUrl} wide />
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white"
                onClick={async () => {
                  if (!token) return;
                  await nestAdminPatchBrokerContact(token, detail.id, { outreachStatus: 'contacted' });
                  void load();
                  setDetailOpen(false);
                }}
              >
                Označit kontaktovaný
              </button>
              <button
                type="button"
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold"
                onClick={async () => {
                  if (!token) return;
                  await nestAdminPatchBrokerContact(token, detail.id, {
                    profileCreated: true,
                  });
                  void load();
                  setDetailOpen(false);
                }}
              >
                Profil založen
              </button>
            </div>
            <label className="mt-4 block text-xs font-bold text-zinc-600">
              Interní poznámka
              <textarea
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveNotes(detail.id)}
              className="mt-2 rounded-full bg-zinc-900 px-4 py-2 text-xs font-bold text-white"
            >
              Uložit poznámku
            </button>
            {Array.isArray(detail.listings) && detail.listings.length > 0 ? (
              <div className="mt-6">
                <h3 className="text-sm font-bold text-zinc-900">Importované inzeráty</h3>
                <ul className="mt-2 space-y-2 text-sm">
                  {detail.listings.map((l) => (
                    <li key={l.id} className="rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                      <Link
                        href={`/nemovitost/${l.propertyId}`}
                        className="font-semibold text-orange-700 hover:underline"
                      >
                        {l.property.title}
                      </Link>
                      <p className="text-xs text-zinc-500">
                        {l.property.city}
                        {l.property.importSourceUrl ? (
                          <>
                            {' · '}
                            <a
                              href={l.property.importSourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="break-all text-orange-600 hover:underline"
                            >
                              zdroj
                            </a>
                          </>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-bold ${
        active ? 'bg-orange-600 text-white' : 'border border-zinc-200 bg-white text-zinc-700'
      }`}
    >
      {label}
    </button>
  );
}

function Dt({ label, value, wide }: { label: string; value: string | null | undefined; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <dt className="text-xs font-bold uppercase text-zinc-500">{label}</dt>
      <dd className="break-all text-zinc-900">{value && String(value).trim() ? value : '—'}</dd>
    </div>
  );
}
