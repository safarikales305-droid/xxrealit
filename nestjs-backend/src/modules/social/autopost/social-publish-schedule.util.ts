import { SocialPublishRepeatType } from '@prisma/client';

export const PRAGUE_TZ = 'Europe/Prague';

export function pragueDateKey(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: PRAGUE_TZ });
}

/** Aktuální čas zaokrouhlený na minutu (pro porovnání nextRunAt). */
export function pragueNowMinute(): Date {
  const now = new Date();
  now.setSeconds(0, 0);
  return now;
}

export function formatCountdown(target: Date, from = new Date()): string {
  const diffMs = target.getTime() - from.getTime();
  if (diffMs <= 0) return 'nyní';
  const totalMin = Math.floor(diffMs / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'}`);
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} min`);
  return parts.join(' ');
}

export type SchedulePlannerDisplayStatus =
  | 'WAITING'
  | 'PUBLISHED'
  | 'RUNNING'
  | 'REPEATING'
  | 'FAILED'
  | 'PAUSED';

export function resolveSchedulePlannerStatus(input: {
  enabled: boolean;
  repeatType: SocialPublishRepeatType;
  lastStatus?: string | null;
  queueStatus?: string | null;
  nextRunAt: Date;
}): SchedulePlannerDisplayStatus {
  if (input.queueStatus === 'PROCESSING') return 'RUNNING';
  if (!input.enabled) {
    if (
      input.lastStatus === 'SUCCESS' &&
      input.repeatType === SocialPublishRepeatType.NONE
    ) {
      return 'PUBLISHED';
    }
    return 'PAUSED';
  }
  if (input.lastStatus === 'FAILED') return 'FAILED';
  if (
    input.repeatType !== SocialPublishRepeatType.NONE &&
    input.enabled
  ) {
    return 'REPEATING';
  }
  return 'WAITING';
}

export function computeNextRunAt(
  repeatType: SocialPublishRepeatType,
  repeatIntervalDays: number | null | undefined,
  from: Date,
): Date | null {
  if (repeatType === SocialPublishRepeatType.NONE) return null;

  const next = new Date(from);
  switch (repeatType) {
    case SocialPublishRepeatType.DAILY:
      next.setDate(next.getDate() + 1);
      break;
    case SocialPublishRepeatType.WEEKLY:
      next.setDate(next.getDate() + 7);
      break;
    case SocialPublishRepeatType.BIWEEKLY:
      next.setDate(next.getDate() + 14);
      break;
    case SocialPublishRepeatType.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      break;
    case SocialPublishRepeatType.CUSTOM_DAYS:
      next.setDate(next.getDate() + Math.max(1, repeatIntervalDays ?? 1));
      break;
    default:
      return null;
  }
  return next;
}

export function shouldDisableSchedule(input: {
  runCount: number;
  maxRuns: number | null | undefined;
  repeatUntil: Date | null | undefined;
  nextRunAt: Date | null;
  repeatType: SocialPublishRepeatType;
}): boolean {
  if (input.repeatType === SocialPublishRepeatType.NONE) return true;
  if (input.maxRuns != null && input.runCount >= input.maxRuns) return true;
  if (input.repeatUntil && input.nextRunAt && input.nextRunAt > input.repeatUntil) return true;
  if (input.repeatUntil && !input.nextRunAt) return true;
  return false;
}

export type PropertyFacebookDisplayStatus =
  | 'NOT_PUBLISHED'
  | 'SCHEDULED'
  | 'PUBLISHED'
  | 'REPEAT_ACTIVE'
  | 'ERROR';

export function resolvePropertyFacebookStatus(input: {
  queueStatus?: string | null;
  scheduleEnabled?: boolean;
  scheduleRepeatType?: SocialPublishRepeatType | null;
  scheduleLastStatus?: string | null;
  hasPublishedLog?: boolean;
}): PropertyFacebookDisplayStatus {
  if (
    input.queueStatus === 'FAILED' ||
    input.scheduleLastStatus === 'FAILED'
  ) {
    return 'ERROR';
  }
  if (
    input.scheduleEnabled &&
    input.scheduleRepeatType &&
    input.scheduleRepeatType !== SocialPublishRepeatType.NONE
  ) {
    return 'REPEAT_ACTIVE';
  }
  if (
    input.scheduleEnabled ||
    input.queueStatus === 'PENDING' ||
    input.queueStatus === 'PROCESSING'
  ) {
    return 'SCHEDULED';
  }
  if (input.queueStatus === 'PUBLISHED' || input.hasPublishedLog) {
    return 'PUBLISHED';
  }
  return 'NOT_PUBLISHED';
}
