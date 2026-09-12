import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getUploadsPath } from '../../lib/uploads-path';
import { PropertyMediaCloudinaryService } from '../properties/property-media-cloudinary.service';
import type { VideoAgentMediaFile } from './heygen-video-agent-prompt.util';
import {
  buildHeyGenMediaPrepStats,
  HEYGEN_MEDIA_MAX_DOWNLOAD_BYTES,
  inferMediaSourceType,
  normalizeHeyGenMediaSourceType,
  isBlockedMediaHostname,
  isLikelyPublicCloudinaryUrl,
  isYoutubeMediaUrl,
  parseMediaHostname,
  sanitizeUrlForLog,
  toHeyGenMediaFiles,
  validateExternalMediaUrl,
  type HeyGenMediaPrepStats,
  type HeyGenMediaSourceType,
  type PreparedHeyGenMediaAsset,
} from './heygen-video-agent-media.util';

export type StoredHeyGenPreparedMedia = {
  sourceUrl: string;
  sourceHost: string;
  publicUrl: string;
  rehosted: boolean;
  label?: string;
  mimeType?: string | null;
  sourceType?: HeyGenMediaSourceType | string;
};

export type PrepareHeyGenMediaResult = {
  files: VideoAgentMediaFile[];
  stats: HeyGenMediaPrepStats;
  prepared: StoredHeyGenPreparedMedia[];
  issues: Array<{ index: number; host: string; label?: string; reason: string; action: string }>;
};

type EnsureAssetInput = {
  sourceUrl: string;
  label?: string;
  cache?: Map<string, StoredHeyGenPreparedMedia>;
};

@Injectable()
export class HeyGenVideoAgentMediaService {
  private readonly log = new Logger(HeyGenVideoAgentMediaService.name);

  constructor(private readonly cloudinary: PropertyMediaCloudinaryService) {}

  async prepareHeyGenMediaFiles(
    jobId: string,
    rawFiles: VideoAgentMediaFile[],
    cachedPrepared?: StoredHeyGenPreparedMedia[] | null,
  ): Promise<PrepareHeyGenMediaResult> {
    const cache = new Map<string, StoredHeyGenPreparedMedia>();
    for (const row of cachedPrepared ?? []) {
      if (row.sourceUrl?.trim() && row.publicUrl?.trim()) {
        cache.set(row.sourceUrl.trim(), row);
      }
    }

    const preparedAssets: PreparedHeyGenMediaAsset[] = [];
    const issues: PrepareHeyGenMediaResult['issues'] = [];
    let skipped = 0;
    let invalid = 0;

    for (let index = 0; index < rawFiles.length; index += 1) {
      const file = rawFiles[index]!;
      const sourceUrl = file.url?.trim();
      if (!sourceUrl) {
        invalid += 1;
        continue;
      }

      const resolved = await this.ensureExternallyAccessibleAsset(jobId, {
        sourceUrl,
        label: file.label,
        cache,
      });

      if (!resolved) {
        invalid += 1;
        issues.push({
          index,
          host: parseMediaHostname(sourceUrl) || 'unknown',
          label: file.label,
          reason: 'externě nedostupné',
          action: 'vynecháno z Video Agent payloadu',
        });
        continue;
      }

      if (resolved.skipped) {
        skipped += 1;
        issues.push({
          index,
          host: resolved.sourceHost,
          label: file.label,
          reason: resolved.reason ?? 'neplatné médium',
          action: 'vynecháno z Video Agent payloadu',
        });
        continue;
      }

      preparedAssets.push(resolved.asset);
      this.logHeyGenMediaValidation(jobId, index, resolved.asset, resolved.validation);
    }

    const stats = buildHeyGenMediaPrepStats({
      selected: preparedAssets,
      skipped,
      invalid,
    });

    this.log.log(
      `[AI-VIDEO][${jobId}] HEYGEN MEDIA selected=${stats.selected} publicAlready=${stats.publicAlready} rehosted=${stats.rehosted} skipped=${stats.skipped} invalid=${stats.invalid}`,
    );
    this.log.log(
      `[AI-VIDEO][${jobId}] HeyGen files payload: ${preparedAssets.length} valid public URLs`,
    );

    return {
      files: toHeyGenMediaFiles(preparedAssets),
      stats,
      prepared: preparedAssets.map((asset) => ({
        sourceUrl: asset.sourceUrl,
        sourceHost: asset.sourceHost,
        publicUrl: asset.publicUrl,
        rehosted: asset.rehosted,
        label: asset.label,
        mimeType: asset.mimeType,
        sourceType: asset.sourceType,
      })),
      issues,
    };
  }

  async resolveHeyGenMediaAsset(
    input: EnsureAssetInput,
  ): Promise<{ publicUrl: string; mimeType: string | null; sourceType: HeyGenMediaSourceType } | null> {
    const resolved = await this.ensureExternallyAccessibleAsset('resolve', input);
    if (!resolved || resolved.skipped) return null;
    return {
      publicUrl: resolved.asset.publicUrl,
      mimeType: resolved.asset.mimeType,
      sourceType: resolved.asset.sourceType,
    };
  }

  private async ensureExternallyAccessibleAsset(
    jobId: string,
    input: EnsureAssetInput,
  ): Promise<
    | {
        asset: PreparedHeyGenMediaAsset;
        validation: Awaited<ReturnType<typeof validateExternalMediaUrl>>;
        skipped?: false;
        reason?: string;
      }
    | { skipped: true; sourceHost: string; reason: string }
    | null
  > {
    const sourceUrl = input.sourceUrl.trim();
    const sourceHost = parseMediaHostname(sourceUrl) || 'unknown';
    const sourceType = inferMediaSourceType(input.label, sourceUrl);

    if (isYoutubeMediaUrl(sourceUrl)) {
      return { skipped: true, sourceHost, reason: 'YouTube médium není podporováno' };
    }

    const cached = input.cache?.get(sourceUrl);
    if (cached?.publicUrl) {
      const cachedValidation = await validateExternalMediaUrl(cached.publicUrl);
      if (cachedValidation.ok) {
        return {
          asset: {
            sourceUrl,
            sourceHost,
            publicUrl: cached.publicUrl,
            mimeType: cachedValidation.contentType,
            sourceType: normalizeHeyGenMediaSourceType(cached.sourceType, sourceType),
            rehosted: cached.rehosted,
            label: input.label ?? cached.label,
          },
          validation: cachedValidation,
        };
      }
    }

    let validation = await validateExternalMediaUrl(sourceUrl);
    if (validation.ok) {
      const asset: PreparedHeyGenMediaAsset = {
        sourceUrl,
        sourceHost,
        publicUrl: validation.url,
        mimeType: validation.contentType,
        sourceType,
        rehosted: false,
        label: input.label,
      };
      input.cache?.set(sourceUrl, {
        sourceUrl,
        sourceHost,
        publicUrl: asset.publicUrl,
        rehosted: false,
        label: input.label,
        mimeType: asset.mimeType,
        sourceType,
      });
      return { asset, validation };
    }

    this.log.warn(
      `[AI-VIDEO][${jobId}] Médium ${sanitizeUrlForLog(sourceUrl)} host=${sourceHost} důvod=${validation.reason ?? 'externě nedostupné'} — přesouvám do veřejného storage`,
    );

    const downloaded = await this.downloadMediaForRehost(sourceUrl);
    if (!downloaded) {
      return { skipped: true, sourceHost, reason: 'nelze stáhnout pro rehost' };
    }

    const ext =
      downloaded.contentType.includes('png')
        ? 'png'
        : downloaded.contentType.includes('webp')
          ? 'webp'
          : downloaded.contentType.includes('gif')
            ? 'gif'
            : 'jpg';

    let publicUrl: string;
    try {
      publicUrl = await this.cloudinary.uploadImageBuffer(
        downloaded.buffer,
        `heygen-${jobId.slice(0, 8)}-${Date.now()}.${ext}`,
      );
    } catch (err) {
      this.log.warn(
        `[AI-VIDEO][${jobId}] Cloudinary rehost failed host=${sourceHost}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return { skipped: true, sourceHost, reason: 'rehost selhal' };
    }

    validation = await validateExternalMediaUrl(publicUrl);
    if (!validation.ok) {
      return { skipped: true, sourceHost, reason: 'rehostovaná URL není veřejně dostupná' };
    }

    const asset: PreparedHeyGenMediaAsset = {
      sourceUrl,
      sourceHost,
      publicUrl,
      mimeType: validation.contentType ?? downloaded.contentType,
      sourceType,
      rehosted: true,
      label: input.label,
    };
    input.cache?.set(sourceUrl, {
      sourceUrl,
      sourceHost,
      publicUrl,
      rehosted: true,
      label: input.label,
      mimeType: asset.mimeType,
      sourceType,
    });
    return { asset, validation };
  }

  private logHeyGenMediaValidation(
    jobId: string,
    index: number,
    asset: PreparedHeyGenMediaAsset,
    validation: Awaited<ReturnType<typeof validateExternalMediaUrl>>,
  ): void {
    const mediaType =
      validation.contentType?.startsWith('video/') || asset.mimeType?.startsWith('video/')
        ? 'video'
        : 'image';
    this.log.log(
      `[AI-VIDEO][${jobId}] HEYGEN VIDEO AGENT MEDIA index=${index} type=${mediaType} hostname=${parseMediaHostname(asset.publicUrl)} protocol=https publicValidation=${validation.ok ? 'PASS' : 'FAIL'} httpStatus=${validation.httpStatus ?? 'n/a'} contentType=${validation.contentType ?? asset.mimeType ?? 'unknown'} contentLength=${validation.contentLength ?? 'unknown'} rehosted=${asset.rehosted}`,
    );
  }

  private getPortalHosts(): string[] {
    const raw =
      process.env.FRONTEND_URL?.trim() ||
      process.env.PUBLIC_SITE_URL?.trim() ||
      'https://www.xxrealit.cz';
    const hosts = new Set<string>(['www.xxrealit.cz', 'xxrealit.cz', 'localhost', '127.0.0.1']);
    try {
      hosts.add(new URL(raw).hostname.toLowerCase());
    } catch {
      /* ignore */
    }
    return [...hosts];
  }

  private async readLocalPortalUpload(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    if (!this.getPortalHosts().includes(parsed.hostname.toLowerCase())) return null;
    if (!parsed.pathname.startsWith('/uploads/')) return null;

    const relative = parsed.pathname.replace(/^\/uploads\//, '');
    if (!relative || relative.includes('..')) return null;

    const localPath = join(getUploadsPath(), relative);
    try {
      const buffer = await readFile(localPath);
      if (!buffer.length || buffer.length > HEYGEN_MEDIA_MAX_DOWNLOAD_BYTES) return null;
      const ext = relative.split('.').pop()?.toLowerCase();
      const contentType =
        ext === 'png'
          ? 'image/png'
          : ext === 'webp'
            ? 'image/webp'
            : ext === 'gif'
              ? 'image/gif'
              : 'image/jpeg';
      return { buffer, contentType };
    } catch {
      return null;
    }
  }

  private async downloadMediaForRehost(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string } | null> {
    const local = await this.readLocalPortalUpload(url);
    if (local) return local;

    if (isLikelyPublicCloudinaryUrl(url)) {
      try {
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') ?? 'image/jpeg';
        const buffer = Buffer.from(await res.arrayBuffer());
        if (!buffer.length || buffer.length > HEYGEN_MEDIA_MAX_DOWNLOAD_BYTES) return null;
        return { buffer, contentType };
      } catch {
        return null;
      }
    }

    const hostname = parseMediaHostname(url);
    if (!hostname || isBlockedMediaHostname(hostname) || isYoutubeMediaUrl(url)) return null;

    const validation = await validateExternalMediaUrl(url);
    if (validation.ok) {
      try {
        const res = await fetch(url, { redirect: 'follow' });
        if (!res.ok) return null;
        const contentType = res.headers.get('content-type') ?? validation.contentType ?? 'image/jpeg';
        const buffer = Buffer.from(await res.arrayBuffer());
        if (!buffer.length || buffer.length > HEYGEN_MEDIA_MAX_DOWNLOAD_BYTES) return null;
        return { buffer, contentType };
      } catch {
        return null;
      }
    }

    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          'User-Agent': 'Mozilla/5.0 (compatible; XXRealitMediaPrep/1.0; +https://www.xxrealit.cz)',
        },
      });
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      if (!buffer.length || buffer.length > HEYGEN_MEDIA_MAX_DOWNLOAD_BYTES) return null;
      return { buffer, contentType };
    } catch {
      return null;
    }
  }
}
