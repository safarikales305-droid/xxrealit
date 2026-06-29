'use client';

import { PortalWorkerPanelShell } from '@/components/portal-worker/portal-worker-panel-shell';
import { WorkerCooperationCancelButton } from '@/components/portal-worker/worker-cooperation-cancel-button';

export default function PortalWorkerPanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <PortalWorkerPanelShell>
      <div className="mb-6">
        <WorkerCooperationCancelButton />
      </div>
      {children}
    </PortalWorkerPanelShell>
  );
}
