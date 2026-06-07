import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  buildOgDescription,
  buildOgTitle,
  resolvePropertyOgImageUrl,
} from '../properties/property-og-media.util';
import { upgradeHttpToHttpsForApi } from '../../lib/secure-url';

@Controller('debug/og')
export class OgDebugController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async getOgDebug(@Param('id') id: string) {
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
        approved: true,
        isActive: true,
        isVisible: true,
      },
    });

    if (!property) {
      throw new NotFoundException('Inzerát nenalezen');
    }

    const siteOrigin =
      process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      'https://www.xxrealit.cz';
    const fallback = `${siteOrigin.replace(/\/+$/, '')}/icons/icon-192.png`;

    const image = resolvePropertyOgImageUrl(
      {
        thumbnailUrl: property.thumbnailUrl,
        mainImage: property.mainImage,
        images: property.images,
        generatedVideoThumbnail: property.generatedVideoThumbnail,
        videoUrl: property.videoUrl,
      },
      fallback,
    );

    let imageStatus: number | null = null;
    try {
      const head = await fetch(image, { method: 'HEAD', redirect: 'follow' });
      imageStatus = head.status;
    } catch {
      imageStatus = null;
    }

    const video = property.videoUrl
      ? upgradeHttpToHttpsForApi(property.videoUrl) ?? property.videoUrl
      : null;

    return {
      title: buildOgTitle(property.title, property.price, property.currency),
      description: buildOgDescription(property.city, property.description),
      image,
      video,
      imageStatus,
      isAbsoluteUrl: /^https:\/\//i.test(image),
      pageUrl: `${siteOrigin.replace(/\/+$/, '')}/nemovitost/${property.id}`,
      thumbnailUrl: property.thumbnailUrl,
      generatedVideoThumbnail: property.generatedVideoThumbnail,
      mainImage: property.mainImage,
      galleryFirst: property.images[0] ?? null,
    };
  }
}
