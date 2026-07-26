const SENSITIVE_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._-]+/gi,
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  /\b\d{6}\/?\d{4}\b/g,
  /password\s*[:=]\s*\S+/gi,
  /heslo\s*[:=]\s*\S+/gi,
];

export function sanitizeUserInput(text: string, maxLength = 2000): string {
  let safe = text.trim().slice(0, maxLength);
  for (const pattern of SENSITIVE_PATTERNS) {
    safe = safe.replace(pattern, '[ODSTRANĚNO]');
  }
  return safe;
}

export function stripHtml(text: string): string {
  return text.replace(/<[^>]*>/g, '').trim();
}

export function containsPromptInjection(text: string): boolean {
  const lower = text.toLowerCase();
  const blocked = [
    'system prompt',
    'systémový prompt',
    'api klíč',
    'api key',
    'openai',
    'ignore previous',
    'ignoruj předchozí',
    'reveal your instructions',
    'ukaž instrukce',
  ];
  return blocked.some((b) => lower.includes(b));
}
