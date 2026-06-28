import { SocialPublishRepeatType } from '@prisma/client';

export function pragueDateKey(date: Date): string {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Europe/Prague' });
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
