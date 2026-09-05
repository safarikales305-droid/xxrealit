import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';
import type { ArticleForReel } from './ai-script.provider';
import type { ReelScenePlan } from '../ai-influencer.types';
import type { MediaProvider } from './media.provider';

function extractMarkdownImageUrls(markdown: string): string[] {
  const urls: string[] = [];
  const mdImg = /!\[[^\]]*]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = mdImg.exec(markdown)) !== null) {
    const url = m[1]?.trim().split(/\s/)[0];
    if (url?.startsWith('http')) urls.push(url);
  }
  const htmlImg = /<img[^>]+src=["']([^"']+)["']/gi;
  while ((m = htmlImg.exec(markdown)) !== null) {
    const url = m[1]?.trim();
    if (url?.startsWith('http')) urls.push(url);
  }
  return [...new Set(urls)];
}

@Injectable()
export class ArticleMediaProvider implements MediaProvider {
  constructor(private readonly prisma: PrismaService) {}

  async resolveSceneMedia(article: ArticleForReel, scene: ReelScenePlan) {
    const query = (scene.mediaQuery ?? '').toLowerCase();
    const images = await this.collectArticleImages(article);

    if (scene.type === 'IMAGE_FULL' || scene.type === 'BROLL_FULL' || scene.type === 'STAT_CARD') {
      const byIndex = this.pickImageByQuery(images, query);
      if (byIndex) return { url: byIndex, generatedAsset: false };
      if (images[0]) return { url: images[0], generatedAsset: false };
    }

    if (article.ogImageUrl?.trim()) {
      if (
        !query ||
        query.includes('article') ||
        query.includes('cover') ||
        query.includes('og')
      ) {
        return { url: article.ogImageUrl.trim(), generatedAsset: false };
      }
    }

    return null;
  }

  async collectArticleImages(article: ArticleForReel): Promise<string[]> {
    const urls: string[] = [];
    if (article.ogImageUrl?.trim()) urls.push(article.ogImageUrl.trim());

    const bodyUrls = extractMarkdownImageUrls(article.bodyMarkdown ?? '');
    urls.push(...bodyUrls);

    if (article.id) {
      const row = await this.prisma.newsArticle.findUnique({
        where: { id: article.id },
        select: { socialImageUrl: true, ogImageUrl: true },
      });
      if (row?.socialImageUrl?.trim()) urls.unshift(row.socialImageUrl.trim());
      if (row?.ogImageUrl?.trim() && !urls.includes(row.ogImageUrl.trim())) {
        urls.push(row.ogImageUrl.trim());
      }
    }

    return [...new Set(urls.filter((u) => u.startsWith('http')))];
  }

  private pickImageByQuery(images: string[], query: string): string | null {
    if (!images.length) return null;
    const idxMatch = query.match(/image[_\s-]?(\d+)/i);
    if (idxMatch) {
      const idx = Number.parseInt(idxMatch[1], 10) - 1;
      if (idx >= 0 && idx < images.length) return images[idx];
    }
    if (query.includes('second') && images[1]) return images[1];
    if (query.includes('third') && images[2]) return images[2];
    return images[0] ?? null;
  }
}
