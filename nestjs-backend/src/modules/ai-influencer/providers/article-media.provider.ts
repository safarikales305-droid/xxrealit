import { Injectable } from '@nestjs/common';
import type { ArticleForReel } from './ai-script.provider';
import type { ReelScenePlan } from '../ai-influencer.types';
import type { MediaProvider } from './media.provider';

@Injectable()
export class ArticleMediaProvider implements MediaProvider {
  async resolveSceneMedia(article: ArticleForReel, scene: ReelScenePlan) {
    const query = (scene.mediaQuery ?? '').toLowerCase();
    if (article.ogImageUrl?.trim()) {
      if (
        !query ||
        query.includes('article') ||
        query.includes('cover') ||
        query.includes('og') ||
        scene.type === 'IMAGE_FULL' ||
        scene.type === 'BROLL_FULL'
      ) {
        return { url: article.ogImageUrl.trim(), generatedAsset: false };
      }
    }
    return null;
  }
}
