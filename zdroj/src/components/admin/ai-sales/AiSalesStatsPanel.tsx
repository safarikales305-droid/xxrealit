'use client';

import { useEffect, useState } from 'react';
import { getAnalytics, getDashboard, type AiSalesApiError, type AiSalesDashboard } from '@/lib/ai-sales-admin-api';

type Props = { token: string; periodDays: number };

export function AiSalesStatsPanel({ token, periodDays }: Props) {
  const [dashboard, setDashboard] = useState<AiSalesDashboard | null>(null);
  const [analytics, setAnalytics] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [d, a] = await Promise.all([getDashboard(token, periodDays), getAnalytics(token, periodDays)]);
        if (!cancelled) {
          setDashboard(d);
          setAnalytics(a);
        }
      } catch (e) {
        if (!cancelled) {
          const err = e as Error & AiSalesApiError;
          setError(err.message ?? 'Načtení statistik selhalo.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [token, periodDays]);

  if (loading) return <p className="text-sm text-zinc-500">Načítám statistiky…</p>;
  if (error) {
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        {error}
      </div>
    );
  }
  if (!dashboard) return null;

  const byType = (analytics?.byPartnerType as Array<{ partnerType: string; _count: number }>) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Nalezeno ve vyhledávání" value={dashboard.foundInSearch} />
        <Stat label="Analyzováno" value={dashboard.analyzedProspects} />
        <Stat label="Průměrný fit score" value={dashboard.avgFitScore} />
        <Stat label="Čeká na schválení" value={dashboard.pendingApproval} />
        <Stat label="Odeslané e-maily (dnes)" value={dashboard.sentToday} />
        <Stat label="Odpovědi" value={dashboard.repliesToday} />
        <Stat label="Registrace / konverze" value={dashboard.conversions} />
        <Stat label="Aktivní partneři" value={dashboard.activePartners} />
        <Stat label="Nové kanceláře" value={dashboard.newAgencies} />
        <Stat label="Noví makléři" value={dashboard.newAgents} />
        <Stat label="Stavební firmy" value={dashboard.newConstruction} />
        <Stat label="Úspěšnost %" value={dashboard.conversionRate} />
      </div>
      <div className="rounded-2xl border bg-white p-4">
        <h3 className="font-semibold text-sm">Podle typu partnera</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {byType.map((row) => (
            <li key={row.partnerType} className="flex justify-between border-b border-zinc-100 py-1">
              <span>{row.partnerType}</span>
              <span className="font-medium">{row._count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xl font-bold">{value}</p>
      <p className="text-sm text-zinc-600">{label}</p>
    </div>
  );
}
