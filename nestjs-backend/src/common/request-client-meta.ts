export type RequestClientMeta = {
  ip: string | null;
  userAgent: string | null;
};

export function extractRequestClientMeta(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): RequestClientMeta {
  const forwarded = req.headers?.['x-forwarded-for'];
  let ip: string | null = null;
  if (typeof forwarded === 'string') {
    ip = forwarded.split(',')[0]?.trim() || null;
  } else if (Array.isArray(forwarded) && forwarded[0]) {
    ip = String(forwarded[0]).trim() || null;
  } else if (req.ip) {
    ip = req.ip;
  }

  const ua = req.headers?.['user-agent'];
  const userAgent = typeof ua === 'string' ? ua : null;

  return { ip, userAgent };
}
