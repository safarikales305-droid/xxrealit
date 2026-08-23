import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const POST_ID = process.argv[2] || 'cmt67uier000zqfb5sjrfo3ae';

async function main() {
  const post = await prisma.post.findUnique({
    where: { id: POST_ID },
    include: { user: true },
  });
  if (!post) {
    console.log('POST NOT FOUND');
    return;
  }

  const idRows = await prisma.$queryRawUnsafe(`
    SELECT p.id
    FROM "Post" p
    INNER JOIN "User" u ON u.id = p."userId"
    WHERE p.type <> 'short'
      AND (
        (
          p.type IN ('COMPANY_REVIEW', 'NEWS_ARTICLE', 'YOUTUBE_VIDEO')
          AND p."publishedAt" IS NOT NULL
        )
        OR (
          p."publishedAt" IS NOT NULL
          AND u."accountLimited" = false
          AND (u.role <> 'PORTAL_WORKER' OR u."portalWorkerStatus" = 'APPROVED')
          AND u."publicProfile" = true
          AND u.role IN ('AGENT','COMPANY','AGENCY','FINANCIAL_ADVISOR','INVESTOR','PORTAL_WORKER')
        )
      )
    ORDER BY COALESCE(p."publishedAt", p."createdAt") DESC
    LIMIT 100
  `);

  const ids = idRows.map((r) => r.id);
  const inFeed = ids.includes(POST_ID);

  console.log(
    JSON.stringify(
      {
        post: {
          id: post.id,
          type: post.type,
          publishedAt: post.publishedAt,
          youtubeVideoId: post.youtubeVideoId,
        },
        user: {
          id: post.user.id,
          name: post.user.name,
          role: post.user.role,
          publicProfile: post.user.publicProfile,
          isSystemUser: post.user.isSystemUser,
        },
        inFeedTop100: inFeed,
        feedPosition: ids.indexOf(POST_ID),
        youtubeInFeed: ids.filter((id) =>
          ['cmt67uier000zqfb5sjrfo3ae', 'cmt67uacv000uqfb5cfuqwcjz'].includes(id),
        ),
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
