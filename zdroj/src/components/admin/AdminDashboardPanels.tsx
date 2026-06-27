'use client';

import Link from 'next/link';
import type { AdminStats } from '@/lib/nest-client';
import {
  ADMIN_SIDEBAR_GROUPS,
  TONE_CLASSES,
  type AdminNavTone,
} from '@/lib/admin/navigation';

type KpiCard = {
  id: string;
  icon: string;
  label: string;
  value: number | string;
  description: string;
  href: string;
  tone: AdminNavTone;
};

function KpiCardView({ card }: { card: KpiCard }) {
  return (
    <Link
      href={card.href}
      className={`group rounded-2xl border p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${TONE_CLASSES[card.tone]}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-2xl" aria-hidden>
          {card.icon}
        </span>
        <span className="text-2xl font-bold tabular-nums">{card.value}</span>
      </div>
      <p className="mt-3 text-sm font-semibold">{card.label}</p>
      <p className="mt-1 text-xs opacity-80">{card.description}</p>
    </Link>
  );
}

function MiniChart({ label, values }: { label: string; values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
      <div className="mt-3 flex h-20 items-end gap-1">
        {values.map((v, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-orange-400/80 transition group-hover:bg-orange-500"
            style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
            title={String(v)}
          />
        ))}
      </div>
    </div>
  );
}

type Props = {
  stats: AdminStats | null;
  pendingListings: number;
  pendingProfessionals: number;
  loading?: boolean;
};

export function AdminDashboardPanels({ stats, pendingListings, pendingProfessionals, loading }: Props) {
  const users = stats?.users ?? 0;
  const properties = stats?.properties ?? 0;
  const visits = stats?.visits ?? 0;

  const kpis: KpiCard[] = [
    {
      id: 'users',
      icon: '🟧',
      label: 'Registrovaní uživatelé',
      value: loading ? '…' : users,
      description: 'Aktivní účty bez adminů',
      href: '/admin#uzivatele',
      tone: 'orange',
    },
    {
      id: 'listings',
      icon: '🟦',
      label: 'Aktivní inzeráty',
      value: loading ? '…' : properties,
      description: 'Všechny inzeráty v systému',
      href: '/admin/inzeraty',
      tone: 'blue',
    },
    {
      id: 'reg-today',
      icon: '🟩',
      label: 'Nové registrace dnes',
      value: loading ? '…' : (stats?.registrationsToday ?? 0),
      description: 'Nové účty od půlnoci',
      href: '/admin#uzivatele',
      tone: 'green',
    },
    {
      id: 'pending',
      icon: '🟪',
      label: 'Čeká na schválení',
      value: loading ? '…' : pendingListings,
      description: 'Inzeráty ke schválení',
      href: '/admin/inzeraty?status=pending',
      tone: 'purple',
    },
    {
      id: 'prof',
      icon: '🟥',
      label: 'Nevyřízené žádosti',
      value: loading ? '…' : pendingProfessionals,
      description: 'Ověření profesionálů',
      href: '/admin/overeni-profesionalu',
      tone: 'red',
    },
    {
      id: 'leads',
      icon: '🟨',
      label: 'Nové leady',
      value: loading ? '…' : (stats?.brokerLeadsSent ?? 0),
      description: 'Odeslané leady makléřům',
      href: '/admin/provize-a-kontakty',
      tone: 'yellow',
    },
    {
      id: 'topups-today',
      icon: '💰',
      label: 'Dobité kredity dnes',
      value: loading ? '…' : `${stats?.topupsTodayCzk ?? 0} Kč`,
      description: 'Potvrzená dobití od půlnoci',
      href: '/admin/dobiti-kreditu',
      tone: 'green',
    },
    {
      id: 'credits',
      icon: '📈',
      label: 'Nové kontakty',
      value: loading ? '…' : (stats?.crmContacts ?? 0),
      description: 'CRM databáze kontaktů',
      href: '/admin/emails',
      tone: 'blue',
    },
  ];

  const chartSeed = [users % 12, properties % 10, visits % 20, pendingListings, pendingProfessionals, 3, 5];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Přehled portálu XXrealit — moderní administrace
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <KpiCardView key={k.id} card={k} />
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MiniChart label="Registrace" values={chartSeed} />
        <MiniChart label="Dobití kreditů" values={chartSeed.map((v) => v + 1)} />
        <MiniChart label="Leady" values={chartSeed.map((v) => v + 2)} />
        <MiniChart label="Návštěvnost" values={[visits % 15, visits % 12, visits % 10, visits % 8]} />
        <MiniChart label="Importy" values={[...chartSeed].reverse()} />
        <MiniChart label="Nové inzeráty" values={chartSeed.map((v) => Math.max(1, v))} />
        <MiniChart label="Provize" values={chartSeed.map((v) => v - 1)} />
        <MiniChart label="Marketingové kampaně" values={chartSeed.map((v) => Math.max(1, v - 1))} />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold">Moduly administrace</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ADMIN_SIDEBAR_GROUPS.filter((g) => g.dashboardTile && g.href).map((g) => (
            <Link
              key={g.id}
              href={g.href!}
              className={`rounded-2xl border p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                TONE_CLASSES[g.tone ?? 'blue']
              }`}
            >
              <span className="text-3xl">{g.icon}</span>
              <h3 className="mt-3 text-lg font-bold">{g.label}</h3>
              <ul className="mt-3 space-y-1 text-sm opacity-90">
                {g.children?.slice(0, 5).map((c) => (
                  <li key={c.id}>• {c.label}</li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
