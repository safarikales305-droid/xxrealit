import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { probeOgImageUrl } from '../properties/og-image-probe.util';
import {
  appendOgImageCacheVersion,
  getPortalLogoFallbackUrl,
  isFacebookShareImageReady,
  pickVideoThumbnail,
  propertyHasListingMedia,
  resolvePropertyOgImageWithSource,
} from '../properties/property-og-media.util';
import { getSiteOriginForOg } from '../properties/property-og-media.util';

@Controller('debug/og')
export class OgDebugController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('nemovitost/:id')
  async getPropertyOgDebug(@Param('id') id: string) {
    return this.buildPropertyOgDebug(id);
  }

  /** @deprecated použijte /debug/og/nemovitost/:id */
  @Get(':id')
  async getOgDebugLegacy(@Param('id') id: string) {
    return this.buildPropertyOgDebug(id);
  }

  private async buildPropertyOgDebug(id: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: id.trim(), deletedAt: null },
      select: {
        id: true,
        title: true,
        description: true,
        city: true,
        price: true,
        currency: true,
        images: true,
        mainImage: true,
        thumbnailUrl: true,
        facebookShareImageUrl: true,
        facebookShareImageAt: true,
        createdAt: true,
        generatedVideoThumbnail: true,
        videoUrl: true,
      },
    });

    if (!property) {
      throw new NotFoundException('Inzerát nenalezen');
    }

    const ogInput = {
      facebookShareImageUrl: property.facebookShareImageUrl,
      facebookShareImageAt: property.facebookShareImageAt,
      thumbnailUrl: property.thumbnailUrl,
      mainImage: property.mainImage,
      images: property.images,
      generatedVideoThumbnail: property.generatedVideoThumbnail,
      videoUrl: property.videoUrl,
    };
    const firstGalleryImage = property.images[0] ?? null;
    const videoThumbnail = pickVideoThumbnail(ogInput);
    const resolved = resolvePropertyOgImageWithSource(ogInput, getPortalLogoFallbackUrl());
    const versionMs =
      property.facebookShareImageAt?.getTime() ?? property.createdAt.getTime();
    const versionedOgImage = appendOgImageCacheVersion(resolved.url, versionMs);
    const isLogoFallback = resolved.isLogoFallback;
    const warning =
      isLogoFallback && propertyHasListingMedia(ogInput)
        ? 'Listing has images but OG selected logo'
        : null;

    const probeUrl = property.facebookShareImageUrl?.trim() || resolved.url;
    const started = Date.now();
    const probe = await probeOgImageUrl(probeUrl);
    const loadTimeMs = Date.now() - started;
    const cacheControl = probe.isPublic ? 'public, max-age=31536000, immutable' : null;

    return {
      selectedOgImage: versionedOgImage,
      selectedSource: resolved.source,
      facebookShareImageUrl: property.facebookShareImageUrl,
      thumbnailUrl: property.thumbnailUrl,
      mainImage: property.mainImage,
      firstGalleryImage,
      videoThumbnail,
      isLogoFallback,
      warning,
      publicUrl: `${getSiteOriginForOg()}/nemovitost/${property.id}`,
      ogImage: versionedOgImage,
      image: versionedOgImage,
      imageStatus: probe.imageStatus,
      contentType: probe.contentType,
      contentLength: probe.contentLength,
      width: probe.width,
      height: probe.height,
      isPublic: probe.isPublic,
      isWhiteOrBlank: probe.isWhiteOrBlank,
      loadTimeMs,
      isCached: Boolean(cacheControl),
      isReadyForFacebook: isFacebookShareImageReady(
        property.facebookShareImageUrl,
        property.facebookShareImageAt,
      ),
      cacheControl,
    };
  }
}
