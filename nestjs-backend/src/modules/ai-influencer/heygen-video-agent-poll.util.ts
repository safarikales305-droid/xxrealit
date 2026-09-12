export type HeyGenNormalizedSessionStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'unknown';

const COMPLETED_STATUSES = new Set([
  'completed',
  'complete',
  'success',
  'succeeded',
  'finished',
  'done',
]);

const FAILED_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled']);

const QUEUED_STATUSES = new Set(['queued', 'pending', 'waiting', 'submitted']);

const PROCESSING_STATUSES = new Set([
  'processing',
  'generating',
  'running',
  'in_progress',
  'in progress',
  'rendering',
]);

export function normalizeHeyGenSessionStatus(status: string | null | undefined): HeyGenNormalizedSessionStatus {
  const normalized = String(status ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!normalized) return 'unknown';
  if (COMPLETED_STATUSES.has(normalized)) return 'completed';
  if (FAILED_STATUSES.has(normalized)) return 'failed';
  if (QUEUED_STATUSES.has(normalized)) return 'queued';
  if (PROCESSING_STATUSES.has(normalized)) return 'processing';
  return 'unknown';
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readUrlFromRecord(record: Record<string, unknown> | null | undefined): string | null {
  if (!record) return null;
  return (
    readString(record.video_url) ??
    readString(record.output_url) ??
    readString(record.url) ??
    readString(record.download_url) ??
    readString(record.videoUrl) ??
    readString(record.outputUrl)
  );
}

/** Extrahuje video URL z různých HeyGen session/video payload tvarů. */
export function extractHeyGenVideoUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;

  const direct = readUrlFromRecord(data) ?? readUrlFromRecord(root);
  if (direct) return direct;

  const nestedVideo =
    data.video && typeof data.video === 'object'
      ? (data.video as Record<string, unknown>)
      : root.video && typeof root.video === 'object'
        ? (root.video as Record<string, unknown>)
        : null;
  const nestedUrl = readUrlFromRecord(nestedVideo);
  if (nestedUrl) return nestedUrl;

  const result =
    data.result && typeof data.result === 'object'
      ? (data.result as Record<string, unknown>)
      : null;
  const resultUrl = readUrlFromRecord(result);
  if (resultUrl) return resultUrl;

  const listCandidates = [data.videos, data.video_list, root.videos, root.video_list];
  for (const candidate of listCandidates) {
    if (!Array.isArray(candidate) || candidate.length === 0) continue;
    const first = candidate[0];
    if (first && typeof first === 'object') {
      const listUrl = readUrlFromRecord(first as Record<string, unknown>);
      if (listUrl) return listUrl;
    }
  }

  return null;
}

export function extractHeyGenVideoId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  return (
    readString(data.video_id) ??
    readString(data.videoId) ??
    readString(root.video_id) ??
    readString(root.videoId)
  );
}

export function extractHeyGenSessionStatus(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const root = payload as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  return readString(data.status) ?? readString(root.status) ?? '';
}

export function maskProviderJobId(id: string | null | undefined): string | null {
  if (!id) return null;
  if (id.length <= 8) return '****';
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}
