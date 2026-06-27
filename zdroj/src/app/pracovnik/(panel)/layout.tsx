'use client';

import { PortalWorkerPanelShell } from '@/components/portal-worker/portal-worker-panel-shell';

export default function PortalWorkerPanelLayout({ children }: { children: React.ReactNode }) {
  return <PortalWorkerPanelShell>{children}</PortalWorkerPanelShell>;
}
