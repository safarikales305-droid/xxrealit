import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { HotelbedsCacheService } from './hotelbeds-cache.service';
import { HotelbedsContentStorageService } from './hotelbeds-content-storage.service';
import {
  HOTELBEDS_IMAGE_FOLDER_FALLBACK,
  buildHotelbedsImageUrlWithFolder,
  sortHotelbedsImages,
  type HotelbedsImageSize,
} from './hotelbeds-normalizer';

const IMAGE_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

type DeliveryProbe = {
  rawPath: string;
  resolvedUrl: string;
  httpStatus: number | null;
  contentType: string | null;
  folder: string | null;
  proxyUrl: string;
};

@Injectable()
export class HotelbedsImageService {
  private readonly log = new Logger(HotelbedsImageService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cache: HotelbedsCacheService,
    private readonly contentStorage: HotelbedsContentStorageService,
  ) {}

  /** Bezpečná veřejná proxy URL — pouze hotelId + index z našich dat. */
  buildProxyUrl(hotelId: number, index: number, size: HotelbedsImageSize = 'card'): string {
    const params = new URLSearchParams({
      hotelId: String(hotelId),
      index: String(index),
      size,
    });
    const path = `/hotelbeds/public/image?${params.toString()}`;
    const base = this.publicApiBase();
    return base ? `${base}${path}` : path;
  }

  async streamImage(
    res: Response,
    hotelId: number,
    index: number,
    size: HotelbedsImageSize = 'card',
  ): Promise<void> {
    const path = await this.resolveStoredImagePath(hotelId, index);
    if (!path) {
      throw new NotFoundException('Obrázek nenalezen.');
    }

    const delivered = await this.fetchWithFallback(path, hotelId, index, size);
    if (!delivered) {
      res.status(502).json({ message: 'Hotelbeds image delivery failed.' });
      return;
    }

    res.setHeader('Content-Type', delivered.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.status(200).send(delivered.buffer);
  }

  async probeDelivery(hotelId: number, index = 0, size: HotelbedsImageSize = 'card'): Promise<DeliveryProbe> {
    const path = await this.resolveStoredImagePath(hotelId, index);
    const proxyUrl = this.buildProxyUrl(hotelId, index, size);
    if (!path) {
      return {
        rawPath: '',
        resolvedUrl: '',
        httpStatus: null,
        contentType: null,
        folder: null,
        proxyUrl,
      };
    }

    const delivered = await this.fetchWithFallback(path, hotelId, index, size);
    return {
      rawPath: path,
      resolvedUrl: delivered?.url ?? buildHotelbedsImageUrlWithFolder(path, null),
      httpStatus: delivered?.status ?? null,
      contentType: delivered?.contentType ?? null,
      folder: delivered?.folder ?? null,
      proxyUrl,
    };
  }

  private async resolveStoredImagePath(hotelId: number, index: number): Promise<string | null> {
    if (!Number.isFinite(hotelId) || hotelId <= 0 || !Number.isFinite(index) || index < 0) {
      return null;
    }

    const dbContent = await this.contentStorage.findByProviderId(hotelId);
    const sorted = sortHotelbedsImages(dbContent?.images);
    const img = sorted[index];
    if (img?.path) return img.path;

    const cached = this.cache.peek<{ images?: Array<{ path?: string }> }>(`content:${hotelId}`);
    const cachedSorted = sortHotelbedsImages(cached?.images);
    return cachedSorted[index]?.path ?? null;
  }

  private async fetchWithFallback(
    path: string,
    hotelId: number,
    index: number,
    size: HotelbedsImageSize,
  ): Promise<{ buffer: Buffer; contentType: string; folder: string | null; url: string; status: number } | null> {
    const cacheKey = `img-folder:${hotelId}:${index}:${size}`;
    const cachedFolder = this.cache.peek<string | null>(cacheKey);
    const folders = this.folderOrder(cachedFolder);

    for (const folder of folders) {
      const url = buildHotelbedsImageUrlWithFolder(path, folder);
      const result = await this.fetchRemote(url);
      if (result) {
        this.cache.set(cacheKey, folder, IMAGE_CACHE_TTL_MS);
        return { ...result, folder, url };
      }
    }
    return null;
  }

  private folderOrder(preferred: string | null | undefined): Array<string | null> {
    const ordered = [...HOTELBEDS_IMAGE_FOLDER_FALLBACK];
    if (preferred === undefined) return ordered;
    return [preferred, ...ordered.filter((f) => f !== preferred)];
  }

  private async fetchRemote(
    url: string,
  ): Promise<{ buffer: Buffer; contentType: string; status: number } | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'image/*' },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) return null;
      const arrayBuffer = await res.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType,
        status: res.status,
      };
    } catch (err) {
      this.log.debug(`Image fetch failed for ${url}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private publicApiBase(): string {
    const raw =
      this.config.get<string>('API_PUBLIC_URL')?.trim() ||
      this.config.get<string>('NEXT_PUBLIC_API_URL')?.trim() ||
      '';
    if (!raw) return '';
    const trimmed = raw.replace(/\/+$/, '');
    return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
  }
}
