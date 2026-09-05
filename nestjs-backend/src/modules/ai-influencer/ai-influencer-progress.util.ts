import { AiInfluencerReelJobStatus } from '@prisma/client';

export type ProgressMeta = {
  percent: number;
  step: string;
  stepKey: string;
};

export const RENDER_PROGRESS = {
  DOWNLOAD: { percent: 70, step: 'Stahuji video', stepKey: 'DOWNLOAD' },
  COMPOSITING: { percent: 80, step: 'Renderuji 1080×1920', stepKey: 'COMPOSITING' },
  BRANDING: { percent: 88, step: 'Přidávám titulky a XXREALIT branding', stepKey: 'BRANDING' },
  UPLOAD: { percent: 92, step: 'Nahrávám výsledné video', stepKey: 'UPLOAD' },
} as const;

const BASE: Record<string, ProgressMeta> = {
  PREP: { percent: 5, step: 'Připravuji článek', stepKey: 'PREP' },
  EVALUATING: { percent: 5, step: 'Připravuji článek', stepKey: 'EVALUATING' },
  CANDIDATE: { percent: 10, step: 'Vyhodnocení článku', stepKey: 'CANDIDATE' },
  SCRIPT_GENERATING: { percent: 15, step: 'Generuji scénář', stepKey: 'SCRIPT' },
  SCRIPT_READY: { percent: 15, step: 'Scénář připraven', stepKey: 'SCRIPT_READY' },
  VOICE_GENERATING: { percent: 25, step: 'Generuji hlas', stepKey: 'VOICE' },
  VOICE_READY: { percent: 25, step: 'Hlas připraven', stepKey: 'VOICE_READY' },
  AVATAR_GENERATING: { percent: 40, step: 'Vytvářím AI avatara', stepKey: 'HEYGEN_START' },
  AVATAR_READY: { percent: 55, step: 'HeyGen video hotové', stepKey: 'HEYGEN_DONE' },
  RENDERING: { percent: 80, step: 'Renderuji 1080×1920', stepKey: 'COMPOSITING' },
  VALIDATING: { percent: 93, step: 'Kontrola kvality', stepKey: 'VALIDATING' },
  UPLOADING: { percent: 92, step: 'Nahrávám výsledné video', stepKey: 'UPLOADING' },
  READY: { percent: 100, step: 'Hotovo', stepKey: 'READY' },
  PUBLISHING: { percent: 95, step: 'Publikuji', stepKey: 'PUBLISHING' },
  PUBLISHED: { percent: 100, step: 'Publikováno', stepKey: 'PUBLISHED' },
  PARTIALLY_PUBLISHED: { percent: 100, step: 'Částečně publikováno', stepKey: 'PARTIAL' },
  SKIPPED_QUALITY: { percent: 100, step: 'Nevybráno — nízké score', stepKey: 'SKIPPED_QUALITY' },
  SKIPPED_DUPLICATE: { percent: 100, step: 'Přeskočeno — duplicita', stepKey: 'SKIPPED_DUPLICATE' },
  FAILED: { percent: 0, step: 'Generování selhalo', stepKey: 'FAILED' },
};

export function progressForStatus(
  status: AiInfluencerReelJobStatus,
  avatarPollRatio?: number,
): ProgressMeta {
  if (status === AiInfluencerReelJobStatus.AVATAR_GENERATING && avatarPollRatio != null) {
    const ratio = Math.min(1, Math.max(0, avatarPollRatio));
    const percent = Math.round(40 + ratio * 15);
    return {
      percent,
      step: 'HeyGen zpracovává video',
      stepKey: 'HEYGEN_PROCESSING',
    };
  }
  return BASE[status] ?? { percent: 0, step: status, stepKey: status };
}

export const PIPELINE_STEPS = [
  { key: 'EVALUATING', label: 'Článek vyhodnocen' },
  { key: 'SCRIPT', label: 'Scénář vytvořen' },
  { key: 'VOICE', label: 'Hlas vytvořen' },
  { key: 'HEYGEN', label: 'Avatar se generuje' },
  { key: 'COMPOSITING', label: 'Rendering' },
  { key: 'VALIDATING', label: 'Kontrola' },
  { key: 'PUBLISHING', label: 'Publikování' },
] as const;

export function pipelineStepState(
  status: AiInfluencerReelJobStatus,
  stepKey: string,
): 'done' | 'active' | 'pending' {
  const order = ['EVALUATING', 'SCRIPT', 'VOICE', 'HEYGEN', 'COMPOSITING', 'VALIDATING', 'PUBLISHING'];
  const statusToIndex: Partial<Record<AiInfluencerReelJobStatus, number>> = {
    EVALUATING: 0,
    CANDIDATE: 0,
    SCRIPT_GENERATING: 1,
    SCRIPT_READY: 1,
    VOICE_GENERATING: 2,
    VOICE_READY: 2,
    AVATAR_GENERATING: 3,
    AVATAR_READY: 3,
    RENDERING: 4,
    READY: 5,
    PUBLISHING: 6,
    PUBLISHED: 7,
    PARTIALLY_PUBLISHED: 7,
  };
  const current = statusToIndex[status] ?? -1;
  const idx = order.indexOf(stepKey);
  if (idx < 0) return 'pending';
  if (current > idx) return 'done';
  if (current === idx) return 'active';
  return 'pending';
}

export const TRANSIENT_ERROR_PATTERNS =
  /429|rate.?limit|timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|502|503|504|temporary|temporarily/i;

export const AUTH_ERROR_PATTERNS = /401|403|AUTH_ERROR|invalid.?api|INVALID_API|scope|permission/i;

export function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
  return TRANSIENT_ERROR_PATTERNS.test(`${code} ${msg}`);
}

export function isAuthError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return AUTH_ERROR_PATTERNS.test(msg);
}

export function retryDelayMs(attempt: number): number {
  const delays = [10_000, 30_000, 90_000];
  return delays[Math.min(attempt - 1, delays.length - 1)] ?? 90_000;
}
