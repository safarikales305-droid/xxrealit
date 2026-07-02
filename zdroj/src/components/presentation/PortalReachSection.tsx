'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  formatPortalStatValue,
  type OPortaluMonthlyPoint,
  type OPortaluPublicPayload,
} from '@/lib/o-portalu-public';
import { formatRolesLabel } from '@/lib/o-portalu-admin-api';

type Props = {
  data: OPortaluPublicPayload;
};

type ChartSeries = {
  key: keyof Pick<OPortaluMonthlyPoint, 'visits' | 'views' | 'socialReach' | 'leads'>;
  label: string;
  color: string;
};

const CHART_SERIES: ChartSeries[] = [
  { key: 'visits', label: 'Návštěvnost', color: '#ff6a00' },
  { key: 'views', label: 'Shlédnutí', color: '#2563eb' },
  { key: 'socialReach', label: 'Sociální dosah', color: '#7c3aed' },
  { key: 'leads', label: 'Leady', color: '#059669' },
];

function PortalGrowthChart({ points }: { points: OPortaluMonthlyPoint[] }) {
  const width = 720;
  const height = 280;
  const pad = { top: 24, right: 16, bottom: 48, left: 56 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;

  const maxValue = useMemo(() => {
    let max = 1;
    for (const p of points) {
      for (const s of CHART_SERIES) {
        max = Math.max(max, p[s.key]);
      }
    }
    return max;
  }, [points]);

  const xStep = points.length <= 1 ? innerW : innerW / (points.length - 1);

  const y = (value: number) => pad.top + innerH - (value / maxValue) * innerH;
  const x = (index: number) => pad.left + index * xStep;

  const linePath = (key: ChartSeries['key']) =>
    points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p[key]).toFixed(1)}`)
      .join(' ');

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="min-w-[320px] w-full max-w-3xl"
        role="img"
        aria-label="Graf vývoje portálu po měsících"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const yy = pad.top + innerH * (1 - t);
          const val = Math.round(maxValue * t);
          return (
            <g key={t}>
              <line
                x1={pad.left}
                x2={width - pad.right}
                y1={yy}
                y2={yy}
                stroke="#e4e4e7"
                strokeDasharray="4 4"
              />
              <text x={8} y={yy + 4} className="fill-zinc-400 text-[10px]">
                {formatPortalStatValue(val)}
              </text>
            </g>
          );
        })}
        {CHART_SERIES.map((s) => (
          <path
            key={s.key}
            d={linePath(s.key)}
            fill="none"
            stroke={s.color}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {points.map((p, i) => (
          <text
            key={p.month}
            x={x(i)}
            y={height - 12}
            textAnchor="middle"
            className="fill-zinc-500 text-[10px] sm:text-[11px]"
          >
            {p.label.replace(/^\w/, (c) => c.toUpperCase())}
          </text>
        ))}
      </svg>
      <ul className="mt-4 flex flex-wrap gap-4 text-xs text-zinc-600">
        {CHART_SERIES.map((s) => (
          <li key={s.key} className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PortalReachSection({ data }: Props) {
  const chartPoints = data.chartMode === 'monthly' ? data.monthly : data.summaryChart;
  const socialStats = data.stats.filter((s) => s.category === 'social');
  const coreStats = data.stats.filter((s) => s.category !== 'social');

  return (
    <>
      <section id="dosah-portalu" className="scroll-mt-24 bg-gradient-to-b from-zinc-50 to-white py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#ff6a00]">XXrealit</p>
            <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl lg:text-5xl">
              {data.title}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base text-zinc-600 sm:text-lg">
              Aktuální výkon portálu v číslech — návštěvnost, shlédnutí, sociální sítě a leady.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {coreStats.map((stat) => (
              <article
                key={stat.key}
                className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <p className="text-2xl">{stat.icon ?? '📊'}</p>
                <p className="mt-3 text-2xl font-extrabold text-zinc-900 sm:text-3xl">
                  {formatPortalStatValue(stat.value)}
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-600">{stat.label}</p>
              </article>
            ))}
          </div>

          {socialStats.length > 0 ? (
            <div className="mt-14">
              <h3 className="text-center text-xl font-bold text-zinc-900">Sociální sítě</h3>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {socialStats.map((stat) => (
                  <article
                    key={stat.key}
                    className="rounded-2xl border border-orange-100 bg-orange-50/60 p-5 text-center"
                  >
                    <p className="text-3xl">{stat.icon}</p>
                    <p className="mt-2 text-2xl font-extrabold text-[#e85d00]">
                      {formatPortalStatValue(stat.value)}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-700">{stat.label}</p>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          {chartPoints.length > 0 ? (
            <div className="mt-14 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-8">
              <h3 className="text-lg font-bold text-zinc-900 sm:text-xl">Vývoj po měsících</h3>
              <p className="mt-1 text-sm text-zinc-500">
                {data.chartMode === 'monthly'
                  ? 'Návštěvnost, shlédnutí, sociální dosah a leady v čase.'
                  : 'Souhrnný přehled z aktuálních hodnot portálu.'}
              </p>
              <div className="mt-8">
                <PortalGrowthChart points={chartPoints} />
              </div>
            </div>
          ) : null}

          <div className="mt-12 flex flex-wrap justify-center gap-3">
            <Link
              href="/registrace"
              className="rounded-full bg-[#ff6a00] px-8 py-3.5 text-sm font-bold text-white shadow-lg transition hover:bg-[#e85d00]"
            >
              Registrovat zdarma
            </Link>
            <Link
              href="/inzerat/pridat"
              className="rounded-full border-2 border-zinc-300 bg-white px-8 py-3.5 text-sm font-bold text-zinc-800 transition hover:border-[#ff6a00] hover:text-[#ff6a00]"
            >
              Přidat inzerát
            </Link>
          </div>
        </div>
      </section>

      {data.leadPrices.length > 0 ? (
        <section id="cenik-leadu" className="scroll-mt-24 bg-white py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900 sm:text-4xl">
                Ceník kontaktů a leadů
              </h2>
              <p className="mx-auto mt-4 max-w-3xl text-base leading-relaxed text-zinc-600">
                Na XXrealit můžete inzerovat zdarma. Platíte až ve chvíli, kdy získáte reálný kontakt
                nebo lead podle aktuálního ceníku.
              </p>
            </div>

            <div className="mt-12 grid gap-4 lg:grid-cols-2">
              {data.leadPrices.map((lead) => (
                <article
                  key={lead.id}
                  className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/50 p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h3 className="text-lg font-bold text-zinc-900">{lead.title}</h3>
                    <div className="text-right">
                      <p className="text-2xl font-extrabold text-[#ff6a00]">
                        {lead.priceCzk.toLocaleString('cs-CZ')} Kč
                      </p>
                      <p className="text-xs font-medium text-zinc-500">
                        {lead.priceCredits.toLocaleString('cs-CZ')} kreditů
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-600">{lead.description}</p>
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white px-3 py-1 font-semibold text-zinc-700 ring-1 ring-zinc-200">
                      {formatRolesLabel(lead.appliesToRoles)}
                    </span>
                    {lead.billedToLabel ? (
                      <span className="rounded-full bg-orange-50 px-3 py-1 font-semibold text-[#c2410c] ring-1 ring-orange-100">
                        Účtuje se: {lead.billedToLabel}
                      </span>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
