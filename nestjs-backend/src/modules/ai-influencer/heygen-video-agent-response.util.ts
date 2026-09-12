export type HeyGenVideoAgentSubmitParseResult =
  | {
      ok: true;
      sessionId: string;
      videoId: string | null;
      status: string | null;
      responseShape: string;
    }
  | {
      ok: false;
      code:
        | 'HEYGEN_VIDEO_AGENT_SESSION_ID_MISSING'
        | 'HEYGEN_VIDEO_AGENT_INVALID_RESPONSE';
      message: string;
      responseShape: string;
      sanitizedPreview: string;
    };

function previewBody(raw: string, max = 240): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Parsuje skutečnou HeyGen odpověď POST /v3/video-agents — bez hádání mimo dokumentované tvary. */
export function parseHeyGenVideoAgentSubmitResponse(rawBody: string): HeyGenVideoAgentSubmitParseResult {
  let json: unknown;
  try {
    json = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    return {
      ok: false,
      code: 'HEYGEN_VIDEO_AGENT_INVALID_RESPONSE',
      message: 'HeyGen vrátil nevalidní JSON.',
      responseShape: 'invalid_json',
      sanitizedPreview: previewBody(rawBody),
    };
  }

  const root = (json ?? {}) as Record<string, unknown>;
  const data =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;

  const sessionIdRaw =
    data.session_id ??
    data.sessionId ??
    data.id ??
    root.session_id ??
    root.sessionId;

  const sessionId = typeof sessionIdRaw === 'string' ? sessionIdRaw.trim() : '';
  const videoIdRaw = data.video_id ?? data.videoId ?? root.video_id ?? root.videoId;
  const videoId = typeof videoIdRaw === 'string' && videoIdRaw.trim() ? videoIdRaw.trim() : null;
  const statusRaw = data.status ?? root.status;
  const status = typeof statusRaw === 'string' ? statusRaw : null;

  const shapeParts = [
    root.data ? 'data' : 'root',
    data.session_id ? 'session_id' : data.sessionId ? 'sessionId' : data.id ? 'id' : 'no_session_field',
  ];

  if (!sessionId) {
    return {
      ok: false,
      code: 'HEYGEN_VIDEO_AGENT_SESSION_ID_MISSING',
      message: 'HeyGen odpověděl HTTP 200, ale chybí session_id.',
      responseShape: shapeParts.join('.'),
      sanitizedPreview: previewBody(rawBody),
    };
  }

  return {
    ok: true,
    sessionId,
    videoId,
    status,
    responseShape: shapeParts.join('.'),
  };
}

export function mapHeyGenHttpErrorCode(httpStatus: number, providerCode?: string | null): string {
  const code = (providerCode ?? '').toLowerCase();
  if (httpStatus === 401 || httpStatus === 403 || code.includes('unauthorized')) {
    return 'HEYGEN_VIDEO_AGENT_AUTH_FAILED';
  }
  if (httpStatus === 402) return 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE';
  if (httpStatus === 404) return 'HEYGEN_VIDEO_AGENT_NOT_AVAILABLE';
  if (httpStatus === 400 || code.includes('invalid')) return 'HEYGEN_VIDEO_AGENT_BAD_REQUEST';
  if (httpStatus === 429) return 'HEYGEN_VIDEO_AGENT_RATE_LIMITED';
  if (httpStatus === 0) return 'HEYGEN_VIDEO_AGENT_CONNECTION_FAILED';
  return 'HEYGEN_VIDEO_AGENT_SUBMIT_FAILED';
}
