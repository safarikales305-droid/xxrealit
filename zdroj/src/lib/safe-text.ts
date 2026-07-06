export function safeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
    if (typeof obj.name === 'string' && obj.name.trim()) return obj.name;
    if (typeof obj.id === 'string' && obj.id.trim()) return obj.id;
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function safeDisplayValue(value: unknown, fallback = '—'): string {
  const text = safeText(value);
  return text.trim() ? text : fallback;
}

export function safeErrorMessage(error: unknown): string | null {
  if (error === null || error === undefined || error === '') return null;
  if (typeof error === 'string') return error.trim() || null;
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === 'string' && obj.message.trim()) return obj.message;
  }
  return null;
}

export function shouldShowErrorAsJson(error: unknown): boolean {
  if (error === null || error === undefined || error === '') return false;
  if (typeof error === 'string') return false;
  return safeErrorMessage(error) === null;
}
