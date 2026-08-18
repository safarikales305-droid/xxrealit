import { CompanyImportJobStatus } from '@prisma/client';

export type JobProgressView = {
  processed: number;
  total: number | null;
  percentage: number;
  label: string;
  etaSeconds: number | null;
};

export type PartitionProgressView = {
  overallPercent: number;
  overallLabel: string;
  partitionPercent: number;
  partitionLabel: string;
  completedPartitions: number;
  totalPartitions: number;
  currentPartitionProcessed: number;
  currentPartitionTotal: number | null;
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
    label: total != null ? `${processed} / ${total} firem` : `${processed} firem zpracováno`,
    etaSeconds,
  };
}

export function computePartitionBasedProgress(input: {
  completedPartitions: number;
  totalPartitions: number;
  currentPartitionCursor: number;
  currentPartitionTotal: number | null;
  overallProcessed: number;
  jobStatus: CompanyImportJobStatus | string;
  isComplete: boolean;
}): PartitionProgressView {
  const {
    completedPartitions,
    totalPartitions,
    currentPartitionCursor,
    currentPartitionTotal,
    overallProcessed,
    jobStatus,
    isComplete,
  } = input;

  if (isComplete || jobStatus === 'COMPLETED') {
    return {
      overallPercent: 100,
      overallLabel: `${overallProcessed} firem zpracováno`,
      partitionPercent: 100,
      partitionLabel: 'Dokončeno',
      completedPartitions: totalPartitions,
      totalPartitions,
      currentPartitionProcessed: currentPartitionTotal ?? 0,
      currentPartitionTotal,
    };
  }

  if (jobStatus === 'CANCELLED' || jobStatus === 'STOPPED') {
    const pct =
      totalPartitions > 0
        ? Math.min(99, Math.round((completedPartitions / totalPartitions) * 100))
        : 0;
    return {
      overallPercent: pct,
      overallLabel: `${overallProcessed} firem · import ukončen`,
      partitionPercent: 0,
      partitionLabel: 'Zastaveno',
      completedPartitions,
      totalPartitions,
      currentPartitionProcessed: currentPartitionCursor,
      currentPartitionTotal,
    };
  }

  if (jobStatus === 'FAILED') {
    const pct =
      totalPartitions > 0
        ? Math.min(99, Math.round((completedPartitions / totalPartitions) * 100))
        : 0;
    return {
      overallPercent: pct,
      overallLabel: `${overallProcessed} firem · chyba importu`,
      partitionPercent: 0,
      partitionLabel: 'Chyba',
      completedPartitions,
      totalPartitions,
      currentPartitionProcessed: currentPartitionCursor,
      currentPartitionTotal,
    };
  }

  let overallPercent = 0;
  if (totalPartitions > 0) {
    const base = (completedPartitions / totalPartitions) * 100;
    let currentSlice = 0;
    if (currentPartitionTotal != null && currentPartitionTotal > 0) {
      const capped = Math.min(currentPartitionTotal, 1000);
      currentSlice = (currentPartitionCursor / capped) * (100 / totalPartitions);
    }
    overallPercent = Math.min(99, Math.max(0, Math.round(base + currentSlice)));
  }

  const partitionPercent =
    currentPartitionTotal != null && currentPartitionTotal > 0
      ? Math.min(
          100,
          Math.round(
            (currentPartitionCursor / Math.min(currentPartitionTotal, 1000)) * 100,
          ),
        )
      : completedPartitions < totalPartitions
        ? 0
        : 100;

  return {
    overallPercent,
    overallLabel: `${overallProcessed} firem · ${completedPartitions}/${totalPartitions} partitionů`,
    partitionPercent,
    partitionLabel:
      currentPartitionTotal != null
        ? `${currentPartitionCursor} / ${Math.min(currentPartitionTotal, 1000)}`
        : 'Čeká',
    completedPartitions,
    totalPartitions,
    currentPartitionProcessed: currentPartitionCursor,
    currentPartitionTotal,
  };
}

export function progressBarColor(
  status: CompanyImportJobStatus | string,
): string {
  switch (status) {
    case 'RUNNING':
    case 'PAUSE_REQUESTED':
    case 'CANCEL_REQUESTED':
      return 'bg-orange-500';
    case 'PAUSED':
    case 'STOPPED':
      return 'bg-amber-400';
    case 'COMPLETED':
      return 'bg-emerald-500';
    case 'FAILED':
      return 'bg-red-500';
    case 'CANCELLED':
      return 'bg-zinc-500';
    default:
      return 'bg-zinc-400';
  }
}
