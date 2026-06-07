import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { resolvePropertyOgImageBest } from '../properties/og-image-probe.util';
import {
  isImportedProperty,
  isImportedListingPubliclyVisible,
} from '../properties/property-import-branch-visibility';
import {
  computeListingPublicStatus,
  isPropertyPubliclyListed,
} from '../properties/property-public-visibility';
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

  private routeExistsForType(type: string): boolean {
    const t = type.trim().toLowerCase();
    return ['shorts', 'listing-shorts', 'classic', 'listing', 'nemovitost', 'tip', 'tipar', 'tipy', 'tip-shorts', 'tipar-shorts'].includes(t);
  }

  async diagnoseShareUrl(
    id: string,
    type: string,
  ): Promise<{
    shareUrl: string;
    routeExists: boolean;
    apiStatus: number;
    listingFound: boolean;
    isImported: boolean;
    importBranchRequired: boolean;
    isVisible: boolean;
    isActive: boolean;
    reasonIfHidden: string | null;
  }> {
    const t = type.trim().toLowerCase();
    const trimmed = id.trim();

    if (t === 'tip' || t === 'tipar' || t === 'tipy' || t === 'tip-shorts' || t === 'tipar-shorts') {
      const post = await this.prisma.tiparPost.findFirst({
        where: { id: trimmed, deletedAt: null },
      });
      const isShorts = t === 'tip-shorts' || t === 'tipar-shorts' || Boolean(post?.isShorts);
      const shareUrl = post ? this.tipShareUrl(post.id, isShorts) : '';
      if (!post) {
        return {
          shareUrl,
          routeExists: this.routeExistsForType(type),
          apiStatus: 404,
          listingFound: false,
          isImported: false,
          importBranchRequired: false,
          isVisible: false,
          isActive: false,
          reasonIfHidden: 'Tip nenalezen',
        };
      }
      const visible = Boolean(post.isActive && post.approved);
      return {
        shareUrl,
        routeExists: this.routeExistsForType(type),
        apiStatus: visible ? 200 : 410,
        listingFound: true,
        isImported: false,
        importBranchRequired: false,
        isVisible: visible,
        isActive: Boolean(post.isActive),
        reasonIfHidden: visible ? null : 'Tip již není aktivní',
      };
    }

    const property = await this.prisma.property.findFirst({
      where: { id: trimmed, deletedAt: null },
      include: {
        importSourceBranch: {
          select: { enabled: true, isActive: true, deletedAt: true, isDeleted: true },
        },
      },
    });

    const contentType: 'classic' | 'shorts' =
      t === 'shorts' || t === 'listing-shorts'
        ? 'shorts'
        : property && this.isShortsListing(property)
          ? 'shorts'
          : 'classic';
    const shareUrl = property ? this.listingShareUrl(property.id, contentType) : '';

    if (!property) {
      return {
        shareUrl,
        routeExists: this.routeExistsForType(type),
        apiStatus: 404,
        listingFound: false,
        isImported: false,
        importBranchRequired: false,
        isVisible: false,
        isActive: false,
        reasonIfHidden: 'Inzerát nenalezen',
      };
    }

    const imported = isImportedProperty(property);
    const branchRequired = imported;
    const publicStatus = computeListingPublicStatus(property);
    const listed = isPropertyPubliclyListed(property);
    const importOk = isImportedListingPubliclyVisible(property);
    let reasonIfHidden: string | null = null;
    let apiStatus = 200;

    if (!property.approved) {
      reasonIfHidden = 'Inzerát čeká na schválení';
      apiStatus = 404;
    } else if (!listed) {
      reasonIfHidden =
        publicStatus === 'INACTIVE' || publicStatus === 'EXPIRED'
          ? 'Inzerát již není aktivní'
          : `Stav inzerátu: ${publicStatus}`;
      apiStatus = 410;
    } else if (!importOk) {
      reasonIfHidden = 'Importní větev je vypnutá nebo chybí';
      apiStatus = 404;
    }

    return {
      shareUrl,
      routeExists: this.routeExistsForType(type),
      apiStatus,
      listingFound: true,
      isImported: imported,
      importBranchRequired: branchRequired,
      isVisible: Boolean(property.isVisible),
      isActive: Boolean(property.isActive),
      reasonIfHidden,
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
