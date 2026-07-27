import { PRAGUE_TIMEZONE } from '../whatsapp/whatsapp-prague-time.util';

export type AiSalesSendWindowSettings = {
  enforceSendWindow: boolean;
  sendWindowStartHour: number;
  sendWindowEndHour: number;
  sendOnWeekends: boolean;
  sendWindowDaysJson?: unknown;
  allowAdminManualSendAnytime?: boolean;
  allowTestEmailOutsideWindow?: boolean;
  ignoreWindowOnManualSend?: boolean;
  timezone?: string;
};

export type SendWindowCheck = {
  allowed: boolean;
  currentTime: string;
  allowedInterval: string;
  allowedDays: string;
  nextSendAt: Date | null;
  nextSendAtLabel: string | null;
};

const DAY_LABELS = ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'];

const PRAGUE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRAGUE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function readPragueParts(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = PRAGUE_FORMATTER.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function getPragueWeekday(date: Date): number {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: PRAGUE_TIMEZONE, weekday: 'short' }).format(date);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

export function resolveSendWindowDays(settings: AiSalesSendWindowSettings): number[] {
  const raw = settings.sendWindowDaysJson;
  if (Array.isArray(raw) && raw.length) {
    return raw.map((d) => Number(d)).filter((d) => d >= 0 && d <= 6);
  }
  if (settings.sendOnWeekends) return [0, 1, 2, 3, 4, 5, 6];
  return [1, 2, 3, 4, 5];
}

export function formatAllowedDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return 'Po–Ne';
  if (sorted.join(',') === '1,2,3,4,5') return 'Po–Pá';
  return sorted.map((d) => DAY_LABELS[d]?.slice(0, 2) ?? String(d)).join(', ');
}

export function formatHour(hour: number): string {
  return `${pad2(hour)}:00`;
}

export function getPragueDateParts(date = new Date()) {
  return readPragueParts(date);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function checkSendWindow(settings: AiSalesSendWindowSettings, at = new Date()): SendWindowCheck {
  const parts = getPragueDateParts(at);
  const day = getPragueWeekday(at);
  const allowedDays = resolveSendWindowDays(settings);
  const currentTime = `${pad2(parts.hour)}:${pad2(parts.minute)} (${PRAGUE_TIMEZONE})`;
  const allowedInterval = `${formatHour(settings.sendWindowStartHour)}–${formatHour(settings.sendWindowEndHour)}`;
  const allowedDaysLabel = formatAllowedDays(allowedDays);

  if (!settings.enforceSendWindow) {
    return {
      allowed: true,
      currentTime,
      allowedInterval,
      allowedDays: allowedDaysLabel,
      nextSendAt: null,
      nextSendAtLabel: null,
    };
  }

  const dayAllowed = allowedDays.includes(day);
  const hourAllowed =
    parts.hour >= settings.sendWindowStartHour && parts.hour < settings.sendWindowEndHour;
  const allowed = dayAllowed && hourAllowed;

  const nextSendAt = allowed ? null : computeNextSendAt(settings, at);
  return {
    allowed,
    currentTime,
    allowedInterval,
    allowedDays: allowedDaysLabel,
    nextSendAt,
    nextSendAtLabel: nextSendAt ? formatPragueDateTime(nextSendAt) : null,
  };
}

export function formatPragueDateTime(date: Date): string {
  const p = getPragueDateParts(date);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)} (${PRAGUE_TIMEZONE})`;
}

export function computeNextSendAt(settings: AiSalesSendWindowSettings, from = new Date()): Date {
  const allowedDays = resolveSendWindowDays(settings);
  const cursor = new Date(from.getTime());

  for (let i = 0; i < 14 * 24; i++) {
    const parts = getPragueDateParts(cursor);
    const day = getPragueWeekday(cursor);
    if (!allowedDays.includes(day)) {
      cursor.setTime(cursor.getTime() + 60 * 60_000);
      continue;
    }
    if (parts.hour < settings.sendWindowStartHour) {
      return buildPragueDateTime(parts.year, parts.month, parts.day, settings.sendWindowStartHour, 0);
    }
    if (parts.hour >= settings.sendWindowEndHour) {
      cursor.setTime(cursor.getTime() + 60 * 60_000);
      continue;
    }
    return cursor;
  }

  const p = getPragueDateParts(from);
  return buildPragueDateTime(p.year, p.month, p.day, settings.sendWindowStartHour, 0);
}

function buildPragueDateTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour - 1, minute, 0));
  for (let i = 0; i < 12; i++) {
    const p = getPragueDateParts(guess);
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
      return guess;
    }
    const diffMinutes =
      (year - p.year) * 525_600 +
      (month - p.month) * 43_200 +
      (day - p.day) * 1_440 +
      (hour - p.hour) * 60 +
      (minute - p.minute);
    guess.setTime(guess.getTime() + diffMinutes * 60_000);
  }
  return guess;
}

export function shouldBypassSendWindow(
  settings: AiSalesSendWindowSettings,
  opts: { manual?: boolean; test?: boolean; automatic?: boolean },
): boolean {
  if (opts.test && settings.allowTestEmailOutsideWindow !== false) return true;
  if (!settings.enforceSendWindow) return true;
  if (opts.manual) {
    if (settings.ignoreWindowOnManualSend !== false) return true;
    if (settings.allowAdminManualSendAnytime !== false) return true;
  }
  if (opts.automatic) return false;
  return false;
}
