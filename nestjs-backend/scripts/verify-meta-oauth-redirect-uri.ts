import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';
import { FacebookConfigService } from '../src/modules/social/facebook/facebook-config.service';
import { ConfigService } from '@nestjs/config';
import {
  isLocalhostLikeUrl,
  isProductionEnvironment,
  resolveMetaOAuthRedirectUri,
} from '../src/modules/meta-center/meta-oauth-redirect-uri.util';

loadDotenv({ path: resolve(__dirname, '../.env') });

function readEnv(name: string): string | null {
  const raw = process.env[name];
  if (raw == null) return null;
  const value = String(raw).trim();
  return value.length > 0 ? value : null;
}

const resolved = resolveMetaOAuthRedirectUri(readEnv);
const uri = resolved.uri;

if (!uri) {
  if (!isProductionEnvironment()) {
    console.log('SKIP: META_REDIRECT_URI/BACKEND_URL not set (local build)');
    process.exit(0);
  }
  console.error('FAIL: Meta OAuth redirect URI nelze odvodit');
  console.error('warnings:', resolved.warnings);
  process.exit(1);
}

if (isLocalhostLikeUrl(uri)) {
  console.error('FAIL: redirect URI obsahuje localhost:', uri);
  process.exit(1);
}

const allowedHosts = ['xxrealit.cz', 'railway.app'];
const host = new URL(uri).hostname.toLowerCase();
const hostOk = allowedHosts.some((h) => host === h || host.endsWith(`.${h}`));
if (isProductionEnvironment() && !hostOk) {
  console.warn(`WARN: redirect host ${host} není xxrealit.cz ani railway.app`);
}

const config = new ConfigService(process.env);
const fb = new FacebookConfigService(config);
const used = fb.tryGetMetaRedirectUri();

if (!used || used !== uri) {
  console.error('FAIL: FacebookConfigService.tryGetMetaRedirectUri() nesouhlasí');
  console.error('util:', uri);
  console.error('service:', used);
  process.exit(1);
}

if (!uri.endsWith('/api/social/facebook/meta-connect-callback')) {
  console.error('FAIL: redirect URI nemá očekávanou cestu:', uri);
  process.exit(1);
}

console.log('OK: Meta OAuth redirect URI verified');
console.log(`  source=${resolved.source} uri=${uri}`);
