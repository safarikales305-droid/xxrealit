'use client';

import { use } from 'react';
import { PortalWorkerCrmPanel } from '@/components/portal-worker/portal-worker-crm-panel';

export default function PortalWorkerClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return <PortalWorkerCrmPanel section="client-detail" clientId={id} />;
}
