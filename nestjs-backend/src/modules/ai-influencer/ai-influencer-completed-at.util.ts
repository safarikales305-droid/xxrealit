export type CompletedAtJobFields = {
  renderedAt?: Date | string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  createdAt: Date | string;
};

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Canonical completion timestamp: renderedAt preferred, safe fallbacks for legacy rows. */
export function resolveCompletedAt(job: CompletedAtJobFields): Date {
  return (
    toDate(job.renderedAt) ??
    toDate(job.publishedAt) ??
    toDate(job.updatedAt) ??
    toDate(job.createdAt) ??
    new Date()
  );
}

export function resolveCompletedAtIso(job: CompletedAtJobFields): string {
  return resolveCompletedAt(job).toISOString();
}

export function isCompletedOnDay(job: CompletedAtJobFields, dayStart: Date): boolean {
  return resolveCompletedAt(job) >= dayStart;
}
