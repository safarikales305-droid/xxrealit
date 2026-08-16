import { CompanyImportJobStatus, CompanyProviderJobStatus } from '@prisma/client';

export type JobProgressView = {
  processed: number;
  total: number | null;
  percentage: number;
  label: string;
  etaSeconds: number | null;
};

export function computeJobProgress(
  processed: number,
  totalExpected: number | null | undefined,
  startedAt: Date | null | undefined,
): JobProgressView {
  const total =
    totalExpected != null && totalExpected > 0 ? totalExpected : null;
  const percentage =
    total != null
      ? Math.min(100, Math.max(0, Math.round((processed / total) * 100)))
      : processed > 0
        ? 0
        : 0;

  let etaSeconds: number | null = null;
  if (total != null && startedAt && processed > 0 && processed < total) {
    const elapsedMs = Date.now() - startedAt.getTime();
    const perItem = elapsedMs / processed;
    etaSeconds = Math.round(((total - processed) * perItem) / 1000);
  }

  return {
    processed,
    total,
    percentage,
    label: total != null ? `${processed} / ${total} firem` : `${processed} zpracováno`,
    etaSeconds,
  };
}

export function progressBarColor(
  status: CompanyImportJobStatus | CompanyProviderJobStatus,
): string {
  switch (status) {
    case 'RUNNING':
      return 'bg-orange-500';
    case 'PAUSED':
      return 'bg-amber-400';
    case 'COMPLETED':
      return 'bg-emerald-500';
    case 'FAILED':
      return 'bg-red-500';
    default:
      return 'bg-zinc-400';
  }
}
