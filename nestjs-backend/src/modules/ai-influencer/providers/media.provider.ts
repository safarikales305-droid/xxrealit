import type { ArticleForReel } from './ai-script.provider';
import type { ReelScenePlan } from '../ai-influencer.types';

export type ResolvedSceneMedia = {
  url: string;
  generatedAsset: boolean;
};

export interface MediaProvider {
  resolveSceneMedia(article: ArticleForReel, scene: ReelScenePlan): Promise<ResolvedSceneMedia | null>;
}
