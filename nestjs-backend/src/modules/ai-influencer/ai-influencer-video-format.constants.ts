/** Jediný podporovaný výstupní formát AI Influencer Reel videa. */
export const AI_INFLUENCER_VIDEO_FORMAT = 'VERTICAL_SHORT_9_16' as const;

export type AiInfluencerVideoFormatId = typeof AI_INFLUENCER_VIDEO_FORMAT;

export const AI_INFLUENCER_OUTPUT = {
  format: AI_INFLUENCER_VIDEO_FORMAT,
  width: 1080,
  height: 1920,
  aspectRatio: '9:16',
  videoCodec: 'h264',
  audioCodec: 'aac',
  container: 'mp4',
} as const;
