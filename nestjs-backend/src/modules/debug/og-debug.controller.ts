import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { resolvePropertyOgImageBest } from '../properties/og-image-probe.util';
import {
  buildOgDescription,
  buildOgTitle,
  getPortalLogoFallbackUrl,
  getSiteOriginForOg,
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

    const siteOrigin = getSiteOriginForOg();
    const resolved = await resolvePropertyOgImageBest(
      {
        thumbnailUrl: property.thumbnailUrl,
        mainImage: property.mainImage,
        images: property.images,
        generatedVideoThumbnail: property.generatedVideoThumbnail,
        videoUrl: property.videoUrl,
      },
      getPortalLogoFallbackUrl(),
    );

    const publicUrl = `${siteOrigin}/nemovitost/${property.id}`;
    const title = buildOgTitle(property.title, property.price, property.currency);
    const description = buildOgDescription(property.city, property.description);
    const probe = resolved.probe;

    return {
      publicUrl,
      title,
      description,
      ogImage: resolved.url,
      image: resolved.url,
      imageIsAbsolute: /^https:\/\//i.test(resolved.url),
      imageStatus: probe?.imageStatus ?? null,
      contentType: probe?.contentType ?? null,
      contentLength: probe?.contentLength ?? null,
      width: probe?.width ?? null,
      height: probe?.height ?? null,
      isPublic: probe?.isPublic ?? false,
      isWhiteOrBlank: probe?.isWhiteOrBlank ?? false,
      usedFallbackLogo: resolved.usedFallbackLogo,
      source: resolved.source,
      thumbnailUrl: property.thumbnailUrl,
      generatedVideoThumbnail: property.generatedVideoThumbnail,
      mainImage: property.mainImage,
      galleryFirst: property.images[0] ?? null,
    };
  }
}
