'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import {
  nestAdminAnalyticsLocations,
  nestAdminAnalyticsRealtime,
  nestAdminAnalyticsSessionDetail,
  nestAdminAnalyticsSessions,
  nestAdminAnalyticsSettings,
  nestAdminAnalyticsSummary,
  nestAdminUpdateAnalyticsSettings,
  type NestAnalyticsLiveRow,
  type NestAnalyticsSessionBrief,
  type NestAnalyticsSessionDetail,
  type NestAnalyticsSettings,
  type NestAnalyticsSummary,
} from '@/lib/nest-client';

export type AdminAnalyticsSection =
  | 'prehled'
  | 'realny-cas'
  | 'stranky'
  | 'zdroje'
  | 'lokace'
  | 'zarizeni';

const SECTION_META: Record<
  AdminAnalyticsSection,
  { title: string; description: string }
> = {
  prehled: {
    title: 'Přehled návštěv',
    description: 'Souhrnné statistiky, grafy a historie návštěv portálu.',
  },
  'realny-cas': {
    title: 'Návštěvnost v reálném čase',
    description: 'Aktuální online návštěvníci a živý pohyb na webu.',
  },
  stranky: {
    title: 'Stránky',
    description: 'Nejnavštěvovanější stránky portálu.',
  },
  zdroje: {
    title: 'Zdroje návštěvnosti',
    description: 'Odkud návštěvníci přicházejí (referrer).',
  },
  lokace: {
    title: 'Lokace',
    description: 'Geografický přehled podle IP adresy (bez GPS).',
  },
  zarizeni: {
    title: 'Zařízení',
    description: 'Rozložení návštěv podle typu zařízení.',
  },
};

const PERIOD_OPTIONS = [
  { id: 'today', label: 'Dnes' },
  { id: 'yesterday', label: 'Včera' },
  { id: '7d', label: '7 dní' },
  { id: '30d', label: '30 dní' },
  { id: 'custom', label: 'Vlastní' },
] as const;

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtDuration(seconds: number) {
  if (seconds < 60) return `${seconds} s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} min ${s} s`;
}

function BarChart({
  label,
  items,
}: {
  label: string;
  items: { key: string; count: number }[];
}) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-4 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-zinc-500">Zatím žádná data.</p>
        ) : (
          items.map((item) => (
            <div key={item.key} className="flex items-center gap-3 text-sm">
              <span className="w-40 shrink-0 truncate text-zinc-700" title={item.key}>
                {item.key}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
                />
              </div>
              <span className="w-10 text-right tabular-nums text-zinc-600">{item.count}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-orange-50 to-white p-5 shadow-sm">
      <p className="text-3xl font-bold tabular-nums text-orange-900">{value}</p>
      <p className="mt-2 text-sm font-semibold text-zinc-800">{label}</p>
      {hint ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

function SessionDetailPanel({
  detail,
  onClose,
}: {
  detail: NestAnalyticsSessionDetail;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Detail návštěvníka</h2>
            <p className="mt-1 text-xs text-zinc-500">Session ID: {detail.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-200 px-3 py-1 text-sm hover:bg-zinc-50"
          >
            Zavřít
          </button>
        </div>

        <dl className="mt-6 space-y-3 text-sm">
          <div>
            <dt className="text-zinc-500">Návštěvník</dt>
            <dd className="font-medium">
              {detail.userName ?? detail.userEmail ?? `Anonymní (${detail.visitorId.slice(0, 8)}…)`}
            </dd>
          </div>
          {detail.userId ? (
            <div>
              <dt className="text-zinc-500">User ID</dt>
              <dd className="font-mono text-xs">{detail.userId}</dd>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-zinc-500">První návštěva</dt>
              <dd>{fmtTime(detail.firstSeenAt)}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Poslední aktivita</dt>
              <dd>{fmtTime(detail.lastSeenAt)}</dd>
            </div>
          </div>
          <div>
            <dt className="text-zinc-500">Délka relace</dt>
            <dd>{fmtDuration(detail.durationSeconds)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">Zobrazení</dt>
            <dd>{detail.pageViewCount}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-zinc-500">Země / město</dt>
              <dd>
                {[detail.country, detail.city].filter(Boolean).join(' / ') || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Zařízení</dt>
              <dd>
                {detail.deviceType} · {detail.browser} · {detail.os}
              </dd>
            </div>
          </div>
          <div>
            <dt className="text-zinc-500">Referrer</dt>
            <dd className="break-all">{detail.referrer || '—'}</dd>
          </div>
          {(detail.utmSource || detail.utmMedium || detail.utmCampaign) && (
            <div>
              <dt className="text-zinc-500">UTM</dt>
              <dd className="font-mono text-xs">
                {[detail.utmSource, detail.utmMedium, detail.utmCampaign].filter(Boolean).join(' / ')}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-zinc-500">IP adresa (pouze admin)</dt>
            <dd className="font-mono text-xs">{detail.ip || '—'}</dd>
          </div>
        </dl>

        <h3 className="mt-6 text-sm font-semibold text-zinc-800">Navštívené stránky</h3>
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-sm">
          {detail.pageViews.map((pv) => (
            <li key={pv.id} className="rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
              <p className="font-medium">{pv.title || pv.path}</p>
              <p className="text-xs text-zinc-500">{fmtTime(pv.createdAt)} · {pv.path}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

type Props = { section: AdminAnalyticsSection };

export function AdminAnalyticsHub({ section }: Props) {
  const { user, apiAccessToken } = useAuth();
  const token = apiAccessToken;
  const meta = SECTION_META[section];

  const [period, setPeriod] = useState<(typeof PERIOD_OPTIONS)[number]['id']>('today');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [filterPath, setFilterPath] = useState('');
  const [filterCountry, setFilterCountry] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterReferrer, setFilterReferrer] = useState('');
  const [filterLoggedIn, setFilterLoggedIn] = useState('');
  const [filterDevice, setFilterDevice] = useState('');

  const [realtime, setRealtime] = useState<Awaited<ReturnType<typeof nestAdminAnalyticsRealtime>>>(null);
  const [summary, setSummary] = useState<NestAnalyticsSummary | null>(null);
  const [sessions, setSessions] = useState<NestAnalyticsSessionBrief[]>([]);
  const [locations, setLocations] = useState<
    Array<{
      country: string;
      city: string;
      visitors: number;
      pageViews: number;
      lastActivity: string | null;
    }>
  >([]);
  const [settings, setSettings] = useState<NestAnalyticsSettings | null>(null);
  const [selectedSession, setSelectedSession] = useState<NestAnalyticsSessionDetail | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const periodQuery = useMemo(() => {
    if (period === 'custom' && customFrom && customTo) {
      return { period: 'custom', from: customFrom, to: customTo };
    }
    return { period: period === 'custom' ? 'today' : period };
  }, [period, customFrom, customTo]);

  const sessionFilters = useMemo(
    () => ({
      ...periodQuery,
      path: filterPath || undefined,
      country: filterCountry || undefined,
      city: filterCity || undefined,
      referrer: filterReferrer || undefined,
      loggedIn: filterLoggedIn || undefined,
      deviceType: filterDevice || undefined,
    }),
    [periodQuery, filterPath, filterCountry, filterCity, filterReferrer, filterLoggedIn, filterDevice],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    const tasks: Promise<void>[] = [];

    if (section === 'realny-cas' || section === 'prehled') {
      tasks.push(
        nestAdminAnalyticsRealtime(token).then((r) => {
          if (r) setRealtime(r);
        }),
      );
    }
    if (section === 'prehled' || section === 'stranky' || section === 'zdroje' || section === 'zarizeni') {
      tasks.push(
        nestAdminAnalyticsSummary(token, periodQuery).then((r) => {
          if (r) setSummary(r);
        }),
      );
    }
    if (section === 'prehled' || section === 'realny-cas') {
      tasks.push(
        nestAdminAnalyticsSessions(token, sessionFilters).then((r) => {
          if (r) setSessions(r.items);
        }),
      );
    }
    if (section === 'lokace' || section === 'prehled') {
      tasks.push(
        nestAdminAnalyticsLocations(token, periodQuery).then((r) => {
          if (r) setLocations(r.items);
        }),
      );
    }
    if (section === 'prehled') {
      tasks.push(
        nestAdminAnalyticsSettings(token).then((r) => {
          if (r) setSettings(r);
        }),
      );
    }

    await Promise.all(tasks);
  }, [token, section, periodQuery, sessionFilters]);

  useEffect(() => {
    if (token && user?.role === 'ADMIN') void refresh();
  }, [token, user?.role, refresh]);

  useEffect(() => {
    if (section !== 'realny-cas' && section !== 'prehled') return undefined;
    const t = setInterval(() => void refresh(), section === 'realny-cas' ? 10000 : 30000);
    return () => clearInterval(t);
  }, [section, refresh]);

  async function openSession(id: string) {
    if (!token) return;
    const detail = await nestAdminAnalyticsSessionDetail(token, id);
    if (detail) setSelectedSession(detail);
  }

  async function saveSettings(patch: Partial<NestAnalyticsSettings>) {
    if (!token) return;
    const r = await nestAdminUpdateAnalyticsSettings(token, patch);
    if (r) {
      setSettings(r);
      setStatus('Nastavení analytiky uloženo.');
    }
  }

  if (!token || user?.role !== 'ADMIN') return null;

  const cards = realtime?.cards;
  const charts = summary?.charts;
  const liveRows = realtime?.liveRows ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">{meta.title}</h1>
        <p className="mt-1 text-sm text-zinc-600">{meta.description}</p>
      </div>

      <nav className="flex flex-wrap gap-2">
        {(Object.keys(SECTION_META) as AdminAnalyticsSection[]).map((s) => (
          <Link
            key={s}
            href={`/admin/statistiky/${s === 'prehled' ? 'prehled' : s}`}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              s === section
                ? 'bg-orange-600 text-white'
                : 'border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
            }`}
          >
            {SECTION_META[s].title}
          </Link>
        ))}
      </nav>

      {status ? (
        <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700">{status}</p>
      ) : null}

      {(section === 'prehled' ||
        section === 'stranky' ||
        section === 'zdroje' ||
        section === 'lokace' ||
        section === 'zarizeni') && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 bg-white p-4">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                period === p.id ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'
              }`}
            >
              {p.label}
            </button>
          ))}
          {period === 'custom' ? (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-zinc-200 px-2 py-1 text-sm"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-zinc-200 px-2 py-1 text-sm"
              />
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void refresh()}
            className="ml-auto rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white"
          >
            Obnovit
          </button>
        </div>
      )}

      {(section === 'realny-cas' || section === 'prehled') && cards ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Online návštěvníci" value={cards.onlineTotal} hint="posledních 5 min" />
          <StatCard label="Přihlášení online" value={cards.onlineLoggedIn} />
          <StatCard label="Anonymní online" value={cards.onlineAnonymous} />
          <StatCard label="Aktivní relace (5 min)" value={cards.activeSessions5m} />
          <StatCard label="Návštěvy dnes" value={cards.visitsToday} />
          <StatCard label="Zobrazení dnes" value={cards.pageViewsToday} />
        </div>
      ) : null}

      {section === 'prehled' && summary ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Relace ve období" value={summary.sessions} />
          <StatCard label="Zobrazení stránek" value={summary.pageViews} />
          <StatCard label="Unikátní návštěvníci" value={summary.uniqueVisitors} />
          <StatCard label="Noví / vracející se" value={`${summary.newVisitors} / ${summary.returningVisitors}`} />
        </div>
      ) : null}

      {section === 'prehled' && charts ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <BarChart
            label="Návštěvy za 24 hodin"
            items={(charts.visitsByHour ?? []).map((h) => ({
              key: fmtTime(h.hour).slice(-8),
              count: h.pageViews,
            }))}
          />
          <BarChart
            label="Online po minutách"
            items={(charts.onlineByMinute ?? []).slice(-20).map((m) => ({
              key: fmtTime(m.minute).slice(-8),
              count: m.count,
            }))}
          />
          <BarChart
            label="Nejnavštěvovanější stránky"
            items={(charts.topPages ?? []).map((p) => ({ key: p.path, count: p.count }))}
          />
          <BarChart
            label="Zdroje návštěvnosti"
            items={(charts.topReferrers ?? []).map((r) => ({ key: r.referrer, count: r.count }))}
          />
        </div>
      ) : null}

      {section === 'stranky' && charts ? (
        <BarChart
          label="Nejnavštěvovanější stránky"
          items={(charts.topPages ?? []).map((p) => ({ key: p.path, count: p.count }))}
        />
      ) : null}

      {section === 'zdroje' && charts ? (
        <BarChart
          label="Zdroje návštěvnosti"
          items={(charts.topReferrers ?? []).map((r) => ({ key: r.referrer, count: r.count }))}
        />
      ) : null}

      {section === 'zarizeni' && charts ? (
        <BarChart
          label="Zařízení"
          items={(charts.byDevice ?? []).map((d) => ({ key: d.device, count: d.count }))}
        />
      ) : null}

      {(section === 'lokace' || section === 'prehled') && (
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-4 py-3">Země</th>
                <th className="px-4 py-3">Město</th>
                <th className="px-4 py-3">Návštěvníci</th>
                <th className="px-4 py-3">Zobrazení</th>
                <th className="px-4 py-3">Poslední aktivita</th>
              </tr>
            </thead>
            <tbody>
              {locations.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    Zatím žádná data.
                  </td>
                </tr>
              ) : (
                locations.map((row, i) => (
                  <tr key={`${row.country}-${row.city}-${i}`} className="border-b border-zinc-50">
                    <td className="px-4 py-3">{row.country}</td>
                    <td className="px-4 py-3">{row.city}</td>
                    <td className="px-4 py-3 tabular-nums">{row.visitors}</td>
                    <td className="px-4 py-3 tabular-nums">{row.pageViews}</td>
                    <td className="px-4 py-3">{row.lastActivity ? fmtTime(row.lastActivity) : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {(section === 'realny-cas' || section === 'prehled') && (
        <>
          {section === 'prehled' ? (
            <div className="grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 md:grid-cols-3 lg:grid-cols-6">
              <input
                placeholder="URL / cesta"
                value={filterPath}
                onChange={(e) => setFilterPath(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Země"
                value={filterCountry}
                onChange={(e) => setFilterCountry(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Město"
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <input
                placeholder="Referrer"
                value={filterReferrer}
                onChange={(e) => setFilterReferrer(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              />
              <select
                value={filterLoggedIn}
                onChange={(e) => setFilterLoggedIn(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="">Všichni</option>
                <option value="yes">Přihlášení</option>
                <option value="no">Anonymní</option>
              </select>
              <select
                value={filterDevice}
                onChange={(e) => setFilterDevice(e.target.value)}
                className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="">Všechna zařízení</option>
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobil</option>
                <option value="tablet">Tablet</option>
              </select>
            </div>
          ) : null}

          <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <h2 className="border-b border-zinc-100 px-4 py-3 text-sm font-semibold text-zinc-800">
              {section === 'realny-cas' ? 'Aktuální pohyb na webu' : 'Historie návštěv'}
            </h2>
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50 text-xs uppercase text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Čas</th>
                  <th className="px-3 py-2">Návštěvník</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Stránka</th>
                  <th className="px-3 py-2">Předchozí</th>
                  <th className="px-3 py-2">Referrer</th>
                  <th className="px-3 py-2">Zařízení</th>
                  <th className="px-3 py-2">Prohlížeč</th>
                  <th className="px-3 py-2">OS</th>
                  <th className="px-3 py-2">IP</th>
                  <th className="px-3 py-2">Země</th>
                  <th className="px-3 py-2">Město</th>
                  <th className="px-3 py-2">Jazyk</th>
                </tr>
              </thead>
              <tbody>
                {(section === 'realny-cas' ? liveRows : []).length === 0 &&
                (section === 'prehled' ? sessions : []).length === 0 ? (
                  <tr>
                    <td colSpan={13} className="px-4 py-8 text-center text-zinc-500">
                      Zatím žádná aktivita.
                    </td>
                  </tr>
                ) : section === 'realny-cas' ? (
                  liveRows.map((row: NestAnalyticsLiveRow) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-zinc-50 hover:bg-orange-50/50"
                      onClick={() => void openSession(row.sessionId)}
                    >
                      <td className="whitespace-nowrap px-3 py-2">{fmtTime(row.at)}</td>
                      <td className="px-3 py-2">
                        {row.userName ?? row.userEmail ?? `Anonymní`}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2" title={row.url}>
                        {row.path}
                      </td>
                      <td className="max-w-[120px] truncate px-3 py-2">{row.title || '—'}</td>
                      <td className="max-w-[100px] truncate px-3 py-2">{row.previousPath || '—'}</td>
                      <td className="max-w-[120px] truncate px-3 py-2">{row.referrer || '—'}</td>
                      <td className="px-3 py-2">{row.deviceType}</td>
                      <td className="px-3 py-2">{row.browser}</td>
                      <td className="px-3 py-2">{row.os}</td>
                      <td className="px-3 py-2 font-mono text-xs">{row.ip || '—'}</td>
                      <td className="px-3 py-2">{row.country || '—'}</td>
                      <td className="px-3 py-2">{row.city || '—'}</td>
                      <td className="px-3 py-2">{row.language || '—'}</td>
                    </tr>
                  ))
                ) : (
                  sessions.map((s) => (
                    <tr
                      key={s.id}
                      className="cursor-pointer border-b border-zinc-50 hover:bg-orange-50/50"
                      onClick={() => void openSession(s.id)}
                    >
                      <td className="whitespace-nowrap px-3 py-2">{fmtTime(s.lastSeenAt)}</td>
                      <td className="px-3 py-2">
                        {s.userName ?? s.userEmail ?? 'Anonymní'}
                      </td>
                      <td className="max-w-[140px] truncate px-3 py-2">{s.currentPath || '—'}</td>
                      <td className="max-w-[120px] truncate px-3 py-2">{s.currentTitle || '—'}</td>
                      <td className="px-3 py-2">—</td>
                      <td className="max-w-[120px] truncate px-3 py-2">{s.referrer || '—'}</td>
                      <td className="px-3 py-2">{s.deviceType}</td>
                      <td className="px-3 py-2">{s.browser}</td>
                      <td className="px-3 py-2">{s.os}</td>
                      <td className="px-3 py-2 font-mono text-xs">{s.ip || '—'}</td>
                      <td className="px-3 py-2">{s.country || '—'}</td>
                      <td className="px-3 py-2">{s.city || '—'}</td>
                      <td className="px-3 py-2">{s.language || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {section === 'prehled' && settings ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-zinc-800">Nastavení analytiky (GDPR)</h2>
          <div className="mt-4 space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.trackingEnabled}
                onChange={(e) => void saveSettings({ trackingEnabled: e.target.checked })}
              />
              Sledování návštěvnosti zapnuto
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.anonymizeIp}
                onChange={(e) => void saveSettings({ anonymizeIp: e.target.checked })}
              />
              Anonymizovat IP adresy při ukládání
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.excludeStaff}
                onChange={(e) => void saveSettings({ excludeStaff: e.target.checked })}
              />
              Nevyhledávat administrátory a pracovníky portálu
            </label>
          </div>
        </div>
      ) : null}

      {selectedSession ? (
        <SessionDetailPanel detail={selectedSession} onClose={() => setSelectedSession(null)} />
      ) : null}
    </div>
  );
}
