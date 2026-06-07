import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  isImportedProperty,
  isImportedListingPubliclyVisible,
} from '../properties/property-import-branch-visibility';
import {
  computeListingPublicStatus,
  isPropertyPubliclyListed,
} from '../properties/property-public-visibility';
import { resolvePropertyOgImageBest } from '../properties/og-image-probe.util';
import {
  appendOgImageCacheVersion,
  getPortalLogoFallbackUrl,
  getSiteOriginForOg,
  propertyHasListingMedia,
  resolvePropertyOgImageWithSource,
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
        facebookShareImageUrl: true,
        images: true,
        generatedVideoThumbnail: true,
        facebookShareImageAt: true,
        createdAt: true,
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
    const resolved = resolvePropertyOgImageWithSource(
      {
        facebookShareImageUrl: property.facebookShareImageUrl,
        thumbnailUrl: property.thumbnailUrl,
        mainImage: property.mainImage,
        images: property.images,
        generatedVideoThumbnail: property.generatedVideoThumbnail,
        videoUrl: property.videoUrl,
      },
      getPortalLogoFallbackUrl(),
    );
    const versionMs =
      property.facebookShareImageAt?.getTime() ?? property.createdAt.getTime();
    const ogImage = appendOgImageCacheVersion(resolved.url, versionMs);

    const warning =
      resolved.isLogoFallback && propertyHasListingMedia(property)
        ? 'Listing has images but OG selected logo'
        : null;

    return {
      shareUrl: this.listingShareUrl(property.id, contentType),
      ogTitle: title,
      ogDescription: description.slice(0, 160),
      ogImage,
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
      include: {
        publishedProperty: {
          select: {
            facebookShareImageUrl: true,
            facebookShareImageAt: true,
            thumbnailUrl: true,
            mainImage: true,
            images: true,
            generatedVideoThumbnail: true,
            videoUrl: true,
            createdAt: true,
          },
        },
      },
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

    const pub = post.publishedProperty;
    const ogInput = {
      facebookShareImageUrl: pub?.facebookShareImageUrl ?? null,
      thumbnailUrl: pub?.thumbnailUrl ?? post.mainImage,
      mainImage: pub?.mainImage ?? post.mainImage,
      images: pub?.images?.length ? pub.images : post.images,
      generatedVideoThumbnail: pub?.generatedVideoThumbnail ?? post.generatedVideoUrl,
      videoUrl: pub?.videoUrl ?? post.videoUrl,
    };
    const resolved = await resolvePropertyOgImageBest(ogInput, getPortalLogoFallbackUrl());
    const versionMs =
      pub?.facebookShareImageAt?.getTime() ??
      pub?.createdAt?.getTime() ??
      post.updatedAt.getTime();
    const ogImage = appendOgImageCacheVersion(resolved.url, versionMs);

    return {
      shareUrl: this.tipShareUrl(id, isShorts),
      ogTitle: title,
      ogDescription: description.slice(0, 160),
      ogImage,
      contentType,
      priceIncluded: false,
      adminTextSource,
      isLogoFallback: resolved.isLogoFallback,
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
