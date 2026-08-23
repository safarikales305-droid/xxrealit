import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sources = await prisma.newsSource.findMany({
    where: { type: 'YOUTUBE_CHANNEL' },
    select: {
      id: true,
      name: true,
      youtubeImportedCount: true,
      channelId: true,
      lastVideoId: true,
    },
  });

  const ytPosts = await prisma.post.findMany({
    where: { type: 'YOUTUBE_VIDEO' },
    select: {
      id: true,
      youtubeVideoId: true,
      title: true,
      publishedAt: true,
      newsSourceId: true,
      createdAt: true,
      userId: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  const published = await prisma.newsArticle.findMany({
    where: { status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      portalPostId: true,
      publishedAt: true,
      ogImageUrl: true,
    },
    orderBy: { publishedAt: 'desc' },
    take: 20,
  });

  const missingPosts = await prisma.newsArticle.count({
    where: { status: 'PUBLISHED', portalPostId: null },
  });

  const feedVisibleYt = await prisma.post.count({
    where: { type: 'YOUTUBE_VIDEO', publishedAt: { not: null } },
  });

  console.log(
    JSON.stringify(
      {
        sources,
        ytPostCount: ytPosts.length,
        ytPosts,
        feedVisibleYt,
        publishedCount: published.length,
        missingPosts,
        published,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
