import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { resolvePropertyOgImageBest } from '../properties/og-image-probe.util';
import {
  buildOgDescription,
  buildOgTitle,
  deriveThumbnailUrlFromListing,
  getPortalLogoFallbackUrl,
  getSiteOriginForOg,
  isPortalBrandingUrl,
  normalizeOgImageCandidate,
  pickVideoThumbnail,
  propertyHasListingMedia,
} from '../properties/property-og-media.util';

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
        generatedVideoThumbnail: true,
        videoUrl: true,
      },
    });

    if (!property) {
      throw new NotFoundException('Inzerát nenalezen');
    }

    let thumbnailUrl = property.thumbnailUrl;
    if (
      !thumbnailUrl?.trim() ||
      isPortalBrandingUrl(thumbnailUrl) ||
      !normalizeOgImageCandidate(thumbnailUrl)
    ) {
      const derived = deriveThumbnailUrlFromListing(property);
      if (derived) {
        thumbnailUrl = derived;
        await this.prisma.property.update({
          where: { id: property.id },
          data: { thumbnailUrl: derived },
        });
      }
    }

    const ogInput = {
      thumbnailUrl,
      mainImage: property.mainImage,
      images: property.images,
      generatedVideoThumbnail: property.generatedVideoThumbnail,
      videoUrl: property.videoUrl,
    };
    const firstGalleryImage = property.images[0] ?? null;
    const videoThumbnail = pickVideoThumbnail(ogInput);

    const resolved = await resolvePropertyOgImageBest(ogInput, getPortalLogoFallbackUrl());
    const probe = resolved.probe;
    const isLogoFallback = resolved.isLogoFallback;
    const warning =
      isLogoFallback && propertyHasListingMedia(property)
        ? 'Listing has images but OG selected logo'
        : null;

    // eslint-disable-next-line no-console
    console.log('OG IMAGE SOURCE', {
      listingId: property.id,
      thumbnailUrl,
      mainImage: property.mainImage,
      galleryFirst: firstGalleryImage,
      videoThumbnail,
      selectedOgImage: resolved.url,
      selectedSource: resolved.source,
      isLogoFallback,
      warning,
    });

    return {
      selectedOgImage: resolved.url,
      selectedSource: resolved.source,
      thumbnailUrl,
      mainImage: property.mainImage,
      firstGalleryImage,
      videoThumbnail,
      isLogoFallback,
      warning,
      publicUrl: `${getSiteOriginForOg()}/nemovitost/${property.id}`,
      title: buildOgTitle(property.title, property.price, property.currency),
      description: buildOgDescription(property.city, property.description),
      ogImage: resolved.url,
      image: resolved.url,
      imageStatus: probe?.imageStatus ?? null,
      contentType: probe?.contentType ?? null,
      contentLength: probe?.contentLength ?? null,
      width: probe?.width ?? null,
      height: probe?.height ?? null,
      isPublic: probe?.isPublic ?? false,
      isWhiteOrBlank: probe?.isWhiteOrBlank ?? false,
    };
  }
}
