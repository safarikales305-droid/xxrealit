'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  DEFAULT_BONUS_CTA,
  fetchActiveBonusCampaign,
  type PublicBonusCampaign,
} from '@/lib/bonus-campaign';

export function GuestShortsCta() {
  const [campaign, setCampaign] = useState<PublicBonusCampaign | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchActiveBonusCampaign().then((active) => {
      if (cancelled) return;
      setCampaign(active);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ctaText = campaign?.ctaText ?? DEFAULT_BONUS_CTA.ctaText;

  return (
    <div className="guest-shorts-cta-wrap pointer-events-auto">
      <Link href="/registrace" className="guest-shorts-cta">
        <span className="guest-shorts-cta__icon" aria-hidden>
          🎁
        </span>
        <span className="guest-shorts-cta__label">{ctaText}</span>
      </Link>
      {campaign?.bonusText ? (
        <p className="guest-shorts-cta-bonus">{campaign.bonusText}</p>
      ) : null}
    </div>
  );
}
