import { ReelPlatformPublishStatus } from '@prisma/client';
import { readJobRenderMeta, mergeJobRenderMeta } from './ai-influencer-video-agent.util';

export const FACEBOOK_PUBLISH_RETRY_DELAYS_MS = [
  5 * 60_000,
  15 * 60_000,
  30 * 60_000,
  60 * 60_000,
] as const;

export function getFacebookPublishRetryAttempts(
  renderSettingsJson: unknown,
): number {
  return readJobRenderMeta(renderSettingsJson).facebookPublishRetryAttempts ?? 0;
}

export function getFacebookPublishRetryDelayMs(attempts: number): number {
  const idx = Math.min(attempts, FACEBOOK_PUBLISH_RETRY_DELAYS_MS.length - 1);
  return FACEBOOK_PUBLISH_RETRY_DELAYS_MS[idx] ?? FACEBOOK_PUBLISH_RETRY_DELAYS_MS.at(-1)!;
}

export function shouldRetryFacebookPublish(job: {
  facebookPublishStatus: ReelPlatformPublishStatus;
  updatedAt: Date;
  renderSettingsJson: unknown;
}): boolean {
  if (
    job.facebookPublishStatus !== ReelPlatformPublishStatus.RATE_LIMITED &&
    job.facebookPublishStatus !== ReelPlatformPublishStatus.QUOTA_EXCEEDED
  ) {
    return false;
  }
  const attempts = getFacebookPublishRetryAttempts(job.renderSettingsJson);
  if (attempts >= FACEBOOK_PUBLISH_RETRY_DELAYS_MS.length) return false;
  const delayMs = getFacebookPublishRetryDelayMs(attempts);
  return Date.now() - job.updatedAt.getTime() >= delayMs;
}

export function nextFacebookPublishRetryMeta(
  renderSettingsJson: unknown,
): Record<string, unknown> {
  const attempts = getFacebookPublishRetryAttempts(renderSettingsJson) + 1;
  return mergeJobRenderMeta(renderSettingsJson, {
    facebookPublishRetryAttempts: attempts,
    facebookPublishRetryAt: new Date().toISOString(),
  }) as Record<string, unknown>;
}
