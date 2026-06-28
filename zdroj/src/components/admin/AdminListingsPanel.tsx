'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { formatListingPrice } from '@/lib/price';
import { AdminListingTypeBadge } from '@/components/listing/TipBadges';
import { isTipListing } from '@/lib/is-tip-listing';
import type { AdminListingRow } from '@/lib/nest-client';
import {
  PROPERTY_FACEBOOK_STATUS_LABELS,
  type PropertyFacebookDisplayStatus,
} from '@/lib/social-autopost-admin-api';

function formatDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleString('cs-CZ', { dateStyle: 'short', timeStyle: 'short' })
    : '—';
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('cs-CZ') : '—';
}

function statusBadgeClass(status: string | undefined): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-900';
    case 'PENDING_APPROVAL':
      return 'bg-amber-100 text-amber-900';
    case 'INACTIVE':
      return 'bg-zinc-200 text-zinc-800';
    case 'EXPIRED':
      return 'bg-rose-100 text-rose-900';
    case 'SCHEDULED':
      return 'bg-sky-100 text-sky-900';
    case 'DELETED':
      return 'bg-red-100 text-red-900';
    default:
      return 'bg-zinc-100 text-zinc-700';
  }
}

function facebookStatusBadgeClass(status: PropertyFacebookDisplayStatus | undefined): string {
  switch (status) {
    case 'PUBLISHED':
      return 'bg-blue-100 text-blue-900';
    case 'SCHEDULED':
      return 'bg-sky-100 text-sky-900';
    case 'REPEAT_ACTIVE':
      return 'bg-indigo-100 text-indigo-900';
    case 'ERROR':
      return 'bg-red-100 text-red-900';
    default:
      return 'bg-zinc-100 text-zinc-600';
  }
}

function FacebookStatusCell({ status }: { status?: PropertyFacebookDisplayStatus }) {
  const key = status ?? 'NOT_PUBLISHED';
  return (
    <span
      className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${facebookStatusBadgeClass(key)}`}
      title={PROPERTY_FACEBOOK_STATUS_LABELS[key]}
    >
      {PROPERTY_FACEBOOK_STATUS_LABELS[key]}
    </span>
  );
}

function sourceLabel(r: AdminListingRow): string {
  if (r.importSource) return r.importSource;
  return 'Lokální';
}

function rowHasShortsVideo(r: AdminListingRow): boolean {
  const isShorts = String(r.listingType ?? '').toUpperCase() === 'SHORTS';
  const hasVideo = Boolean(String(r.videoUrl ?? '').trim());
  return isShorts && hasVideo;
}

type ActionHandlers = {
  onEdit: (r: AdminListingRow) => void;
  onApprove: (id: string) => void;
  onSoftDelete: (id: string) => void;
  onQuickSetActive: (id: string, isActive: boolean) => void;
  onRestore: (id: string) => void;
  onFacebookPublishNow?: (r: AdminListingRow) => void;
  onFacebookPublishReel?: (r: AdminListingRow) => void;
  onFacebookSchedule?: (r: AdminListingRow) => void;
  onFacebookSetRepeat?: (r: AdminListingRow) => void;
  onFacebookCancelRepeat?: (r: AdminListingRow) => void;
  onFacebookShowLog?: (r: AdminListingRow) => void;
};

function ListingDetail({ r }: { r: AdminListingRow }) {
  const images = Array.isArray(r.images) ? r.images.filter(Boolean) : [];

  return (
    <div className="border-t border-zinc-100 bg-zinc-50/80 px-4 py-5 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Popis a typ</h4>
          <div className="mb-2">
            <AdminListingTypeBadge listingType={r.listingType} isTip={isTipListing(r)} />
          </div>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {r.description?.trim() || 'Bez popisu'}
          </p>
          <p className="mt-3 font-mono text-[11px] text-zinc-400">ID: {r.id}</p>
          <Link
            href={`/nemovitost/${r.id}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm font-semibold text-orange-600 hover:underline"
          >
            Otevřít veřejný náhled →
          </Link>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Autor</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">E-mail</dt>
              <dd className="truncate">{r.authorEmail ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">User ID</dt>
              <dd className="truncate font-mono text-xs">{r.userId ?? '—'}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Aktivní od / do</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Od</dt>
              <dd>{formatDt(r.activeFrom)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Do</dt>
              <dd>{formatDt(r.activeUntil)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Veřejně aktivní</dt>
              <dd>{r.isActive !== false ? 'Ano' : 'Ne'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Schváleno</dt>
              <dd>{r.approved ? 'Ano' : 'Ne'}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">Logy a import</h4>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Zdroj</dt>
              <dd className="text-right text-xs">
                {r.importSource ? `${r.importSource}/${r.importMethod ?? '-'}` : 'Lokální'}
              </dd>
            </div>
            {r.importExternalId ? (
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Externí ID</dt>
                <dd className="font-mono text-xs">{r.importExternalId}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Importováno</dt>
              <dd>{formatDt(r.importedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Poslední sync</dt>
              <dd>{formatDt(r.lastSyncedAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Auto views</dt>
              <dd>
                {r.autoViewsEnabled
                  ? `+${r.autoViewsIncrement ?? 0} / ${r.autoViewsIntervalMinutes ?? 0} min`
                  : 'Vypnuto'}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Poslední auto views</dt>
              <dd>{formatDt(r.lastAutoViewsAt)}</dd>
            </div>
            {r.deletedAt ? (
              <div className="flex justify-between gap-2 text-red-700">
                <dt>Smazáno</dt>
                <dd>{formatDt(r.deletedAt)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {images.length > 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-4 lg:col-span-2 dark:border-zinc-700 dark:bg-zinc-900">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-500">
              Galerie ({images.length})
            </h4>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.slice(0, 12).map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt=""
                    className="size-20 rounded-lg border border-zinc-200 object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ActionsMenu({
  r,
  busy,
  open,
  onToggle,
  onClose,
  handlers,
}: {
  r: AdminListingRow;
  busy: boolean;
  open: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onClose: () => void;
  handlers: ActionHandlers;
}) {
  const pending = r.listingStatus === 'PENDING_APPROVAL';
  const deleted = Boolean(r.deletedAt);

  function run(fn: () => void) {
    onClose();
    fn();
  }

  return (
    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        disabled={busy}
        onClick={onToggle}
        className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
      >
        Akce ▾
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-10" aria-label="Zavřít menu" onClick={onClose} />
          <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
            <button
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
              onClick={() => run(() => handlers.onEdit(r))}
            >
              Upravit
            </button>
            {pending ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-emerald-800 hover:bg-emerald-50"
                onClick={() => run(() => handlers.onApprove(r.id))}
              >
                Schválit
              </button>
            ) : null}
            {!deleted && handlers.onFacebookPublishNow ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[#1877f2] hover:bg-blue-50"
                onClick={() => run(() => handlers.onFacebookPublishNow?.(r))}
              >
                Publikovat na Facebook teď
              </button>
            ) : null}
            {!deleted && handlers.onFacebookPublishReel ? (
              <button
                type="button"
                disabled={!rowHasShortsVideo(r)}
                title={!rowHasShortsVideo(r) ? 'Inzerát nemá shorts video' : undefined}
                className="block w-full px-3 py-2 text-left text-sm text-violet-800 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => run(() => handlers.onFacebookPublishReel?.(r))}
              >
                Publikovat jako Reel na Facebook
              </button>
            ) : null}
            {!deleted && handlers.onFacebookSchedule ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[#1877f2] hover:bg-blue-50"
                onClick={() => run(() => handlers.onFacebookSchedule?.(r))}
              >
                Naplánovat publikování
              </button>
            ) : null}
            {!deleted && handlers.onFacebookSetRepeat ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-[#1877f2] hover:bg-blue-50"
                onClick={() => run(() => handlers.onFacebookSetRepeat?.(r))}
              >
                Nastavit opakování
              </button>
            ) : null}
            {!deleted && handlers.onFacebookCancelRepeat ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                onClick={() => run(() => handlers.onFacebookCancelRepeat?.(r))}
              >
                Zrušit opakování
              </button>
            ) : null}
            {handlers.onFacebookShowLog ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                onClick={() => run(() => handlers.onFacebookShowLog?.(r))}
              >
                Zobrazit log publikování
              </button>
            ) : null}
            {!deleted && r.isActive !== false ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-amber-900 hover:bg-amber-50"
                onClick={() => run(() => handlers.onQuickSetActive(r.id, false))}
              >
                Deaktivovat
              </button>
            ) : null}
            {!deleted && r.isActive === false ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-emerald-800 hover:bg-emerald-50"
                onClick={() => run(() => handlers.onQuickSetActive(r.id, true))}
              >
                Aktivovat
              </button>
            ) : null}
            {deleted ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-blue-800 hover:bg-blue-50"
                onClick={() => run(() => handlers.onRestore(r.id))}
              >
                Obnovit
              </button>
            ) : (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                onClick={() => run(() => handlers.onSoftDelete(r.id))}
              >
                Smazat
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

function ListingRow({
  r,
  expanded,
  busy,
  menuOpen,
  selected,
  facebookStatus,
  onToggleSelect,
  onToggle,
  onMenuToggle,
  onMenuClose,
  handlers,
}: {
  r: AdminListingRow;
  expanded: boolean;
  busy: boolean;
  menuOpen: boolean;
  selected: boolean;
  facebookStatus?: PropertyFacebookDisplayStatus;
  onToggleSelect: (e: React.MouseEvent) => void;
  onToggle: () => void;
  onMenuToggle: (e: React.MouseEvent) => void;
  onMenuClose: () => void;
  handlers: ActionHandlers;
}) {
  const city = r.city ?? r.location ?? '';

  return (
    <div className={busy ? 'opacity-60' : ''}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-zinc-100 px-3 py-2.5 transition hover:bg-zinc-50 md:grid-cols-[auto_minmax(0,1fr)_5rem_4.5rem_5.5rem_5rem_5.5rem_3.5rem_auto] md:gap-x-2 md:px-4 dark:border-zinc-800 dark:hover:bg-zinc-900/50 ${
          expanded ? 'bg-orange-50/40 dark:bg-orange-950/20' : ''
        } ${selected ? 'bg-blue-50/30' : ''}`}
      >
        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => {}}
            onClick={onToggleSelect}
            aria-label={`Vybrat ${r.title ?? r.id}`}
            className="size-4 rounded border-zinc-300"
          />
        </div>
        <div className="min-w-0">
          <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{r.title ?? r.id}</p>
          <p className="truncate text-xs text-zinc-500">{city || '—'}</p>
        </div>

        <div className="hidden text-right text-sm tabular-nums md:block">{formatListingPrice(r.price)}</div>
        <div className="hidden truncate text-xs text-zinc-600 md:block" title={sourceLabel(r)}>
          {sourceLabel(r)}
        </div>
        <div className="hidden md:block">
          <span
            className={`inline-flex max-w-full truncate rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(r.listingStatus)}`}
          >
            {r.listingStatus ?? '—'}
          </span>
        </div>
        <div className="hidden md:block">
          <FacebookStatusCell status={facebookStatus} />
        </div>
        <div className="hidden whitespace-nowrap text-xs text-zinc-500 md:block">{formatDateShort(r.createdAt)}</div>
        <div className="hidden text-right text-xs font-semibold tabular-nums md:block">
          {Math.max(0, Math.trunc(r.viewsCount ?? 0)).toLocaleString('cs-CZ')}
        </div>

        <div className="col-start-2 row-start-1 flex items-center justify-end gap-1 md:col-start-auto md:row-start-auto">
          <span className={`text-zinc-400 transition md:mr-1 ${expanded ? 'rotate-180' : ''}`} aria-hidden>
            ▼
          </span>
          <ActionsMenu
            r={r}
            busy={busy}
            open={menuOpen}
            onToggle={onMenuToggle}
            onClose={onMenuClose}
            handlers={handlers}
          />
        </div>

        <div className="col-span-3 flex flex-wrap items-center gap-2 md:hidden">
          <FacebookStatusCell status={facebookStatus} />
          <span className="text-sm font-semibold tabular-nums">{formatListingPrice(r.price)}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(r.listingStatus)}`}
          >
            {r.listingStatus ?? '—'}
          </span>
          <span className="text-xs text-zinc-500">{formatDateShort(r.createdAt)}</span>
          <span className="text-xs font-semibold tabular-nums">
            👁 {Math.max(0, Math.trunc(r.viewsCount ?? 0)).toLocaleString('cs-CZ')}
          </span>
        </div>
      </div>
      {expanded ? <ListingDetail r={r} /> : null}
    </div>
  );
}

function ListingCard({
  r,
  expanded,
  busy,
  menuOpen,
  selected,
  facebookStatus,
  onToggleSelect,
  onToggle,
  onMenuToggle,
  onMenuClose,
  handlers,
}: {
  r: AdminListingRow;
  expanded: boolean;
  busy: boolean;
  menuOpen: boolean;
  selected: boolean;
  facebookStatus?: PropertyFacebookDisplayStatus;
  onToggleSelect: () => void;
  onToggle: () => void;
  onMenuToggle: (e: React.MouseEvent) => void;
  onMenuClose: () => void;
  handlers: ActionHandlers;
}) {
  return (
    <div className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-900 ${selected ? 'border-blue-300' : 'border-zinc-200 dark:border-zinc-800'}`}>
      <div className="flex items-start gap-3 p-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Vybrat ${r.title ?? r.id}`}
          className="mt-1 size-4 shrink-0 rounded border-zinc-300"
        />
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onToggle}>
          <p className="font-semibold text-zinc-900">{r.title ?? r.id}</p>
          <p className="text-sm text-zinc-500">{r.city ?? r.location ?? '—'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold tabular-nums">{formatListingPrice(r.price)}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusBadgeClass(r.listingStatus)}`}
            >
              {r.listingStatus ?? '—'}
            </span>
            <FacebookStatusCell status={facebookStatus} />
            <span className="text-xs text-zinc-500">{sourceLabel(r)}</span>
          </div>
        </button>
        <button
          type="button"
          className={`shrink-0 text-zinc-400 ${expanded ? 'rotate-180' : ''}`}
          onClick={onToggle}
          aria-label="Rozbalit detail"
        >
          ▼
        </button>
      </div>
      <div className="flex justify-end border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
        <ActionsMenu
          r={r}
          busy={busy}
          open={menuOpen}
          onToggle={onMenuToggle}
          onClose={onMenuClose}
          handlers={handlers}
        />
      </div>
      {expanded ? <ListingDetail r={r} /> : null}
    </div>
  );
}

type Props = {
  rows: AdminListingRow[];
  busyId: string | null;
  selectedIds: Set<string>;
  onSelectedIdsChange: (ids: Set<string>) => void;
  facebookStatusById: Record<string, PropertyFacebookDisplayStatus>;
  bulkActions?: React.ReactNode;
} & ActionHandlers;

export function AdminListingsPanel({
  rows,
  busyId,
  selectedIds,
  onSelectedIdsChange,
  facebookStatusById,
  bulkActions,
  ...handlers
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      onSelectedIdsChange(new Set());
    } else {
      onSelectedIdsChange(new Set(rows.map((r) => r.id)));
    }
  }, [allSelected, onSelectedIdsChange, rows]);

  const toggleSelect = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelectedIdsChange(next);
    },
    [onSelectedIdsChange, selectedIds],
  );

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    setMenuId(null);
  }, []);

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-zinc-200 bg-white px-4 py-10 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
        Žádné záznamy. Upravte filtry nebo zkuste znovu načíst.
      </p>
    );
  }

  return (
    <>
      {bulkActions ? (
        <div className="mb-4 rounded-2xl border border-[#1877f2]/20 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
          {bulkActions}
        </div>
      ) : null}

      <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_5rem_4.5rem_5.5rem_5rem_5.5rem_3.5rem_auto] gap-x-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="flex items-center">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleSelectAll}
              aria-label="Vybrat vše"
              className="size-4 rounded border-zinc-300"
            />
          </span>
          <span>Název / město</span>
          <span className="text-right">Cena</span>
          <span>Zdroj</span>
          <span>Stav</span>
          <span>Facebook</span>
          <span>Vytvořeno</span>
          <span className="text-right">Views</span>
          <span className="text-right">Akce</span>
        </div>
        {rows.map((r) => (
          <ListingRow
            key={r.id}
            r={r}
            expanded={expandedId === r.id}
            busy={busyId === r.id}
            menuOpen={menuId === r.id}
            selected={selectedIds.has(r.id)}
            facebookStatus={facebookStatusById[r.id]}
            onToggleSelect={(e) => {
              e.stopPropagation();
              toggleSelect(r.id);
            }}
            onToggle={() => toggleExpand(r.id)}
            onMenuToggle={(e) => {
              e.stopPropagation();
              setMenuId((prev) => (prev === r.id ? null : r.id));
            }}
            onMenuClose={() => setMenuId(null)}
            handlers={handlers}
          />
        ))}
      </div>

      <div className="space-y-3 md:hidden">
        <label className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium dark:border-zinc-800 dark:bg-zinc-900">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleSelectAll}
            className="size-4 rounded border-zinc-300"
          />
          Vybrat vše ({selectedIds.size})
        </label>
        {rows.map((r) => (
          <ListingCard
            key={r.id}
            r={r}
            expanded={expandedId === r.id}
            busy={busyId === r.id}
            menuOpen={menuId === r.id}
            selected={selectedIds.has(r.id)}
            facebookStatus={facebookStatusById[r.id]}
            onToggleSelect={() => toggleSelect(r.id)}
            onToggle={() => toggleExpand(r.id)}
            onMenuToggle={(e) => {
              e.stopPropagation();
              setMenuId((prev) => (prev === r.id ? null : r.id));
            }}
            onMenuClose={() => setMenuId(null)}
            handlers={handlers}
          />
        ))}
      </div>
    </>
  );
}
