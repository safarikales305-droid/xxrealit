import { Injectable, Logger } from '@nestjs/common';
import type { MetaCenterSetting } from '@prisma/client';
import { MetaGraphClientService } from './meta-graph-client.service';
import {
  formatMetaApiFailure,
  type MetaApiErrorDetail,
  type MetaLaunchStep,
} from './meta-campaign-api-payload.util';
import {
  isPostCreativeType,
  isVideoCreativeType,
  normalizeCreativePayload,
  normalizeCreativeType,
  type MetaCampaignCreativePayload,
} from './meta-campaign-creative.util';
import type { MetaCreativeType } from './meta-marketing-platform.constants';

export type MetaCreativeBuildInput = {
  actId: string;
  token: string;
  pageAccessToken?: string | null;
  campaignName: string;
  creativeType: string | undefined;
  creativePayload: Record<string, unknown> | undefined;
  pageId: string | null;
  instagramActorId: string | null;
  catalogId: string | null;
  productSetId: string | null;
  frontendBase: string;
};

export type MetaCreativeBuildResult =
  | { ok: true; body: Record<string, string>; payload: MetaCampaignCreativePayload }
  | {
      ok: false;
      message: string;
      launchStep: MetaLaunchStep;
      metaApiError?: MetaApiErrorDetail;
    };

@Injectable()
export class MetaCenterCreativeService {
  private readonly logger = new Logger(MetaCenterCreativeService.name);

  constructor(private readonly graph: MetaGraphClientService) {}

  async buildAdCreative(input: MetaCreativeBuildInput): Promise<MetaCreativeBuildResult> {
    const creativeType = normalizeCreativeType(input.creativeType);
    const payload = normalizeCreativePayload(input.creativePayload);
    const linkUrl = payload.link || payload.detailUrl || input.frontendBase;
    const primaryText = payload.primaryText || payload.text || input.campaignName;
    const headline = payload.headline || input.campaignName;
    const description = payload.description || '';
    const ctaType = payload.ctaType || payload.cta || 'LEARN_MORE';
    const normalizedCta = this.normalizeCtaType(ctaType, creativeType);

    let objectStoryId = payload.objectStoryId;

    if (isPostCreativeType(creativeType) && !objectStoryId) {
      if (!input.pageId) {
        return {
          ok: false,
          launchStep: 'creative',
          message:
            'Chybí Facebook Page ID — pro příspěvek portálu je nutná stránka v nastavení Meta Centra.',
        };
      }
      const postToken = input.pageAccessToken?.trim() || input.token;
      const postRes = await this.createUnpublishedPagePost({
        pageId: input.pageId,
        token: postToken,
        message: primaryText,
        link: linkUrl,
        picture: payload.image,
        name: headline,
      });
      if (!postRes.ok) {
        return {
          ok: false,
          launchStep: 'creative',
          message: postRes.message,
          metaApiError: postRes.metaApiError,
        };
      }
      objectStoryId = postRes.objectStoryId;
    }

    let imageHash = payload.imageHash;
    if (!imageHash && payload.image && creativeType !== 'catalog_products' && !objectStoryId) {
      const uploaded = await this.uploadAdImage(input.actId, input.token, payload.image);
      if (!uploaded.ok) {
        return {
          ok: false,
          launchStep: 'creative',
          message: uploaded.message,
          metaApiError: uploaded.metaApiError,
        };
      }
      imageHash = uploaded.hash;
    }

    let videoId = payload.videoId;
    if (!videoId && payload.video && isVideoCreativeType(creativeType)) {
      const uploaded = await this.uploadAdVideo(input.actId, input.token, payload.video);
      if (!uploaded.ok) {
        return {
          ok: false,
          launchStep: 'creative',
          message: uploaded.message,
          metaApiError: uploaded.metaApiError,
        };
      }
      videoId = uploaded.videoId;
    }

    const enrichedPayload: MetaCampaignCreativePayload = {
      ...payload,
      objectStoryId,
      imageHash,
      videoId,
      link: linkUrl,
      ctaType: normalizedCta,
    };

    const creativeName = `${input.campaignName.trim()} — kreativa`;
    const creativeBody: Record<string, string> = { name: creativeName };

    if (creativeType === 'catalog_products') {
      if (!input.pageId) {
        return {
          ok: false,
          launchStep: 'creative',
          message: 'Chybí Facebook Page ID pro katalogovou kreativu.',
        };
      }
      if (!input.catalogId) {
        return {
          ok: false,
          launchStep: 'creative',
          message: 'Chybí Catalog ID pro katalogovou kreativu.',
        };
      }
      if (!input.productSetId) {
        return {
          ok: false,
          launchStep: 'creative',
          message:
            'Chybí product set — pro katalogové produkty nelze vytvořit Dynamic Creative bez product_set_id.',
        };
      }

      creativeBody.product_set_id = input.productSetId;
      const catalogId = input.catalogId?.replace(/^catalog_/i, '') ?? '';
      creativeBody.object_story_spec = JSON.stringify({
        page_id: input.pageId,
        ...(input.instagramActorId ? { instagram_actor_id: input.instagramActorId } : {}),
        template_data: {
          catalog_id: catalogId,
          product_set_id: input.productSetId,
          link: linkUrl,
          message: primaryText,
          name: headline,
          description,
          call_to_action: { type: normalizedCta, value: { link: linkUrl } },
        },
      });
      return { ok: true, body: creativeBody, payload: enrichedPayload };
    }

    if (objectStoryId) {
      creativeBody.object_story_id = objectStoryId;
      return { ok: true, body: creativeBody, payload: enrichedPayload };
    }

    if (!input.pageId) {
      return {
        ok: false,
        launchStep: 'creative',
        message: 'Chybí Facebook Page ID pro vytvoření kreativy.',
      };
    }

    if (videoId && isVideoCreativeType(creativeType)) {
      let thumbnailUrl = payload.image;
      if (!thumbnailUrl) {
        thumbnailUrl = (await this.fetchVideoThumbnailUrl(videoId, input.token)) ?? undefined;
      }

      creativeBody.object_story_spec = JSON.stringify({
        page_id: input.pageId,
        ...(input.instagramActorId ? { instagram_actor_id: input.instagramActorId } : {}),
        video_data: {
          video_id: videoId,
          message: primaryText,
          title: headline,
          link_description: description,
          call_to_action: { type: normalizedCta, value: { link: linkUrl } },
          ...(thumbnailUrl ? { image_url: thumbnailUrl } : {}),
        },
      });
      return { ok: true, body: creativeBody, payload: enrichedPayload };
    }

    const needsImage =
      creativeType === 'custom_image' ||
      creativeType === 'listing' ||
      Boolean(payload.image);

    if (needsImage && !imageHash) {
      return {
        ok: false,
        launchStep: 'creative',
        message: payload.image
          ? 'Nahrání obrázku přes adimages selhalo — zkontrolujte URL a oprávnění reklamního účtu.'
          : 'Kreativa vyžaduje obrázek — vyberte inzerát s fotografií nebo nahrajte vlastní obrázek.',
      };
    }

    const linkData: Record<string, unknown> = {
      link: linkUrl,
      message: primaryText,
      name: headline,
      description,
      caption: linkUrl,
      call_to_action: { type: normalizedCta, value: { link: linkUrl } },
    };

    if (imageHash) {
      linkData.image_hash = imageHash;
    }

    creativeBody.object_story_spec = JSON.stringify({
      page_id: input.pageId,
      ...(input.instagramActorId ? { instagram_actor_id: input.instagramActorId } : {}),
      link_data: linkData,
    });

    return { ok: true, body: creativeBody, payload: enrichedPayload };
  }

  async createUnpublishedPagePost(input: {
    pageId: string;
    token: string;
    message: string;
    link?: string;
    picture?: string;
    name?: string;
  }): Promise<
    | { ok: true; objectStoryId: string }
    | { ok: false; message: string; metaApiError?: MetaApiErrorDetail }
  > {
    const body: Record<string, string> = {
      message: input.message,
      published: 'false',
    };
    if (input.link?.trim()) body.link = input.link.trim();
    if (input.picture?.trim()) body.picture = input.picture.trim();
    if (input.name?.trim()) body.name = input.name.trim();

    const res = await this.graph.post<{ id?: string }>(`/${input.pageId}/feed`, input.token, body);
    if (!res.ok || !res.data.id) {
      const failure = formatMetaApiFailure(
        'Vytvoření unpublished Page Post',
        body,
        res,
        'creative',
      );
      return { ok: false, message: failure.message, metaApiError: failure.detail };
    }

    this.logger.log(`[meta-creative] unpublished page post=${res.data.id}`);
    return { ok: true, objectStoryId: res.data.id };
  }

  async uploadAdImage(
    actId: string,
    token: string,
    imageUrl: string,
  ): Promise<
    | { ok: true; hash: string }
    | { ok: false; message: string; metaApiError?: MetaApiErrorDetail }
  > {
    const payload = { url: imageUrl };
    const res = await this.graph.post<{ images?: Record<string, { hash?: string }> }>(
      `/act_${actId.replace(/^act_/, '')}/adimages`,
      token,
      payload,
    );
    if (!res.ok) {
      const failure = formatMetaApiFailure('Nahrání obrázku (adimages)', payload, res, 'creative');
      this.logger.warn(`adimages upload failed: ${failure.message}`);
      return { ok: false, message: failure.message, metaApiError: failure.detail };
    }
    const images = res.data.images;
    const first = images ? Object.values(images)[0] : undefined;
    const hash = first?.hash;
    if (!hash) {
      return {
        ok: false,
        message: 'Meta adimages nevrátilo image_hash.',
      };
    }
    return { ok: true, hash };
  }

  async uploadAdVideo(
    actId: string,
    token: string,
    videoUrl: string,
  ): Promise<
    | { ok: true; videoId: string }
    | { ok: false; message: string; metaApiError?: MetaApiErrorDetail }
  > {
    const payload = { file_url: videoUrl };
    const res = await this.graph.post<{ id?: string }>(
      `/act_${actId.replace(/^act_/, '')}/advideos`,
      token,
      payload,
    );
    if (!res.ok || !res.data.id) {
      const failure = formatMetaApiFailure('Nahrání videa (advideos)', payload, res, 'creative');
      this.logger.warn(`advideos upload failed: ${failure.message}`);
      return { ok: false, message: failure.message, metaApiError: failure.detail };
    }
    return { ok: true, videoId: res.data.id };
  }

  async fetchVideoThumbnailUrl(videoId: string, token: string): Promise<string | null> {
    const res = await this.graph.get<{ picture?: string }>(`/${videoId}`, token, {
      fields: 'picture',
    });
    return res.ok ? res.data.picture ?? null : null;
  }

  async fetchCreativeThumbnailUrl(creativeId: string, token: string): Promise<string | null> {
    const res = await this.graph.get<{ thumbnail_url?: string }>(`/${creativeId}`, token, {
      fields: 'thumbnail_url',
    });
    return res.ok ? res.data.thumbnail_url ?? null : null;
  }

  async fetchAdPreviewHtml(adId: string, token: string): Promise<string | null> {
    const res = await this.graph.get<{ data?: Array<{ body?: string }> }>(`/${adId}/previews`, token, {
      ad_format: 'DESKTOP_FEED_STANDARD',
    });
    if (!res.ok) return null;
    return res.data.data?.[0]?.body ?? null;
  }

  formatCreativeApiFailure(
    creativeBody: Record<string, string>,
    result: Awaited<ReturnType<MetaGraphClientService['post']>>,
  ) {
    return formatMetaApiFailure('Vytvoření kreativy', creativeBody, result, 'creative');
  }

  resolvePageIds(settings: MetaCenterSetting | null): {
    pageId: string | null;
    instagramActorId: string | null;
  } {
    return {
      pageId: settings?.pageId?.trim() ?? process.env.FACEBOOK_PAGE_ID?.trim() ?? null,
      instagramActorId: settings?.instagramBusinessId?.trim() ?? null,
    };
  }

  private normalizeCtaType(value: string, creativeType: MetaCreativeType): string {
    const upper = value.trim().toUpperCase().replace(/\s+/g, '_');
    const known = new Set([
      'LEARN_MORE',
      'SHOP_NOW',
      'SIGN_UP',
      'CONTACT_US',
      'BOOK_TRAVEL',
      'GET_OFFER',
      'GET_QUOTE',
      'APPLY_NOW',
      'CALL_NOW',
      'SEND_MESSAGE',
    ]);
    if (known.has(upper)) return upper;
    if (value === 'Zjistit více') return 'LEARN_MORE';
    if (creativeType === 'catalog_products') return 'SHOP_NOW';
    return 'LEARN_MORE';
  }
}
