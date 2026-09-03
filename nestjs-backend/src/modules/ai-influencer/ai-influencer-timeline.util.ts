export type TimelineEvent = {
  at: string;
  stage: string;
  message?: string;
};

export function appendTimelineEvent(
  existing: unknown,
  stage: string,
  message?: string,
): TimelineEvent[] {
  const events = Array.isArray(existing) ? (existing as TimelineEvent[]) : [];
  return [
    ...events,
    { at: new Date().toISOString(), stage, message },
  ];
}
