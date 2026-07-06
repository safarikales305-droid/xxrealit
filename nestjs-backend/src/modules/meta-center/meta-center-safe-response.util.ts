export type MetaCenterEndpointStatus = 'ok' | 'not_configured' | 'error' | 'permission_denied';

export type MetaSafeErrorDetail = {
  code: string | null;
  message: string;
  type: string;
  endpoint: string;
};

export function extractSafeMetaError(err: unknown, endpoint: string): MetaSafeErrorDetail {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const response = e.response as Record<string, unknown> | undefined;
    const nested = response?.message;
    const graphError = e.error as Record<string, unknown> | undefined;
    if (graphError && typeof graphError.message === 'string') {
      const rawCode = graphError.code;
      return {
        code: rawCode != null ? String(rawCode) : null,
        message: graphError.message,
        type: typeof graphError.type === 'string' ? graphError.type : 'graph_api',
        endpoint,
      };
    }
    if (typeof e.message === 'string') {
      const msg = Array.isArray(nested) ? nested.join(', ') : e.message;
      const rawCode =
        typeof e.status === 'number' ? e.status : (e.code as string | number | null | undefined);
      return {
        code: rawCode != null ? String(rawCode) : null,
        message: msg,
        type: e.name === 'BadRequestException' ? 'bad_request' : 'internal',
        endpoint,
      };
    }
  }
  return {
    message: err instanceof Error ? err.message : 'Neočekávaná chyba backendu.',
    endpoint,
    type: 'internal',
    code: null,
  };
}

export function metaListNotConfigured(
  message: string,
  extra?: Record<string, unknown>,
): {
  ok: false;
  status: 'not_configured';
  message: string;
  items: [];
  error: MetaSafeErrorDetail;
} {
  return {
    ok: false,
    status: 'not_configured',
    message,
    items: [],
    error: { message, endpoint: '', type: 'not_configured', code: null },
    ...extra,
  };
}

export function metaListOk<T>(
  items: T[],
  extra?: Record<string, unknown>,
): { ok: true; status: 'ok'; message: null; items: T[] } & Record<string, unknown> {
  return {
    ok: true,
    status: 'ok',
    message: null,
    items,
    ...extra,
  };
}

export function metaPanelNotConfigured(
  message: string,
  extra?: Record<string, unknown>,
): {
  ok: false;
  status: 'not_configured';
  message: string;
  error: MetaSafeErrorDetail;
} & Record<string, unknown> {
  return {
    ok: false,
    status: 'not_configured',
    message,
    error: { message, endpoint: '', type: 'not_configured', code: null },
    ...extra,
  };
}
