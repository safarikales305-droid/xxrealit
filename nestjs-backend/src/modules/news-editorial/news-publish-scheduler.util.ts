import { parsePublishTimeSlot } from './news-editorial.util';

const PRAGUE_TZ = 'Europe/Prague';

export type PragueSlot = {
  hour: number;
  minute: number;
  label: string;
};

export function getPragueParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
} {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: PRAGUE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    weekday: 0,
  };
}

export function parsePublishSlots(slots: string[]): PragueSlot[] {
  return slots
    .map((slot) => {
      const parsed = parsePublishTimeSlot(slot);
      if (!parsed) return null;
      return { ...parsed, label: slot.trim() };
    })
    .filter((x): x is PragueSlot => x != null)
    .sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

export function minutesSinceMidnightPrague(date = new Date()): number {
  const p = getPragueParts(date);
  return p.hour * 60 + p.minute;
}

export function isWithinPublishWindow(
  slots: string[],
  now = new Date(),
  windowMinutes = 20,
): { due: boolean; slot: PragueSlot | null } {
  const parsed = parsePublishSlots(slots);
  if (!parsed.length) return { due: true, slot: null };

  const nowMin = minutesSinceMidnightPrague(now);
  for (const slot of parsed) {
    const slotMin = slot.hour * 60 + slot.minute;
    if (nowMin >= slotMin && nowMin <= slotMin + windowMinutes) {
      return { due: true, slot };
    }
  }
  return { due: false, slot: null };
}

export function nextPublishSlotLabel(slots: string[], now = new Date()): string | null {
  const parsed = parsePublishSlots(slots);
  if (!parsed.length) return null;
  const nowMin = minutesSinceMidnightPrague(now);
  const upcoming = parsed.find((s) => s.hour * 60 + s.minute > nowMin);
  return upcoming?.label ?? parsed[0]?.label ?? null;
}

export function pragueDayKey(date = new Date()): string {
  const p = getPragueParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}
