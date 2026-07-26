import { AI_CHAT_ALLOWED_PROMPT_VARIABLES, AI_CHAT_VAGUE_RESPONSE_PATTERNS } from './ai-chat.constants';

const VARIABLE_RE = /\{\{(\w+)\}\}/g;

export function extractPromptVariables(content: string): string[] {
  const found = new Set<string>();
  for (const match of content.matchAll(VARIABLE_RE)) {
    found.add(match[1]);
  }
  return [...found];
}

export function validatePromptVariables(content: string): { valid: boolean; unknown: string[] } {
  const unknown = extractPromptVariables(content).filter(
    (v) => !AI_CHAT_ALLOWED_PROMPT_VARIABLES.includes(v as (typeof AI_CHAT_ALLOWED_PROMPT_VARIABLES)[number]),
  );
  return { valid: unknown.length === 0, unknown };
}

export function renderPromptTemplate(
  template: string,
  vars: Record<string, string | number | boolean | null | undefined>,
): string {
  return template.replace(VARIABLE_RE, (_, key: string) => {
    const val = vars[key];
    if (val === null || val === undefined) return '';
    return String(val);
  });
}

export function isVagueAiResponse(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length > 120) return false;
  return AI_CHAT_VAGUE_RESPONSE_PATTERNS.some((re) => re.test(trimmed));
}
