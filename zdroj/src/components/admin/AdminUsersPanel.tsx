'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  nestAdminListings,
  type AdminListingRow,
  type AdminUserRow,
} from '@/lib/nest-client';
import {
  canRolePublishPosts,
  isAdminUserPublicProfileEnabled,
} from '@/lib/post-publish-eligibility';

const ROLE_OPTIONS = [
  'USER',
  'AGENT',
  'COMPANY',
  'AGENCY',
  'DEVELOPER',
  'PRIVATE_SELLER',
  'CRAFTSMAN',
  'TIPSTER',
  'FINANCIAL_ADVISOR',
  'INVESTOR',
  'PROPERTY_SEEKER',
  'PORTAL_WORKER',
  'ADMIN',
] as const;

type BadgeTone = 'green' | 'red' | 'yellow' | 'blue' | 'gray' | 'purple';

const BADGE_CLASSES: Record<BadgeTone, string> = {
  green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  yellow: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  blue: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200',
  gray: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  purple: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
};

function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}

function spendableCredit(u: AdminUserRow): number {
  return Math.max(0, u.realCreditBalance ?? 0) + Math.max(0, u.bonusCreditBalance ?? 0);
}

function isFakeDebt(u: AdminUserRow): boolean {
  const debt = Math.max(0, u.creditDebt ?? 0);
  if (debt <= 0) return false;
  return spendableCredit(u) > 0;
}

function accountStatus(u: AdminUserRow): { label: string; tone: BadgeTone } {
  if (isFakeDebt(u)) return { label: 'Falešný dluh', tone: 'yellow' };
  if (u.accountLimited && (u.creditDebt ?? 0) > 0) return { label: 'Omezený', tone: 'red' };
  return { label: 'Aktivní', tone: 'green' };
}

function userInitials(u: AdminUserRow): string {
  const n = (u.name || u.email || '?').trim();
  const parts = n.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('cs-CZ');
}

function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('cs-CZ');
}

type Filters = {
  search: string;
  role: string;
  whatsapp: string;
  email: string;
  account: string;
  credit: string;
};

type Props = {
  users: AdminUserRow[];
  loading: boolean;
  busyUserId: string | null;
  currentUserId?: string;
  token: string | null;
  creditDraftByUserId: Record<string, string>;
  roleChangeMessage: string | null;
  onCreditDraftChange: (userId: string, value: string) => void;
  onRoleChange: (userId: string, role: string) => void;
  onCreditSave: (userId: string) => void;
  onRecalculateCredit: (userId: string) => void;
  onVerifyCredit: (userId: string) => void;
  onUnverifyCredit: (userId: string) => void;
  onVerifyWhatsApp: (userId: string) => void;
  onResetWhatsApp: (userId: string) => void;
  onPremiumBrokerToggle: (u: AdminUserRow) => void;
  onPublicProfileToggle: (u: AdminUserRow) => void;
  onDeleteUser: (u: AdminUserRow) => void;
};

function UserListingsBlock({ token, userId }: { token: string | null; userId: string }) {
  const [listings, setListings] = useState<AdminListingRow[] | null>(null);
  const [loadingListings, setLoadingListings] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingListings(true);
    void nestAdminListings(token, { userId }).then((rows) => {
      if (!cancelled) {
        setListings(rows ?? []);
        setLoadingListings(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, userId]);

  if (loadingListings) {
    return <div className="h-16 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />;
  }
  if (!listings?.length) {
    return <p className="text-sm text-zinc-500">Uživatel nemá žádné inzeráty.</p>;
  }
  return (
    <ul className="space-y-2">
      {listings.slice(0, 8).map((l) => (
        <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <span className="font-medium">{l.title}</span>
          <div className="flex items-center gap-2">
            <Badge tone={l.approved ? 'green' : 'yellow'}>{l.approved ? 'Schváleno' : 'Čeká'}</Badge>
            <Link href={`/admin/inzeraty?search=${encodeURIComponent(l.id)}`} className="text-xs font-semibold text-orange-600 hover:underline">
              Detail
            </Link>
          </div>
        </li>
      ))}
      {listings.length > 8 ? (
        <p className="text-xs text-zinc-500">+ {listings.length - 8} dalších inzerátů</p>
      ) : null}
    </ul>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-zinc-500">{title}</h4>
      {children}
    </div>
  );
}

function UserDetail({
  u,
  busy,
  currentUserId,
  creditDraft,
  onCreditDraftChange,
  onRoleChange,
  onCreditSave,
  onRecalculateCredit,
  onVerifyCredit,
  onUnverifyCredit,
  onVerifyWhatsApp,
  onResetWhatsApp,
  onPremiumBrokerToggle,
  onPublicProfileToggle,
  onDeleteUser,
  token,
}: {
  u: AdminUserRow;
  busy: boolean;
  currentUserId?: string;
  creditDraft: string;
  token: string | null;
  onCreditDraftChange: (v: string) => void;
  onRoleChange: (role: string) => void;
  onCreditSave: () => void;
  onRecalculateCredit: () => void;
  onVerifyCredit: () => void;
  onUnverifyCredit: () => void;
  onVerifyWhatsApp: () => void;
  onResetWhatsApp: () => void;
  onPremiumBrokerToggle: () => void;
  onPublicProfileToggle: () => void;
  onDeleteUser: () => void;
}) {
  const status = accountStatus(u);
  const publicProfileEnabled = isAdminUserPublicProfileEnabled(u);
  const canTogglePublicProfile = canRolePublishPosts(u.role);
  const realDebt =
    u.accountLimited && (u.creditDebt ?? 0) > 0 && !isFakeDebt(u) ? u.creditDebt : 0;

  return (
    <div className="border-t border-zinc-100 bg-zinc-50/80 px-4 py-5 dark:border-zinc-800 dark:bg-zinc-950/50">
      <div className="grid gap-4 lg:grid-cols-2">
        <DetailSection title="Základní údaje">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">ID</dt>
              <dd className="font-mono text-xs">{u.id}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Jméno</dt>
              <dd>{u.name || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">E-mail</dt>
              <dd>{u.email}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Telefon</dt>
              <dd>{u.phone?.trim() || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">IČO</dt>
              <dd>{u.profileIco || '—'}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-zinc-500">Registrace</dt>
              <dd>{formatDateTime(u.createdAt)}</dd>
            </div>
          </dl>
        </DetailSection>

        <DetailSection title="Role a oprávnění">
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-600">Role</span>
            <select
              value={u.role}
              disabled={busy}
              onChange={(e) => onRoleChange(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          {u.role === 'AGENT' ? (
            <button
              type="button"
              disabled={busy}
              onClick={onPremiumBrokerToggle}
              className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                u.isPremiumBroker
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Premium makléř: {u.isPremiumBroker ? 'ano' : 'ne'} (přepnout)
            </button>
          ) : null}
          {canTogglePublicProfile ? (
            <button
              type="button"
              disabled={busy}
              onClick={onPublicProfileToggle}
              className={`mt-3 w-full rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                publicProfileEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              Veřejný profil: {publicProfileEnabled ? 'zapnutý' : 'vypnutý'} (přepnout)
            </button>
          ) : null}
          {u.isPromoProfile ? (
            <div className="mt-3 flex flex-wrap gap-1">
              <Badge tone="purple">Promo profil</Badge>
              <Badge tone={u.isPublicBrokerProfile ? 'green' : 'gray'}>
                {u.isPublicBrokerProfile ? 'Veřejný' : 'Neveřejný'}
              </Badge>
              <Badge tone={u.promoProfileActive !== false ? 'blue' : 'yellow'}>
                {u.promoProfileActive !== false ? 'Aktivní' : 'Vypnutý'}
              </Badge>
            </div>
          ) : null}
        </DetailSection>

        <DetailSection title="Ověření e-mailu / WhatsApp">
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>E-mail</span>
              <Badge tone={u.emailVerified ? 'green' : 'yellow'}>
                {u.emailVerified ? 'Ověřen' : 'Neověřen'}
              </Badge>
            </div>
            {u.emailVerifiedAt ? (
              <p className="text-xs text-zinc-500">{formatDateTime(u.emailVerifiedAt)}</p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono">{u.whatsappPhone?.trim() || '—'}</span>
              <Badge tone={u.whatsappVerified ? 'green' : 'yellow'}>
                {u.whatsappVerified ? 'WA ověřeno' : 'WA neověřeno'}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {!u.whatsappVerified ? (
                <button
                  type="button"
                  disabled={busy || !u.whatsappPhone?.trim()}
                  onClick={onVerifyWhatsApp}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  Označit WA ověřené
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onResetWhatsApp}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  Resetovat WhatsApp
                </button>
              )}
            </div>
          </div>
        </DetailSection>

        <DetailSection title="Kredity a historie">
          <div className="space-y-2 text-sm">
            <p>
              Běžný <strong>{(u.realCreditBalance ?? 0).toLocaleString('cs-CZ')}</strong> · Bonus{' '}
              <strong>{(u.bonusCreditBalance ?? 0).toLocaleString('cs-CZ')}</strong> · Čekající{' '}
              <strong>{(u.pendingCreditBalance ?? 0).toLocaleString('cs-CZ')}</strong> Kč
            </p>
            {realDebt ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                Skutečný dluh: {realDebt.toLocaleString('cs-CZ')} Kč
              </p>
            ) : isFakeDebt(u) ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                Zobrazen falešný dluh — použijte přepočet.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={creditDraft}
                disabled={busy}
                onChange={(e) => onCreditDraftChange(e.target.value)}
                className="w-28 rounded-lg border border-zinc-200 px-2 py-1.5 text-sm outline-none focus:border-orange-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-800"
                inputMode="numeric"
                title="Ruční úprava běžného kreditu"
              />
              <button
                type="button"
                disabled={busy}
                onClick={onCreditSave}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold hover:bg-zinc-50 disabled:opacity-50"
              >
                Uložit kredit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onRecalculateCredit}
                className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 disabled:opacity-50"
              >
                🧮 Přepočítat kredity
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {u.isCreditVerified ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onUnverifyCredit}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-50"
                >
                  Zrušit ověření pro kredit
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={onVerifyCredit}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 disabled:opacity-50"
                >
                  Ověřit pro kredit
                </button>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              {u.isCreditVerified ? 'Ověřen pro kredit' : 'Neověřen pro kredit'}
              {u.firstTopUpUsed ? ' · první dobití použito' : ''}
            </p>
            <Link href="/admin/dobiti-kreditu" className="text-xs font-semibold text-orange-600 hover:underline">
              Historie dobití v administraci →
            </Link>
          </div>
        </DetailSection>

        <DetailSection title="Inzeráty uživatele">
          <UserListingsBlock token={token} userId={u.id} />
        </DetailSection>

        <DetailSection title="Leady a odemčené kontakty">
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-zinc-500">Body makléře</dt>
              <dd>{u.brokerPoints ?? 0}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">Free leady</dt>
              <dd>{u.brokerFreeLeads ?? 0}</dd>
            </div>
          </dl>
          <Link href="/admin/provize-a-kontakty" className="mt-2 inline-block text-xs font-semibold text-orange-600 hover:underline">
            Provize a kontakty →
          </Link>
        </DetailSection>

        <DetailSection title="Provize / pracovník / tipař">
          <div className="flex flex-wrap gap-2">
            {u.role === 'TIPSTER' ? (
              <Link href="/admin/tipar" className="text-sm font-semibold text-violet-700 hover:underline">
                Správa tipařů →
              </Link>
            ) : null}
            {u.role === 'PORTAL_WORKER' ? (
              <Link href="/admin/pracovnici-portalu" className="text-sm font-semibold text-blue-700 hover:underline">
                Pracovníci portálu →
              </Link>
            ) : null}
            <Link href="/admin/provize-pracovniku" className="text-sm font-semibold text-blue-700 hover:underline">
              Provize pracovníků →
            </Link>
          </div>
          <p className="mt-2 text-xs text-zinc-500">Stav účtu: <Badge tone={status.tone}>{status.label}</Badge></p>
        </DetailSection>

        <DetailSection title="Poznámky admina">
          <p className="text-sm text-zinc-500">
            Interní poznámky k uživateli budou dostupné v další verzi. Pro systémové záznamy použijte{' '}
            <Link href="/admin/vyvojarske-poznamky" className="font-semibold text-orange-600 hover:underline">
              vývojářské poznámky
            </Link>
            .
          </p>
        </DetailSection>

        <DetailSection title="Nebezpečné akce">
          <button
            type="button"
            disabled={busy || u.id === currentUserId}
            onClick={onDeleteUser}
            className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Smazat účet
          </button>
          {u.id === currentUserId ? (
            <p className="mt-2 text-xs text-zinc-500">Vlastní admin účet nelze smazat.</p>
          ) : null}
        </DetailSection>
      </div>
    </div>
  );
}

function UserRow({
  u,
  expanded,
  busy,
  menuOpen,
  onToggle,
  onMenuToggle,
  onMenuClose,
}: {
  u: AdminUserRow;
  expanded: boolean;
  busy: boolean;
  menuOpen: boolean;
  onToggle: () => void;
  onMenuToggle: (e: React.MouseEvent) => void;
  onMenuClose: () => void;
}) {
  const status = accountStatus(u);
  const creditTotal = spendableCredit(u);

  return (
    <>
      <div
        className={`group flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-3 py-3 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/50 md:px-4 ${
          expanded ? 'bg-orange-50/50 dark:bg-orange-950/20' : ''
        } ${busy ? 'opacity-60' : ''}`}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
      >
        {u.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-800">
            {userInitials(u)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
              {u.name || u.email}
            </span>
            {u.name ? <span className="truncate text-xs text-zinc-500">{u.email}</span> : null}
          </div>
          <div className="mt-1 flex flex-wrap gap-1 md:hidden">
            <Badge tone="blue">{u.role}</Badge>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
        </div>

        <div className="hidden shrink-0 md:block">
          <Badge tone="blue">{u.role}</Badge>
        </div>
        <div className="hidden shrink-0 lg:block">
          <Badge tone={u.whatsappVerified ? 'green' : 'yellow'}>
            {u.whatsappVerified ? 'WA ✓' : 'WA —'}
          </Badge>
        </div>
        <div className="hidden shrink-0 lg:block">
          <Badge tone={u.emailVerified ? 'green' : 'yellow'}>
            {u.emailVerified ? 'E-mail ✓' : 'E-mail —'}
          </Badge>
        </div>
        <div className="hidden shrink-0 text-sm font-semibold tabular-nums md:block">
          {creditTotal.toLocaleString('cs-CZ')} Kč
        </div>
        <div className="hidden shrink-0 text-xs text-zinc-500 xl:block">{formatDate(u.createdAt)}</div>
        <div className="hidden shrink-0 xl:block">
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-lg px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100"
          >
            Detail
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={onMenuToggle}
              className="rounded-lg px-2 py-1 text-lg leading-none text-zinc-600 hover:bg-zinc-100"
              aria-label="Rychlé menu"
            >
              ⋯
            </button>
            {menuOpen ? (
              <>
                <button type="button" className="fixed inset-0 z-10" aria-label="Zavřít menu" onClick={onMenuClose} />
                <div className="absolute right-0 z-20 mt-1 w-44 rounded-xl border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    onClick={() => {
                      onMenuClose();
                      onToggle();
                    }}
                  >
                    Rozbalit detail
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    onClick={() => {
                      void navigator.clipboard?.writeText(u.email);
                      onMenuClose();
                    }}
                  >
                    Kopírovat e-mail
                  </button>
                  <Link
                    href={`/profil/${u.id}`}
                    className="block px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                    onClick={onMenuClose}
                  >
                    Veřejný profil
                  </Link>
                </div>
              </>
            ) : null}
          </div>
          <span
            className={`hidden text-zinc-400 transition group-hover:text-orange-600 md:inline ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          >
            ▼
          </span>
        </div>
      </div>
    </>
  );
}

function SkeletonRows() {
  return (
    <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-4">
          <div className="size-10 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            <div className="h-3 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function AdminUsersPanel({
  users,
  loading,
  busyUserId,
  currentUserId,
  token,
  creditDraftByUserId,
  roleChangeMessage,
  onCreditDraftChange,
  onRoleChange,
  onCreditSave,
  onRecalculateCredit,
  onVerifyCredit,
  onUnverifyCredit,
  onVerifyWhatsApp,
  onResetWhatsApp,
  onPremiumBrokerToggle,
  onPublicProfileToggle,
  onDeleteUser,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    search: '',
    role: '',
    whatsapp: '',
    email: '',
    account: '',
    credit: '',
  });

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (roleChangeMessage) setToast(roleChangeMessage);
  }, [roleChangeMessage]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return users.filter((u) => {
      if (filters.role && u.role !== filters.role) return false;
      if (filters.whatsapp === 'verified' && !u.whatsappVerified) return false;
      if (filters.whatsapp === 'unverified' && u.whatsappVerified) return false;
      if (filters.email === 'verified' && !u.emailVerified) return false;
      if (filters.email === 'unverified' && u.emailVerified) return false;
      if (filters.account === 'active' && accountStatus(u).label !== 'Aktivní') return false;
      if (filters.account === 'limited' && accountStatus(u).label === 'Aktivní') return false;
      if (filters.account === 'fake-debt' && !isFakeDebt(u)) return false;
      if (filters.credit === 'negative' && spendableCredit(u) >= 0) return false;
      if (filters.credit === 'fake-debt' && !isFakeDebt(u)) return false;
      if (!q) return true;
      const hay = [
        u.name,
        u.email,
        u.phone,
        u.whatsappPhone,
        u.profileIco,
        u.id,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [users, filters]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    setMenuUserId(null);
  }, []);

  return (
    <div className="space-y-4">
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-900 shadow-lg"
          role="status"
        >
          {toast}
        </div>
      ) : null}

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="sm:col-span-2 lg:col-span-3 xl:col-span-2">
            <label className="mb-1 block text-xs font-medium text-zinc-600">Hledat</label>
            <input
              value={filters.search}
              onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
              placeholder="Jméno, e-mail, telefon, IČO, ID…"
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200 dark:border-zinc-700 dark:bg-zinc-800"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Role</label>
            <select
              value={filters.role}
              onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">Všechny</option>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">WhatsApp</label>
            <select
              value={filters.whatsapp}
              onChange={(e) => setFilters((f) => ({ ...f, whatsapp: e.target.value }))}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">Vše</option>
              <option value="verified">Ověřeno</option>
              <option value="unverified">Neověřeno</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">E-mail</label>
            <select
              value={filters.email}
              onChange={(e) => setFilters((f) => ({ ...f, email: e.target.value }))}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">Vše</option>
              <option value="verified">Ověřen</option>
              <option value="unverified">Neověřen</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Stav účtu</label>
            <select
              value={filters.account}
              onChange={(e) => setFilters((f) => ({ ...f, account: e.target.value }))}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">Vše</option>
              <option value="active">Aktivní</option>
              <option value="limited">Omezený / dluh</option>
              <option value="fake-debt">Falešný dluh</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">Kredit</label>
            <select
              value={filters.credit}
              onChange={(e) => setFilters((f) => ({ ...f, credit: e.target.value }))}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            >
              <option value="">Vše</option>
              <option value="negative">Pod nulou</option>
              <option value="fake-debt">Falešný dluh</option>
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Zobrazeno {filtered.length} z {users.length} uživatelů
        </p>
      </div>

      <div className="hidden overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm md:block dark:border-zinc-800 dark:bg-zinc-900">
        <div className="grid grid-cols-[auto_1fr_repeat(6,minmax(0,auto))] gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
          <span className="w-10" />
          <span>Uživatel</span>
          <span>Role</span>
          <span className="hidden lg:block">WhatsApp</span>
          <span className="hidden lg:block">E-mail</span>
          <span>Kredit</span>
          <span className="hidden xl:block">Registrace</span>
          <span className="hidden xl:block">Stav</span>
          <span className="w-24 text-right">Akce</span>
        </div>
        {loading && users.length === 0 ? (
          <SkeletonRows />
        ) : filtered.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-500">Žádní uživatelé nevyhovují filtru.</p>
        ) : (
          filtered.map((u) => (
            <div key={u.id}>
              <UserRow
                u={u}
                expanded={expandedId === u.id}
                busy={busyUserId === u.id}
                menuOpen={menuUserId === u.id}
                onToggle={() => toggleExpand(u.id)}
                onMenuToggle={(e) => {
                  e.stopPropagation();
                  setMenuUserId((prev) => (prev === u.id ? null : u.id));
                }}
                onMenuClose={() => setMenuUserId(null)}
              />
              {expandedId === u.id ? (
                <UserDetail
                  u={u}
                  busy={busyUserId === u.id}
                  currentUserId={currentUserId}
                  token={token}
                  creditDraft={
                    creditDraftByUserId[u.id] ??
                    String(Math.max(0, u.realCreditBalance ?? u.creditBalance ?? 0))
                  }
                  onCreditDraftChange={(v) => onCreditDraftChange(u.id, v)}
                  onRoleChange={(role) => onRoleChange(u.id, role)}
                  onCreditSave={() => onCreditSave(u.id)}
                  onRecalculateCredit={() => onRecalculateCredit(u.id)}
                  onVerifyCredit={() => onVerifyCredit(u.id)}
                  onUnverifyCredit={() => onUnverifyCredit(u.id)}
                  onVerifyWhatsApp={() => onVerifyWhatsApp(u.id)}
                  onResetWhatsApp={() => onResetWhatsApp(u.id)}
                  onPremiumBrokerToggle={() => onPremiumBrokerToggle(u)}
                  onPublicProfileToggle={() => onPublicProfileToggle(u)}
                  onDeleteUser={() => onDeleteUser(u)}
                />
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="space-y-3 md:hidden">
        {loading && users.length === 0 ? (
          <SkeletonRows />
        ) : (
          filtered.map((u) => {
            const status = accountStatus(u);
            return (
              <div
                key={u.id}
                className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-3 p-4 text-left"
                  onClick={() => toggleExpand(u.id)}
                >
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatarUrl} alt="" className="size-12 rounded-full object-cover" />
                  ) : (
                    <div className="flex size-12 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-800">
                      {userInitials(u)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{u.name || u.email}</p>
                    <p className="truncate text-xs text-zinc-500">{u.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge tone="blue">{u.role}</Badge>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <Badge tone={u.whatsappVerified ? 'green' : 'yellow'}>WA</Badge>
                      <Badge tone={u.emailVerified ? 'green' : 'yellow'}>E-mail</Badge>
                    </div>
                    <p className="mt-2 text-sm font-semibold tabular-nums">
                      {spendableCredit(u).toLocaleString('cs-CZ')} Kč
                    </p>
                  </div>
                  <span className={`text-zinc-400 ${expandedId === u.id ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {expandedId === u.id ? (
                  <UserDetail
                    u={u}
                    busy={busyUserId === u.id}
                    currentUserId={currentUserId}
                    token={token}
                    creditDraft={
                      creditDraftByUserId[u.id] ??
                      String(Math.max(0, u.realCreditBalance ?? u.creditBalance ?? 0))
                    }
                    onCreditDraftChange={(v) => onCreditDraftChange(u.id, v)}
                    onRoleChange={(role) => onRoleChange(u.id, role)}
                    onCreditSave={() => onCreditSave(u.id)}
                    onRecalculateCredit={() => onRecalculateCredit(u.id)}
                    onVerifyCredit={() => onVerifyCredit(u.id)}
                    onUnverifyCredit={() => onUnverifyCredit(u.id)}
                    onVerifyWhatsApp={() => onVerifyWhatsApp(u.id)}
                    onResetWhatsApp={() => onResetWhatsApp(u.id)}
                    onPremiumBrokerToggle={() => onPremiumBrokerToggle(u)}
                    onPublicProfileToggle={() => onPublicProfileToggle(u)}
                    onDeleteUser={() => onDeleteUser(u)}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
