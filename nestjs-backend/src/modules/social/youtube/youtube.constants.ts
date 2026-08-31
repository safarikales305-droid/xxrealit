export const YOUTUBE_OAUTH_AUTHORIZE = 'https://accounts.google.com/o/oauth2/v2/auth';
export const YOUTUBE_OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
export const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
export const YOUTUBE_UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';

export const YOUTUBE_OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

export const YOUTUBE_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

/** YouTube category: News & Politics — vhodné pro realitní obsah */
export const YOUTUBE_DEFAULT_CATEGORY_ID = '25';

export const YOUTUBE_PUBLISH_QUEUE_CONCURRENCY = 1;

export type YoutubePrivacyStatus = 'public' | 'unlisted' | 'private';
