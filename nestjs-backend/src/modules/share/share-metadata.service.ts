import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { resolvePropertyOgImageBest } from '../properties/og-image-probe.util';
import {
  getPortalLogoFallbackUrl,
  getSiteOriginForOg,
  propertyHasListingMedia,
} from '../properties/property-og-media.util';
import {
  DEFAULT_SHARE_TEXTS,
  type ShareContentType,
  ShareTextsSettingsService,
} from './share-texts-settings.service';

export type ShareMetadataResult = {
  shareUrl: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  contentType: ShareContentType;
  priceIncluded: false;
  adminTextSource: string;
  isLogoFallback: boolean;
  warning: string | null;
};

@Injectable()
export class ShareMetadataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shareTexts: ShareTextsSettingsService,
  ) {}

  isShortsListing(p: { listingType?: string | null; videoUrl?: string | null }): boolean {
    return (
      String(p.listingType ?? '').toUpperCase() === 'SHORTS' || Boolean(p.videoUrl?.trim())
    );
  }

  listingShareUrl(id: string, contentType: 'classic' | 'shorts'): string {
    const origin = getSiteOriginForOg();
    return contentType === 'shorts'
      ? `${origin}/shorts/${encodeURIComponent(id)}`
      : `${origin}/nemovitost/${encodeURIComponent(id)}`;
  }

  tipShareUrl(id: string, isShorts: boolean): string {
    const origin = getSiteOriginForOg();
    return isShorts
      ? `${origin}/shorts/tip/${encodeURIComponent(id)}`
      : `${origin}/tipy/${encodeURIComponent(id)}`;
  }

  async resolveForProperty(
    propertyId: string,
    forcedType?: 'classic' | 'shorts',
  ): Promise<ShareMetadataResult> {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId.trim(), deletedAt: null },
      select: {
        id: true,
        listingType: true,
        videoUrl: true,
        thumbnailUrl: true,
        mainImage: true,
        images: true,
        generatedVideoThumbnail: true,
      },
    });
    if (!property) throw new NotFoundException('Inzerát nenalezen');

    const contentType: ShareContentType =
      forcedType ?? (this.isShortsListing(property) ? 'shorts' : 'classic');
    const settings = await this.shareTexts.getSettings();
    const { title, description, adminTextSource } = this.shareTexts.textsForType(
      contentType,
      settings,
    );
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

    const warning =
      resolved.isLogoFallback && propertyHasListingMedia(property)
        ? 'Listing has images but OG selected logo'
        : null;

    return {
      shareUrl: this.listingShareUrl(property.id, contentType),
      ogTitle: title,
      ogDescription: description.slice(0, 160),
      ogImage: resolved.url,
      contentType,
      priceIncluded: false,
      adminTextSource,
      isLogoFallback: resolved.isLogoFallback,
      warning,
    };
  }

  async resolveForTip(tipId: string, forcedShorts?: boolean): Promise<ShareMetadataResult> {
    const post = await this.prisma.tiparPost.findFirst({
      where: { id: tipId.trim(), deletedAt: null, isActive: true, approved: true },
    });
    if (!post) {
      throw new NotFoundException('Tip nenalezen');
    }
    const id = post.id;
    const isShorts = forcedShorts ?? Boolean(post.isShorts);
    const contentType: ShareContentType = isShorts ? 'tip-shorts' : 'tip';
    const settings = await this.shareTexts.getSettings();
    const { title, description, adminTextSource } = this.shareTexts.textsForType(
      contentType,
      settings,
    );

    const imageRaw =
      post.mainImage?.trim() ||
      post.images[0]?.trim() ||
      post.generatedVideoUrl?.trim() ||
      post.videoUrl?.trim() ||
      '';

    let ogImage = getPortalLogoFallbackUrl();
    if (imageRaw) {
      const resolved = await resolvePropertyOgImageBest(
        {
          thumbnailUrl: imageRaw,
          mainImage: imageRaw,
          images: post.images,
          generatedVideoThumbnail: post.generatedVideoUrl,
          videoUrl: post.videoUrl,
        },
        getPortalLogoFallbackUrl(),
      );
      ogImage = resolved.url;
    }

    return {
      shareUrl: this.tipShareUrl(id, isShorts),
      ogTitle: title,
      ogDescription: description.slice(0, 160),
      ogImage,
      contentType,
      priceIncluded: false,
      adminTextSource,
      isLogoFallback: ogImage.includes('/icons/'),
      warning: null,
    };
  }

  async resolveByType(type: string, id: string): Promise<ShareMetadataResult> {
    const t = type.trim().toLowerCase();
    if (t === 'shorts' || t === 'listing-shorts') {
      return this.resolveForProperty(id, 'shorts');
    }
    if (t === 'classic' || t === 'listing' || t === 'nemovitost') {
      return this.resolveForProperty(id, 'classic');
    }
    if (t === 'tip-shorts' || t === 'tipar-shorts') {
      return this.resolveForTip(id, true);
    }
    if (t === 'tip' || t === 'tipar' || t === 'tipy') {
      return this.resolveForTip(id, false);
    }
    throw new NotFoundException(`Neznámý typ sdílení: ${type}`);
  }
}
