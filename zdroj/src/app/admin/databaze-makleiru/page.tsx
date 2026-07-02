'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminBrokerContacts,
  nestAdminBrokerContactDetail,
  nestAdminBrokerContactsBulkUpdate,
  nestAdminBrokerDatabaseImportPreview,
  nestAdminBrokerDatabaseImportRun,
  nestAdminBrokerDatabaseWhatsAppCampaign,
  nestAdminBrokerDatabaseWhatsAppCount,
  nestAdminDownloadBrokerContactsCsv,
  nestAdminPatchBrokerContact,
  nestApiConfigured,
  type AdminImportedBrokerContactRow,
  type BrokerDatabaseWhatsAppAudience,
  type BrokerDirectoryImportPreview,
  type BrokerDirectoryImportResult,
  type EmailCampaignAudience,
} from '@/lib/nest-client';
import { nestAdminWhatsAppTemplatesList } from '@/lib/whatsapp-admin-api';
import { EmailCampaignEditorModal } from '@/components/admin/EmailCampaignEditorModal';
import { EmailCampaignHistoryPanel } from '@/components/admin/EmailCampaignHistoryPanel';

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
  const [contactStatus, setContactStatus] = useState('');
  const [sort, setSort] = useState('lastSeen_desc');
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<DetailRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [campaignOpen, setCampaignOpen] = useState(false);
  const [campaignHistoryRefresh, setCampaignHistoryRefresh] = useState(0);
  const [campaignAudience, setCampaignAudience] = useState<EmailCampaignAudience>({
    mode: 'all_imported',
  });

  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('https://www.realitnieso.cz/adresar-rk');
  const [importSource, setImportSource] = useState('realitnieso.cz');
  const [importPreview, setImportPreview] = useState<BrokerDirectoryImportPreview | null>(null);
  const [importResult, setImportResult] = useState<BrokerDirectoryImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);

  const [waOpen, setWaOpen] = useState(false);
  const [waAudience, setWaAudience] = useState<BrokerDatabaseWhatsAppAudience>({ mode: 'all_imported' });
  const [waCount, setWaCount] = useState<number | null>(null);
  const [waTemplateId, setWaTemplateId] = useState('');
  const [waTemplates, setWaTemplates] = useState<Array<{ id: string; templateName: string; language: string }>>([]);
  const [waConfirm, setWaConfirm] = useState(false);
  const [waBusy, setWaBusy] = useState(false);
  const [waErr, setWaErr] = useState<string | null>(null);

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
      contactStatus: contactStatus.trim() || undefined,
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
    contactStatus,
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

  const currentFilter = useMemo(
    () => ({
      search: search.trim() || undefined,
      portal: portal.trim() || undefined,
      hasEmail,
      hasPhone,
      profileCreated,
      outreachStatus: outreachStatus.trim() || undefined,
      contactStatus: contactStatus.trim() || undefined,
      sort,
    }),
    [search, portal, hasEmail, hasPhone, profileCreated, outreachStatus, contactStatus, sort],
  );

  function openCampaignEditor(mode: EmailCampaignAudience['mode']) {
    if (mode === 'selected_ids') {
      if (selectedIds.length === 0) return;
      setCampaignAudience({ mode, selectedContactIds: selectedIds });
    } else if (mode === 'filtered') {
      setCampaignAudience({ mode, filter: currentFilter });
    } else {
      setCampaignAudience({ mode: 'all_imported' });
    }
    setCampaignOpen(true);
  }

  function buildWhatsAppAudience(mode: BrokerDatabaseWhatsAppAudience['mode']): BrokerDatabaseWhatsAppAudience {
    if (mode === 'selected_ids') {
      return { mode, selectedContactIds: selectedIds };
    }
    if (mode === 'filtered') {
      return { mode, filter: currentFilter };
    }
    return { mode: 'all_imported' };
  }

  async function openWhatsAppCampaign(mode: BrokerDatabaseWhatsAppAudience['mode']) {
    if (mode === 'selected_ids' && selectedIds.length === 0) return;
    const audience = buildWhatsAppAudience(mode);
    setWaAudience(audience);
    setWaConfirm(false);
    setWaErr(null);
    setWaOpen(true);
    if (token) {
      const tpl = await nestAdminWhatsAppTemplatesList(token);
      const approved =
        tpl?.templates?.filter((t) => t.status === 'APPROVED').map((t) => ({
          id: t.id,
          templateName: t.templateName,
          language: t.language,
        })) ?? [];
      setWaTemplates(approved);
      if (approved[0]) setWaTemplateId(approved[0].id);
      const cnt = await nestAdminBrokerDatabaseWhatsAppCount(token, audience);
      setWaCount(cnt?.count ?? 0);
    }
  }

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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setImportOpen(true);
                setImportPreview(null);
                setImportResult(null);
                setImportErr(null);
              }}
              className="rounded-full border border-orange-300 bg-orange-50 px-4 py-2 text-xs font-bold text-orange-900 hover:bg-orange-100"
            >
              Import z RealitníEso
            </button>
            <Link href="/admin/importy" className="text-sm font-semibold text-zinc-600 hover:text-zinc-900">
              Importy
            </Link>
          </div>
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
          <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-600">
            Stav kontaktu
            <select
              value={contactStatus}
              onChange={(e) => setContactStatus(e.target.value)}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
            >
              <option value="">(vše)</option>
              <option value="NEW">NEW</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="CONTACTED">CONTACTED</option>
              <option value="EMAILED">EMAILED</option>
              <option value="WHATSAPP_SENT">WHATSAPP_SENT</option>
              <option value="UNSUBSCRIBED">UNSUBSCRIBED</option>
              <option value="INVALID">INVALID</option>
              <option value="BLOCKED">BLOCKED</option>
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
                contactStatus: 'CONTACTED',
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
                contactStatus: 'EMAILED',
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
            className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-900 hover:bg-emerald-100"
            onClick={() => openCampaignEditor(selectedIds.length > 0 ? 'selected_ids' : 'filtered')}
          >
            Vytvořit e-mailovou kampaň
          </button>
          <button
            type="button"
            className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-50"
            onClick={() => openCampaignEditor('all_imported')}
          >
            Kampaň — všichni s e-mailem
          </button>
          <button
            type="button"
            className="rounded-full border border-emerald-400 bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-900 hover:bg-emerald-100"
            onClick={() => void openWhatsAppCampaign(selectedIds.length > 0 ? 'selected_ids' : 'filtered')}
          >
            Vytvořit WhatsApp kampaň
          </button>
          <button
            type="button"
            className="rounded-full border border-emerald-300 bg-white px-3 py-1.5 font-semibold text-emerald-800 hover:bg-emerald-50"
            onClick={() => void openWhatsAppCampaign('all_imported')}
          >
            WhatsApp — všichni s telefonem
          </button>
          <button
            type="button"
            className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1.5 font-semibold text-orange-900 hover:bg-orange-100"
            onClick={async () => {
              if (!token || selectedIds.length === 0) return;
              const r = await nestAdminBrokerContactsBulkUpdate(token, {
                ids: selectedIds,
                outreachStatus: 'prepared_mail',
              });
              if (r.ok) {
                setSelected({});
                openCampaignEditor('selected_ids');
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
                  <td className="px-3 py-2 text-xs">{row.contactStatus || row.status}</td>
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
              <Dt label="Stav" value={detail.contactStatus || detail.status} />
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
                  await nestAdminPatchBrokerContact(token, detail.id, {
                    outreachStatus: 'contacted',
                    contactStatus: 'CONTACTED',
                  });
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

      {importOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog">
          <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold">Import kontaktů z adresáře RK</h2>
              <button
                type="button"
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold"
                onClick={() => setImportOpen(false)}
              >
                Zavřít
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-bold text-zinc-600">
                URL adresáře
                <input
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-xs font-bold text-zinc-600">
                Zdroj
                <input
                  value={importSource}
                  onChange={(e) => setImportSource(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              {importErr ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{importErr}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={importBusy || !token}
                  className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold disabled:opacity-50"
                  onClick={async () => {
                    if (!token) return;
                    setImportBusy(true);
                    setImportErr(null);
                    setImportResult(null);
                    const r = await nestAdminBrokerDatabaseImportPreview(token, {
                      directoryUrl: importUrl,
                      source: importSource,
                    });
                    setImportBusy(false);
                    if (!r.ok || !r.data) {
                      setImportErr(r.error ?? 'Náhled se nepodařil.');
                      setImportPreview(null);
                      return;
                    }
                    setImportPreview(r.data);
                  }}
                >
                  {importBusy ? 'Načítám…' : 'Načíst náhled'}
                </button>
                <button
                  type="button"
                  disabled={importBusy || !token}
                  className="rounded-full bg-orange-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                  onClick={async () => {
                    if (!token) return;
                    setImportBusy(true);
                    setImportErr(null);
                    const r = await nestAdminBrokerDatabaseImportRun(token, {
                      directoryUrl: importUrl,
                      source: importSource,
                    });
                    setImportBusy(false);
                    if (!r.ok || !r.data) {
                      setImportErr(r.error ?? 'Import selhal.');
                      return;
                    }
                    setImportResult(r.data);
                    void load();
                  }}
                >
                  {importBusy ? 'Importuji…' : 'Spustit import'}
                </button>
              </div>
              {importPreview ? (
                <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">
                  <p>
                    Náhled: <strong>{importPreview.profilesFound}</strong> profilů (
                    {importPreview.pagesScanned} stránek)
                  </p>
                  <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
                    {importPreview.sample.map((s) => (
                      <li key={s.sourceUrl}>
                        {s.companyName} — {s.email || 'bez e-mailu'} / {s.phone || 'bez tel.'}
                      </li>
                    ))}
                  </ul>
                  {importPreview.errors.length > 0 ? (
                    <p className="mt-2 text-xs text-amber-800">{importPreview.errors.join(' · ')}</p>
                  ) : null}
                </div>
              ) : null}
              {importResult ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                  <p className="font-bold">Výsledek importu</p>
                  <ul className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    <li>Nalezeno profilů: {importResult.profilesFound}</li>
                    <li>Uloženo nových: {importResult.created}</li>
                    <li>Aktualizováno: {importResult.updated}</li>
                    <li>Duplicity: {importResult.duplicates}</li>
                    <li>Bez e-mailu: {importResult.withoutEmail}</li>
                    <li>Bez telefonu: {importResult.withoutPhone}</li>
                    <li>Chyby: {importResult.errors.length}</li>
                  </ul>
                  {importResult.errors.length > 0 ? (
                    <p className="mt-2 max-h-24 overflow-y-auto text-xs text-amber-900">
                      {importResult.errors.slice(0, 8).join(' · ')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {waOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold">WhatsApp kampaň — databáze makléřů</h2>
              <button
                type="button"
                className="rounded-full border border-zinc-200 px-3 py-1 text-sm font-semibold"
                onClick={() => setWaOpen(false)}
              >
                Zavřít
              </button>
            </div>
            <p className="mt-2 text-sm text-zinc-600">
              Příjemci:{' '}
              {waAudience.mode === 'selected_ids'
                ? 'označené kontakty s telefonem'
                : waAudience.mode === 'filtered'
                  ? 'aktuálně vyfiltrované s telefonem'
                  : 'všichni importovaní s telefonem'}
              {waCount != null ? (
                <>
                  {' '}
                  — <strong>{waCount}</strong> kontaktů
                </>
              ) : null}
            </p>
            <label className="mt-4 block text-xs font-bold text-zinc-600">
              WhatsApp šablona
              <select
                value={waTemplateId}
                onChange={(e) => setWaTemplateId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                {waTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.templateName} ({t.language})
                  </option>
                ))}
              </select>
            </label>
            {waErr ? (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{waErr}</p>
            ) : null}
            {!waConfirm ? (
              <button
                type="button"
                disabled={waBusy || !token || waCount === 0}
                className="mt-4 rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                onClick={() => setWaConfirm(true)}
              >
                Pokračovat k potvrzení
              </button>
            ) : (
              <div className="mt-4 space-y-2">
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Opravdu chcete spustit WhatsApp kampaň pro {waCount ?? 0} kontaktů?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-bold"
                    onClick={() => setWaConfirm(false)}
                  >
                    Zpět
                  </button>
                  <button
                    type="button"
                    disabled={waBusy || !token}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                    onClick={async () => {
                      if (!token) return;
                      const tpl = waTemplates.find((t) => t.id === waTemplateId);
                      if (!tpl) {
                        setWaErr('Vyberte šablonu.');
                        return;
                      }
                      setWaBusy(true);
                      setWaErr(null);
                      const r = await nestAdminBrokerDatabaseWhatsAppCampaign(token, {
                        audience: waAudience,
                        waMetaTemplateId: tpl.id,
                        waTemplateName: tpl.templateName,
                        waTemplateLanguage: tpl.language,
                        confirmed: true,
                      });
                      setWaBusy(false);
                      if (!r.ok) {
                        setWaErr(r.error ?? 'Kampaň se nepodařila spustit.');
                        return;
                      }
                      setWaOpen(false);
                      setWaConfirm(false);
                      void load();
                    }}
                  >
                    {waBusy ? 'Spouštím…' : 'Ano, spustit kampaň'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {campaignOpen && token ? (
        <EmailCampaignEditorModal
          token={token}
          adminEmail={user.email ?? undefined}
          initial={{ audience: campaignAudience, title: 'Oslovení makléřů z databáze' }}
          onClose={() => setCampaignOpen(false)}
          onSaved={() => {
            void load();
            setCampaignHistoryRefresh((n) => n + 1);
          }}
        />
      ) : null}

      {token ? (
        <EmailCampaignHistoryPanel
          token={token}
          adminEmail={user?.email ?? undefined}
          refreshKey={campaignHistoryRefresh}
        />
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
