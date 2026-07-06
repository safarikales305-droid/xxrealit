import type { ListingPost } from '@/lib/nest-client';
import { nestAbsoluteAssetUrl } from '@/lib/api';
import { absoluteShareUrl } from '@/lib/public-share-url';
import {
  isFacebookImportPost,
  resolveFacebookPostMedia,
} from '@/lib/facebook-post-media';

export type MetaCentrumPromoteParams = {
  name: string;
  text: string;
  image?: string;
  video?: string;
  author?: string;
  cta?: string;
  budget?: number;
  cityName?: string;
  startDate?: string;
  postId?: string;
};

export function extractPromoteParamsFromPost(post: ListingPost): MetaCentrumPromoteParams {
  const id = String(post.id ?? '');
  const media = resolveFacebookPostMedia(post);
  const text = String(post.description ?? post.title ?? '').trim();
  const author = String(post.user?.name ?? '').trim();
  const image =
    media.mode === 'image' && media.imageUrl
      ? nestAbsoluteAssetUrl(media.imageUrl)
      : post.media?.[0]?.url
        ? nestAbsoluteAssetUrl(String(post.media[0].url))
        : undefined;
  const video =
    media.mode === 'video' && media.videoUrl
      ? nestAbsoluteAssetUrl(media.videoUrl)
      : undefined;

  return {
    name: text.slice(0, 80) || `Příspěvek ${id.slice(0, 8)}`,
    text,
    image,
    video,
    author,
    cta: 'LEARN_MORE',
    postId: id,
    cityName: String(post.city ?? '').trim() || undefined,
  };
}

export function buildMetaCentrumPromoteUrl(params: MetaCentrumPromoteParams): string {
  const q = new URLSearchParams();
  q.set('tab', 'campaigns');
  q.set('promote', 'social_post');
  q.set('creativeType', 'social_post');
  q.set('name', params.name);
  q.set('text', params.text);
  if (params.image) q.set('image', params.image);
  if (params.video) q.set('video', params.video);
  if (params.author) q.set('author', params.author);
  if (params.cta) q.set('cta', params.cta);
  if (params.budget != null) q.set('budget', String(params.budget));
  if (params.cityName) q.set('cityName', params.cityName);
  if (params.startDate) q.set('startDate', params.startDate);
  if (params.postId) q.set('postId', params.postId);
  return `/admin/marketing/meta-centrum?${q.toString()}`;
}

export function buildMetaCentrumPromoteUrlFromPost(post: ListingPost): string {
  return buildMetaCentrumPromoteUrl(extractPromoteParamsFromPost(post));
}

export function isPromotablePost(post: ListingPost): boolean {
  if (isFacebookImportPost(post)) return true;
  const text = String(post.description ?? '').trim();
  const media = resolveFacebookPostMedia(post);
  return Boolean(text || media.mode !== 'none');
}
