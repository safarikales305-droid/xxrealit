import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { ReelScenePlan } from '../ai-influencer.types';

export type PropertyForReelMedia = {
  id: string;
  title: string;
  images: string[];
  mainImage: string | null;
};

@Injectable()
export class PropertyMediaProvider {
  constructor(private readonly prisma: PrismaService) {}

  async loadPropertyMedia(propertyId: string): Promise<PropertyForReelMedia | null> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: {
        id: true,
        title: true,
        images: true,
        mainImage: true,
        media: { where: { type: 'image' }, orderBy: { sortOrder: 'asc' }, select: { url: true } },
      },
    });
    if (!property) return null;
    const fromMedia = property.media.map((m) => m.url).filter(Boolean);
    const images = [...new Set([...(fromMedia.length ? fromMedia : property.images), property.mainImage].filter(Boolean))] as string[];
    return {
      id: property.id,
      title: property.title,
      images,
      mainImage: property.mainImage,
    };
  }

  async resolveSceneMedia(property: PropertyForReelMedia, scene: ReelScenePlan) {
    const query = (scene.mediaQuery ?? '').toLowerCase();
    const images = property.images.filter((u) => u.startsWith('http') || u.startsWith('/'));

    if (scene.type === 'IMAGE_FULL' || scene.type === 'BROLL_FULL' || scene.type === 'STAT_CARD') {
      const picked = this.pickImageByQuery(images, query);
      if (picked) return { url: picked, generatedAsset: false };
      if (property.mainImage) return { url: property.mainImage, generatedAsset: false };
      if (images[0]) return { url: images[0], generatedAsset: false };
    }

    return null;
  }

  private pickImageByQuery(images: string[], query: string): string | null {
    if (!images.length) return null;
    const idxMatch = query.match(/(?:image|photo|foto)[_\s-]?(\d+)/i);
    if (idxMatch) {
      const idx = Number.parseInt(idxMatch[1], 10) - 1;
      if (idx >= 0 && idx < images.length) return images[idx];
    }
    if (query.includes('main') || query.includes('cover') || query.includes('hero')) {
      return images[0] ?? null;
    }
    if (query.includes('interior') && images[1]) return images[1];
    if (query.includes('exterior') && images[2]) return images[2];
    return images[0] ?? null;
  }
}
