import { BadRequestException } from '@nestjs/common';

export const PRAGUE_TIMEZONE = 'Europe/Prague';

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

/** Převede lokální datum/čas v Europe/Prague na UTC Date. */
export function parsePragueLocalDateTime(input: string): Date {
  const normalized = input.trim().replace(' ', 'T');
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    throw new BadRequestException('Zadejte platné datum a čas odeslání (Europe/Prague).');
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6] ?? 0);

  let utcMs = Date.UTC(year, month - 1, day, hour - 1, minute, second);
  for (let i = 0; i < 12; i++) {
    const p = readPragueParts(new Date(utcMs));
    if (
      p.year === year &&
      p.month === month &&
      p.day === day &&
      p.hour === hour &&
      p.minute === minute
    ) {
      return new Date(utcMs);
    }
    const diffMinutes =
      (year - p.year) * 525_600 +
      (month - p.month) * 43_200 +
      (day - p.day) * 1_440 +
      (hour - p.hour) * 60 +
      (minute - p.minute);
    utcMs += diffMinutes * 60_000;
  }

  throw new BadRequestException('Nepodařilo se převést datum do časové zóny Europe/Prague.');
}

export function parseScheduledAtInput(input: string): Date {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new BadRequestException('Zadejte datum a čas odeslání.');
  }
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Neplatné datum a čas odeslání.');
    }
    return parsed;
  }
  return parsePragueLocalDateTime(trimmed);
}

export function formatPragueDateTime(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat('cs-CZ', {
    timeZone: PRAGUE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
}

export function utcIsoToPragueDatetimeLocal(iso: string): string {
  const value = new Date(iso);
  if (Number.isNaN(value.getTime())) return '';
  const formatted = new Intl.DateTimeFormat('sv-SE', {
    timeZone: PRAGUE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(value);
  return formatted.replace(' ', 'T').slice(0, 16);
}
