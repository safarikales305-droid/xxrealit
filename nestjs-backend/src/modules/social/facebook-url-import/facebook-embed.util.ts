import type { FacebookPostType } from '@prisma/client';

const VIDEO_RE =
  /\/reel\/|\/watch\/?|\/videos\/|\/video\.php|\/share\/v\/|\/share\/r\//i;

export function detectFacebookPostType(url: string): FacebookPostType {
  const lower = url.toLowerCase();
  if (/\/reel\//i.test(lower) || /\/share\/r\//i.test(lower)) {
    return 'FACEBOOK_REEL';
  }
  if (VIDEO_RE.test(lower)) {
    return 'FACEBOOK_VIDEO';
  }
  return 'FACEBOOK_POST';
}

export function buildFacebookEmbedUrl(
  permalink: string,
  postType: FacebookPostType,
): string {
  const encoded = encodeURIComponent(permalink.trim());
  if (postType === 'FACEBOOK_VIDEO' || postType === 'FACEBOOK_REEL') {
    return `https://www.facebook.com/plugins/video.php?href=${encoded}&show_text=true&width=500`;
  }
  return `https://www.facebook.com/plugins/post.php?href=${encoded}&show_text=true&width=500`;
}

export function isFacebookVideoType(postType: FacebookPostType | null | undefined): boolean {
  return postType === 'FACEBOOK_VIDEO' || postType === 'FACEBOOK_REEL';
}
