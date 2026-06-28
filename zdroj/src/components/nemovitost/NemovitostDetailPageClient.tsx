'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { NemovitostDetailView } from '@/components/nemovitost/NemovitostDetailView';
import { PropertyDetailFetchError } from '@/app/nemovitost/[id]/fetch-error';
import { useAuth } from '@/hooks/use-auth';
import { useGuestRegistrationGate } from '@/hooks/use-guest-registration-gate';
import { nestFetchPropertyDetail } from '@/lib/nest-client';
import {
  normalizePropertyDetailPayload,
  type PropertyDetailAuthor,
} from '@/lib/property-detail';
import type { PropertyFeedItem } from '@/types/property';

const DETAIL_FETCH_TIMEOUT_MS = 15_000;

function pickExtraFields(rawProp: unknown): Record<string, unknown> {
  if (!rawProp || typeof rawProp !== 'object') return {};
  const o = rawProp as Record<string, unknown>;
  const keys = [
    'area',
    'landArea',
    'floor',
    'totalFloors',
    'propertyType',
    'propertyTypeLabel',
    'offerType',
    'type',
    'condition',
    'energyLabel',
    'ownership',
    'construction',
    'parking',
    'cellar',
    'subType',
    'equipment',
    'currency',
    'viewsCount',
    'likeCount',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (o[k] !== undefined) out[k] = o[k];
  }
  return out;
}

type ReadyState = {
  property: PropertyFeedItem;
  author: PropertyDetailAuthor;
  extraFields: Record<string, unknown>;
};

export function NemovitostDetailPageClient({ propertyId }: { propertyId: string }) {
  const searchParams = useSearchParams();
  const { apiAccessToken } = useAuth();
  const { reportGuestListingViewed } = useGuestRegistrationGate();
  const tokenRef = useRef(apiAccessToken);
  tokenRef.current = apiAccessToken;

  const [ready, setReady] = useState<ReadyState | null>(null);
  const [other, setOther] = useState<PropertyFeedItem[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [errorStatus, setErrorStatus] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), DETAIL_FETCH_TIMEOUT_MS);

    setLoadState('loading');
    setReady(null);
    setOther([]);

    void (async () => {
      const result = await nestFetchPropertyDetail(propertyId, tokenRef.current, {
        includeOther: false,
        signal: controller.signal,
      });
      if (cancelled) return;

      if (!result.ok) {
        setErrorStatus(result.status || 502);
        setLoadState('error');
        return;
      }

      const parsed = normalizePropertyDetailPayload(result.data, {
        listingId: propertyId,
        devLog: process.env.NODE_ENV === 'development',
      });

      if (!parsed?.user || !parsed.property) {
        setErrorStatus(404);
        setLoadState('error');
        return;
      }

      const rawRoot =
        result.data && typeof result.data === 'object'
          ? (result.data as Record<string, unknown>)
          : {};
      const rawProperty = rawRoot.property ?? rawRoot.data;

      setReady({
        property: parsed.property,
        author: parsed.user,
        extraFields: pickExtraFields(rawProperty),
      });
      setLoadState('ready');
    })().catch(() => {
      if (cancelled) return;
      setErrorStatus(0);
      setLoadState('error');
    });

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [propertyId]);

  useEffect(() => {
    if (loadState !== 'ready') return;

    let cancelled = false;
    void (async () => {
      const result = await nestFetchPropertyDetail(propertyId, tokenRef.current, {
        includeOther: true,
      });
      if (cancelled || !result.ok) return;
      const parsed = normalizePropertyDetailPayload(result.data, { listingId: propertyId });
      if (parsed?.other?.length) setOther(parsed.other);
    })();

    return () => {
      cancelled = true;
    };
  }, [loadState, propertyId]);

  useEffect(() => {
    if (loadState !== 'ready') return;
    reportGuestListingViewed(propertyId);
  }, [loadState, propertyId, reportGuestListingViewed]);

  if (loadState === 'loading') {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <div className="xl:col-span-6">
            <div className="h-[42vh] animate-pulse rounded-2xl bg-zinc-200/80" />
            <div className="mt-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="h-7 w-3/4 animate-pulse rounded bg-zinc-200/80" />
              <div className="mt-3 h-5 w-1/3 animate-pulse rounded bg-zinc-200/80" />
              <div className="mt-4 space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-zinc-200/70" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-zinc-200/70" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === 'error' || !ready) {
    return (
      <PropertyDetailFetchError
        listingId={propertyId}
        status={errorStatus}
        source={searchParams.get('source') ?? searchParams.get('from')}
      />
    );
  }

  return (
    <NemovitostDetailView
      propertyId={propertyId}
      property={ready.property}
      author={ready.author}
      other={other}
      extraFields={ready.extraFields}
    />
  );
}
