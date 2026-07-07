import { Injectable, Logger } from '@nestjs/common';
import type { MetaCenterSetting } from '@prisma/client';
import { MetaGraphClientService } from './meta-graph-client.service';
import { formatMetaApiFailure } from './meta-campaign-api-payload.util';
import {
  isVideoCreativeType,
  normalizeCreativePayload,
  normalizeCreativeType,
  type MetaCampaignCreativePayload,
} from './meta-campaign-creative.util';
import type { MetaCreativeType } from './meta-marketing-platform.constants';

export type MetaCreativeBuildInput = {
  actId: string;
  token: string;
  campaignName: string;
  creativeType: string | undefined;
  creativePayload: Record<string, unknown> | undefined;
  pageId: string | null;
  instagramActorId: string | null;
  productSetId: string | null;
  frontendBase: string;
};

export type MetaCreativeBuildResult =
  | { ok: true; body: Record<string, string>; payload: MetaCampaignCreativePayload }
  | { ok: false; message: string; metaApiError?: ReturnType<typeof formatMetaApiFailure>['detail'] };

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
    const normalizedCta = this.normalizeCtaType(ctaType);

    let imageHash = payload.imageHash;
    if (!imageHash && payload.image && creativeType !== 'catalog_products') {
      imageHash =
        (await this.uploadAdImage(input.actId, input.token, payload.image)) ?? undefined;
    }

    let videoId = payload.videoId;
    if (!videoId && payload.video && isVideoCreativeType(creativeType)) {
      videoId = (await this.uploadAdVideo(input.actId, input.token, payload.video)) ?? undefined;
    }

    const enrichedPayload: MetaCampaignCreativePayload = {
      ...payload,
      imageHash,
      videoId,
      link: linkUrl,
      ctaType: normalizedCta,
    };

    const creativeBody: Record<string, string> = {
      name: `${input.campaignName.trim()} — kreativa`,
    };

    if (input.productSetId && input.pageId && creativeType === 'catalog_products') {
      creativeBody.product_set_id = input.productSetId;
      creativeBody.object_story_spec = JSON.stringify({
        page_id: input.pageId,
        ...(input.instagramActorId ? { instagram_actor_id: input.instagramActorId } : {}),
        template_data: {
          link: linkUrl,
          message: primaryText,
          name: headline,
          description,
          call_to_action: { type: normalizedCta, value: { link: linkUrl } },
        },
      });
      return { ok: true, body: creativeBody, payload: enrichedPayload };
    }

    if (payload.objectStoryId && input.pageId) {
      creativeBody.object_story_id = payload.objectStoryId;
      return { ok: true, body: creativeBody, payload: enrichedPayload };
    }

    if (!input.pageId && !payload.objectStoryId) {
      return {
        ok: false,
        message: 'Chybí Facebook Page ID pro vytvoření kreativy.',
      };
    }

    if (videoId && input.pageId) {
      creativeBody.object_story_spec = JSON.stringify({
        page_id: input.pageId,
        ...(input.instagramActorId ? { instagram_actor_id: input.instagramActorId } : {}),
        video_data: {
          video_id: videoId,
          message: primaryText,
          title: headline,
          link_description: description,
          call_to_action: { type: normalizedCta, value: { link: linkUrl } },
        },
      });
      return { ok: true, body: creativeBody, payload: enrichedPayload };
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
    } else if (payload.image) {
      linkData.picture = payload.image;
    }

    creativeBody.object_story_spec = JSON.stringify({
      page_id: input.pageId,
      ...(input.instagramActorId ? { instagram_actor_id: input.instagramActorId } : {}),
      link_data: linkData,
    });

    return { ok: true, body: creativeBody, payload: enrichedPayload };
  }

  async uploadAdImage(actId: string, token: string, imageUrl: string): Promise<string | null> {
    const res = await this.graph.post<{ images?: Record<string, { hash?: string }> }>(
      `/act_${actId.replace(/^act_/, '')}/adimages`,
      token,
      { url: imageUrl },
    );
    if (!res.ok) {
      this.logger.warn(`adimages upload failed: ${res.errorMessage}`);
      return null;
    }
    const images = res.data.images;
    if (!images) return null;
    const first = Object.values(images)[0];
    return first?.hash ?? null;
  }

  async uploadAdVideo(actId: string, token: string, videoUrl: string): Promise<string | null> {
    const res = await this.graph.post<{ id?: string }>(
      `/act_${actId.replace(/^act_/, '')}/advideos`,
      token,
      { file_url: videoUrl },
    );
    if (!res.ok) {
      this.logger.warn(`advideos upload failed: ${res.errorMessage}`);
      return null;
    }
    return res.data.id ?? null;
  }

  formatCreativeApiFailure(
    creativeBody: Record<string, string>,
    result: Awaited<ReturnType<MetaGraphClientService['post']>>,
  ) {
    return formatMetaApiFailure('Vytvoření kreativy', creativeBody, result);
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

  private normalizeCtaType(value: string): string {
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
    return 'LEARN_MORE';
  }
}
