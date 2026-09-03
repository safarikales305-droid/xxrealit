import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import { DEFAULT_INSTAGRAM_POST_TEMPLATE } from './social-instagram.types';
import { resolvePublicPortalUrlForCaption } from './social-instagram-media.util';

export type InstagramCaptionVariables = {
  title?: string;
  description?: string;
  category?: string;
  location?: string;
  author?: string;
  portal_url?: string;
  hashtags?: string;
};

const TEMPLATE_KEY = 'social_instagram_post_template';

@Injectable()
export class SocialInstagramCaptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getTemplate(): Promise<string> {
    const row = await this.prisma.appSetting.findUnique({ where: { key: TEMPLATE_KEY } });
    const raw = row?.valueJson;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (raw && typeof raw === 'object' && 'template' in raw) {
      const t = (raw as { template?: unknown }).template;
      if (typeof t === 'string' && t.trim()) return t.trim();
    }
    return DEFAULT_INSTAGRAM_POST_TEMPLATE;
  }

  async updateTemplate(template: string): Promise<string> {
    const next = template.trim() || DEFAULT_INSTAGRAM_POST_TEMPLATE;
    await this.prisma.appSetting.upsert({
      where: { key: TEMPLATE_KEY },
      create: { key: TEMPLATE_KEY, valueJson: { template: next } },
      update: { valueJson: { template: next } },
    });
    return next;
  }

  applyTemplate(template: string, vars: InstagramCaptionVariables): string {
    const portal = vars.portal_url?.trim() || resolvePublicPortalUrlForCaption();
    const map: Record<string, string> = {
      title: vars.title?.trim() || '',
      description: vars.description?.trim() || '',
      category: vars.category?.trim() || '',
      location: vars.location?.trim() || '',
      author: vars.author?.trim() || '',
      portal_url: portal,
      hashtags: vars.hashtags?.trim() || '#xxrealit #reality #bydleni',
    };
    let out = template;
    for (const [key, value] of Object.entries(map)) {
      out = out.replaceAll(`{${key}}`, value);
    }
    return out
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+\n/g, '\n')
      .trim();
  }

  async buildCaption(vars: InstagramCaptionVariables): Promise<string> {
    const template = await this.getTemplate();
    return this.applyTemplate(template, vars);
  }
}
