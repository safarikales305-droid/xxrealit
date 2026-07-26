import { AiSalesAdminException, buildSalesAdminError } from '../ai-sales-errors.util';
import type { SearchProvidersEnvService } from '../search-providers-env.service';

export type SerpApiTestResult = {
  success: true;
  provider: 'SERPAPI';
  configured: true;
  durationMs: number;
  resultCount: number;
};

const TEST_QUERY = 'realitní kancelář Pardubice';
const TEST_TIMEOUT_MS = 20_000;

export async function runSerpApiTest(env: SearchProvidersEnvService): Promise<SerpApiTestResult> {
  const key = env.getSerpApiKey();
  if (!key) {
    throw new AiSalesAdminException(
      buildSalesAdminError(
        'SERPAPI_NOT_CONFIGURED',
        'SerpAPI není nakonfigurováno. Nastavte SERPAPI_API_KEY na backendové službě.',
        400,
        'serpapi_test',
        { missingVariable: 'SERPAPI_API_KEY' },
      ),
    );
  }

  const started = Date.now();
  const params = new URLSearchParams({
    engine: 'google',
    q: TEST_QUERY,
    location: 'Pardubice, Czechia',
    google_domain: 'google.cz',
    gl: 'cz',
    hl: 'cs',
    num: '5',
    api_key: key,
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

  try {
    const res = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      if (res.status === 401 || res.status === 403) {
        throw new AiSalesAdminException(
          buildSalesAdminError(
            'SERPAPI_INVALID_KEY',
            'SerpAPI odmítlo API klíč. Zkontrolujte SERPAPI_API_KEY na Railway.',
            400,
            'serpapi_test',
          ),
        );
      }
      if (res.status === 429) {
        throw new AiSalesAdminException(
          buildSalesAdminError(
            'SERPAPI_QUOTA_EXCEEDED',
            'SerpAPI quota byla překročena.',
            429,
            'serpapi_test',
          ),
        );
      }
      throw new AiSalesAdminException(
        buildSalesAdminError(
          'SERPAPI_CONNECTION_ERROR',
          `SerpAPI vrátilo HTTP ${res.status}${body ? `: ${body.slice(0, 120)}` : ''}`,
          502,
          'serpapi_test',
        ),
      );
    }

    let data: { organic_results?: unknown[]; error?: string };
    try {
      data = (await res.json()) as { organic_results?: unknown[]; error?: string };
    } catch {
      throw new AiSalesAdminException(
        buildSalesAdminError('SERPAPI_INVALID_RESPONSE', 'SerpAPI vrátilo neplatnou JSON odpověď.', 502, 'serpapi_test'),
      );
    }

    if (data.error) {
      const errMsg = String(data.error);
      if (/invalid api key|unauthorized/i.test(errMsg)) {
        throw new AiSalesAdminException(
          buildSalesAdminError('SERPAPI_INVALID_KEY', 'SerpAPI odmítlo API klíč.', 400, 'serpapi_test'),
        );
      }
      throw new AiSalesAdminException(
        buildSalesAdminError('SERPAPI_INVALID_RESPONSE', errMsg, 502, 'serpapi_test'),
      );
    }

    const resultCount = Array.isArray(data.organic_results) ? data.organic_results.length : 0;
    return {
      success: true,
      provider: 'SERPAPI',
      configured: true,
      durationMs: Date.now() - started,
      resultCount,
    };
  } catch (err) {
    if (err instanceof AiSalesAdminException) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new AiSalesAdminException(
        buildSalesAdminError('SERPAPI_TIMEOUT', 'SerpAPI test vypršel (timeout).', 504, 'serpapi_test'),
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new AiSalesAdminException(
      buildSalesAdminError('SERPAPI_CONNECTION_ERROR', `SerpAPI test selhal: ${message}`, 503, 'serpapi_test'),
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function buildSerpApiSearchUrl(query: string, limit: number, apiKey: string): string {
  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    location: 'Pardubice, Czechia',
    google_domain: 'google.cz',
    gl: 'cz',
    hl: 'cs',
    num: String(Math.min(limit, 30)),
    api_key: apiKey,
  });
  return `https://serpapi.com/search.json?${params.toString()}`;
}
