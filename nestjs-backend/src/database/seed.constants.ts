/** Served by the Next.js app from `public/videos/`. */
export const SEED_USER_EMAIL = 'seed@realestate.local';

/** Dev-only password for seed user (change in production). */
export const SEED_USER_PASSWORD = 'DevSeed!123';

/**
 * Veřejné HTTPS demo video (Big Buck Bunny sample) — aby `/feed/shorts` a VideoCard
 * měly v dev prostředí co přehrát; část seed inzerátů zůstane bez videa (klasický katalog).
 */
export const SEED_DEMO_VIDEO_MP4 =
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';

export const SEED_PROPERTIES = [
  {
    title: 'Luxusní vila',
    price: 12_000_000,
    location: 'Brno',
    videoUrl: SEED_DEMO_VIDEO_MP4,
  },
  {
    title: 'Moderní byt 2+kk',
    price: 5_500_000,
    location: 'Praha',
    videoUrl: SEED_DEMO_VIDEO_MP4,
  },
  {
    title: 'Stavební pozemek',
    price: 3_000_000,
    location: 'Ostrava',
    videoUrl: null,
  },
] as const;
