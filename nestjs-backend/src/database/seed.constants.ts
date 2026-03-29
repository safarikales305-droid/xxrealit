/** Served by the Next.js app from `public/videos/`. */
export const SEED_USER_EMAIL = 'seed@realestate.local';

export const SEED_PROPERTIES = [
  {
    title: 'Luxusní vila',
    price: 12_000_000,
    location: 'Brno',
    videoUrl: '/videos/vila.mp4',
  },
  {
    title: 'Moderní byt 2+kk',
    price: 5_500_000,
    location: 'Praha',
    videoUrl: '/videos/byt.mp4',
  },
  {
    title: 'Stavební pozemek',
    price: 3_000_000,
    location: 'Ostrava',
    videoUrl: '/videos/pozemek.mp4',
  },
] as const;
