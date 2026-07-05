'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { nestAdminPortalSearch, nestAdminGameLeadsStats, type AdminPortalSearchResult } from '@/lib/nest-client';
import { nestAdminSupportStats } from '@/lib/support-tickets-api';
import {
  ADMIN_QUICK_ACTIONS,
  ADMIN_SIDEBAR_GROUPS,
  ADMIN_TOP_NAV,
  flattenAdminNav,
  type AdminNavItem,
} from '@/lib/admin/navigation';

type Props = {
  children: ReactNode;
};

export function AdminShell({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoading, logout, apiAccessToken } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ dashboard: true });
  const [search, setSearch] = useState('');
  const [portalHits, setPortalHits] = useState<AdminPortalSearchResult | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [supportBadgeCount, setSupportBadgeCount] = useState(0);
  const [gameLeadsBadgeCount, setGameLeadsBadgeCount] = useState(0);
  const [lastGameLeadsNewCount, setLastGameLeadsNewCount] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user || user.role !== 'ADMIN') {
      router.replace('/');
    }
  }, [user, isLoading, router]);

  useEffect(() => {
    if (!apiAccessToken || user?.role !== 'ADMIN') return;
    void nestAdminSupportStats(apiAccessToken).then((s) => setSupportBadgeCount(s.badgeCount));
    const interval = window.setInterval(() => {
      void nestAdminSupportStats(apiAccessToken).then((s) => setSupportBadgeCount(s.badgeCount));
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [apiAccessToken, user?.role]);

  useEffect(() => {
    if (!apiAccessToken || user?.role !== 'ADMIN') return;
    const poll = () => {
      void nestAdminGameLeadsStats(apiAccessToken).then((stats) => {
        if (!stats) return;
        setGameLeadsBadgeCount(stats.newCount);
        setLastGameLeadsNewCount((prev) => {
          if (prev !== null && stats.newCount > prev) {
            setToast('Nový lead z registrační hry');
          }
          return stats.newCount;
        });
      });
    };
    poll();
    const interval = window.setInterval(poll, 30_000);
    return () => window.clearInterval(interval);
  }, [apiAccessToken, user?.role]);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2 || !apiAccessToken) {
      setPortalHits(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void nestAdminPortalSearch(apiAccessToken, q).then(setPortalHits);
    }, 280);
    return () => window.clearTimeout(handle);
  }, [search, apiAccessToken]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    return flattenAdminNav().filter(
      (i) => i.label.toLowerCase().includes(q) || i.href.toLowerCase().includes(q),
    );
  }, [search]);

  const hasSearchDropdown =
    search.trim().length >= 2 &&
    (searchResults.length > 0 ||
      (portalHits?.users.length ?? 0) > 0 ||
      (portalHits?.properties.length ?? 0) > 0);

  if (isLoading || !user || user.role !== 'ADMIN') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        <div className="h-8 w-8 animate-pulse rounded-full bg-orange-200" />
      </div>
    );
  }

  function toggleGroup(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  function NavLink({
    item,
    onClick,
    badge,
  }: {
    item: AdminNavItem;
    onClick?: () => void;
    badge?: number;
  }) {
    const active = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
    return (
      <Link
        href={item.href}
        onClick={onClick}
        className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
          active
            ? 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-100'
            : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
        }`}
      >
        <span aria-hidden>{item.icon}</span>
        <span className="flex-1">{item.label}</span>
        {badge && badge > 0 ? (
          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        ) : null}
      </Link>
    );
  }

  const sidebar = (
    <aside className="flex h-full flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-4 dark:border-zinc-800">
        <Link href="/admin" className="text-lg font-bold text-[#e85d00]">
          XXrealit
        </Link>
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-800">
          Admin
        </span>
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        {ADMIN_SIDEBAR_GROUPS.map((group) => (
          <div key={group.id} className="mb-1">
            {group.children ? (
              <>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-zinc-800 hover:bg-zinc-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  <span className="flex items-center gap-2">
                    {group.icon} {group.label}
                    {group.id === 'communication' && supportBadgeCount > 0 ? (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {supportBadgeCount > 99 ? '99+' : supportBadgeCount}
                      </span>
                    ) : null}
                    {group.id === 'marketing' && gameLeadsBadgeCount > 0 ? (
                      <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {gameLeadsBadgeCount > 99 ? '99+' : gameLeadsBadgeCount}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-zinc-400">{expanded[group.id] ? '▾' : '▸'}</span>
                </button>
                {expanded[group.id] ? (
                  <div className="ml-2 space-y-0.5 border-l border-zinc-100 pl-2 dark:border-zinc-800">
                    {group.children.map((child) => (
                      <NavLink
                        key={child.id}
                        item={child}
                        badge={
                          child.id === 'support-center'
                            ? supportBadgeCount
                            : child.id === 'gamification-leads'
                              ? gameLeadsBadgeCount
                              : undefined
                        }
                        onClick={() => setSidebarOpen(false)}
                      />
                    ))}
                  </div>
                ) : null}
              </>
            ) : group.href ? (
              <NavLink item={{ id: group.id, label: group.label, href: group.href, icon: group.icon }} />
            ) : null}
          </div>
        ))}
      </nav>
      <div className="border-t border-zinc-100 p-3 dark:border-zinc-800">
        <Link
          href="/"
          className="mb-2 block rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:text-zinc-400"
        >
          ← Portál
        </Link>
        <button
          type="button"
          onClick={() => logout()}
          className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
        >
          Odhlásit
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {sidebarOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-label="Zavřít menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="flex min-h-screen">
        <div
          className={`fixed inset-y-0 left-0 z-50 w-72 transform transition lg:static lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebar}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <button
                type="button"
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm lg:hidden"
                onClick={() => setSidebarOpen(true)}
              >
                ☰ Menu
              </button>
              <nav className="hidden flex-wrap gap-1 md:flex">
                {ADMIN_TOP_NAV.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="relative rounded-lg px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {item.icon} {item.label}
                    {item.id === 'marketing' && gameLeadsBadgeCount > 0 ? (
                      <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {gameLeadsBadgeCount > 99 ? '99+' : gameLeadsBadgeCount}
                      </span>
                    ) : null}
                  </Link>
                ))}
              </nav>
              <div className="relative ml-auto min-w-[200px] flex-1 md:max-w-md">
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Hledat v administraci…"
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200 dark:border-zinc-700 dark:bg-zinc-800"
                />
                {hasSearchDropdown ? (
                  <div className="absolute right-0 left-0 z-50 mt-1 max-h-80 overflow-auto rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
                    {portalHits?.users.map((u) => (
                      <Link
                        key={`u-${u.id}`}
                        href={`/admin#uzivatele`}
                        onClick={() => setSearch('')}
                        className="block border-b border-zinc-100 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                      >
                        👤 {u.name || u.email} · {u.role}
                        <span className="block text-xs text-zinc-500">{u.email}</span>
                      </Link>
                    ))}
                    {portalHits?.properties.map((p) => (
                      <Link
                        key={`p-${p.id}`}
                        href={`/admin/inzeraty?search=${encodeURIComponent(p.id)}`}
                        onClick={() => setSearch('')}
                        className="block border-b border-zinc-100 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800"
                      >
                        🏘 {p.title} · {p.city}
                      </Link>
                    ))}
                    {searchResults.map((r) => (
                      <Link
                        key={r.id + r.href}
                        href={r.href}
                        onClick={() => setSearch('')}
                        className="block px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        {r.icon} {r.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href="/"
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:border-orange-300 hover:text-[#e85d00] dark:border-zinc-700 dark:text-zinc-200"
                >
                  Přejít na web
                </Link>
                <button
                  type="button"
                  onClick={() => logout()}
                  className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                >
                  Odhlásit se
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 lg:p-8">{children}</main>
        </div>
      </div>

      <div className="fixed right-6 bottom-6 z-40">
        {fabOpen ? (
          <div className="mb-3 max-h-[70vh] w-56 overflow-auto rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
            {ADMIN_QUICK_ACTIONS.map((a) => (
              <Link
                key={a.id}
                href={a.href}
                onClick={() => setFabOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm font-medium hover:bg-orange-50 dark:hover:bg-zinc-800"
              >
                {a.icon} {a.label}
              </Link>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setFabOpen((v) => !v)}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6a00] to-[#ff3c00] text-2xl text-white shadow-lg transition hover:scale-105"
          aria-label="Rychlé akce"
        >
          ➕
        </button>
      </div>

      {toast ? (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
