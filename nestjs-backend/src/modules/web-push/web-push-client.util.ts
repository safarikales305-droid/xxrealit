/** Safe loader for CommonJS `web-push` (no default export at runtime). */
export type WebPushClient = {
  setVapidDetails: (subject: string, publicKey: string, privateKey: string) => void;
  sendNotification: (
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload?: string | Buffer | null,
    options?: unknown,
  ) => Promise<unknown>;
};

function resolveWebPushModule(mod: unknown): WebPushClient | null {
  if (!mod || typeof mod !== 'object') return null;
  const candidate = (mod as { default?: unknown }).default ?? mod;
  if (
    candidate &&
    typeof candidate === 'object' &&
    typeof (candidate as WebPushClient).setVapidDetails === 'function' &&
    typeof (candidate as WebPushClient).sendNotification === 'function'
  ) {
    return candidate as WebPushClient;
  }
  return null;
}

let cached: WebPushClient | null | undefined;

/** Returns web-push API or null — never throws. */
export function getWebPushClient(): WebPushClient | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const required = require('web-push') as unknown;
    cached = resolveWebPushModule(required);
    if (!cached) {
      console.warn('[web-push] web-push není dostupný (setVapidDetails chybí)');
    }
    return cached;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[web-push] web-push není dostupný: ${message}`);
    cached = null;
    return null;
  }
}

export function isWebPushClientReady(): boolean {
  const client = getWebPushClient();
  return client != null && typeof client.setVapidDetails === 'function';
}
