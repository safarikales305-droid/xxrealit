'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import {
  bonusCampaignHref,
  nestFetchActiveBonusCampaignsForMe,
  type UserBonusCampaign,
} from '@/lib/marketing-bonus';

export function ActiveBonusCampaigns() {
  const { apiAccessToken, isAuthenticated } = useAuth();
  const [campaigns, setCampaigns] = useState<UserBonusCampaign[]>([]);

  useEffect(() => {
    if (!isAuthenticated || !apiAccessToken) return;
    void nestFetchActiveBonusCampaignsForMe(apiAccessToken).then(setCampaigns);
  }, [isAuthenticated, apiAccessToken]);

  if (!campaigns.length) return null;

  return (
    <section className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50 to-orange-50 p-4 shadow-sm">
      <h2 className="text-base font-bold text-zinc-900">🎁 Aktivní bonusové akce</h2>
      <ul className="mt-3 space-y-2">
        {campaigns.map((c) => (
          <li key={c.id}>
            <Link
              href={bonusCampaignHref(c.actionType)}
              className="block rounded-xl border border-white/80 bg-white/90 px-4 py-3 transition hover:border-orange-200 hover:shadow-sm"
            >
              <p className="text-sm font-semibold text-zinc-900">
                Dostaneš {c.amount.toLocaleString('cs-CZ')} Kč kreditů — {c.title}
              </p>
              <p className="mt-1 text-xs text-zinc-600">
                {c.bonusText || c.description || 'Splňte podmínku a získejte bonus.'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
