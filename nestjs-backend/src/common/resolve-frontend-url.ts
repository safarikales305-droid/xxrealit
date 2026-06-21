import type { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

const PRODUCTION_FALLBACK = 'https://www.xxrealit.cz';
const LOCALHOST_FALLBACK = 'http://localhost:3000';
const LOCALHOST_LIKE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

function readFrontendUrlRaw(config?: ConfigService): string {
  return (
    config?.get<string>('FRONTEND_URL')?.trim() ||
    process.env.FRONTEND_URL?.trim() ||
    ''
  );
}

function isProduction(config?: ConfigService): boolean {
  const nodeEnv = (config?.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? '').trim();
  if (nodeEnv.toLowerCase() === 'production') return true;
  if (process.env.RAILWAY_ENVIRONMENT?.trim()) return true;
  return false;
}

/** Veřejná URL frontendu pro odkazy v e-mailech a OAuth redirectech. */
export function resolveFrontendUrl(config?: ConfigService, logger?: Logger): string {
  const normalized = readFrontendUrlRaw(config).replace(/\/+$/, '');

  if (isProduction(config)) {
    if (!normalized) {
      logger?.error(
        `FRONTEND_URL is missing in production. Falling back to ${PRODUCTION_FALLBACK}.`,
      );
      return PRODUCTION_FALLBACK;
    }
    if (LOCALHOST_LIKE.test(normalized)) {
      logger?.error(
        `FRONTEND_URL resolves to localhost in production (${normalized}). Falling back to ${PRODUCTION_FALLBACK}.`,
      );
      return PRODUCTION_FALLBACK;
    }
    return normalized;
  }

  return normalized || LOCALHOST_FALLBACK;
}

export function buildPasswordResetUrl(
  token: string,
  config?: ConfigService,
  logger?: Logger,
): string {
  const baseUrl = resolveFrontendUrl(config, logger);
  logger?.log(`PASSWORD_RESET_LINK_CREATED baseUrl=${baseUrl}`);
  return `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildEmailVerificationUrl(
  token: string,
  config?: ConfigService,
  logger?: Logger,
): string {
  const baseUrl = resolveFrontendUrl(config, logger);
  return `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
}

export function normalizePublicEmailUrl(
  url: string,
  config?: ConfigService,
  logger?: Logger,
): string {
  const value = String(url ?? '').trim();
  if (!value) return resolveFrontendUrl(config, logger);
  if (isProduction(config) && LOCALHOST_LIKE.test(value)) {
    const fixed = value.replace(LOCALHOST_LIKE, resolveFrontendUrl(config, logger));
    logger?.error(`Localhost URL detected in production email payload. Replaced with ${fixed}`);
    return fixed;
  }
  return value;
}
