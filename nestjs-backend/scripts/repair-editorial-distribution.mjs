import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SITE = (process.env.PUBLIC_SITE_URL ?? 'https://xxrealit.cz').replace(/\/$/, '');

function absUrl(raw) {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  if (v.startsWith('http')) return v;
  if (v.startsWith('/')) return `${SITE}${v}`;
  return v;
}

function articleImage(article) {
  const fallbacks = {
    hypoteky: '/images/news/hypoteky.svg',
    reality: '/images/news/reality.svg',
    bydleni: '/images/news/bydleni.svg',
  };
  const candidates = [
    article.socialImageUrl,
    article.ogImageUrl,
    fallbacks[article.category],
    '/images/aktuality-default-og.svg',
  ];
  for (const c of candidates) {
    const u = absUrl(c);
    if (u) return u;
  }
  return `${SITE}/images/aktuality-default-og.svg`;
}

function mapCategory(category) {
  switch (category) {
    case 'hypoteky':
      return 'FINANCNI_PORADCI';
    case 'stavebnictvi':
    case 'development':
    case 'rekonstrukce':
      return 'STAVEBNI_FIRMY';
    case 'investice':
      return 'INVESTORI';
    case 'reality':
    case 'najmy':
    case 'ceny-nemovitosti':
    case 'trh':
    case 'regiony':
      return 'REALITNI_KANCELARE';
    default:
      return 'MAKLERI';
  }
}

async function feedContains(postId) {
  const rows = await prisma.$queryRawUnsafe(`
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
    LIMIT 200
  `);
  return rows.some((r) => r.id === postId);
}

async function repairArticles(systemUserId) {
  const articles = await prisma.newsArticle.findMany({
    where: { status: 'PUBLISHED', portalPostId: null },
    include: { sources: { take: 1 } },
    orderBy: { publishedAt: 'asc' },
  });

  let created = 0;
  let errors = 0;
  const results = [];

  for (const article of articles) {
    try {
      const socialTitle = (article.socialTitle ?? article.title).trim().slice(0, 200);
      const socialExcerpt = (article.socialExcerpt ?? article.perex ?? '').trim().slice(0, 280);
      const articleUrl = `${SITE}${article.canonicalPath ?? `/aktuality/${article.slug}`}`;
      const imageUrl = articleImage(article);
      const primary = article.sources?.[0];
      const publishedAt = article.publishedAt ?? new Date();

      const post = await prisma.post.create({
        data: {
          userId: systemUserId,
          type: 'NEWS_ARTICLE',
          source: 'INTERNAL',
          likesAutopilotEnabled: true,
          lastAutopilotLikesAt: new Date(),
          newsArticleId: article.id,
          title: socialTitle,
          description: socialTitle,
          content: `${socialTitle}\n\n${socialExcerpt}\n\n👉 ${articleUrl}`,
          imageUrl,
          previewImage: imageUrl,
          previewTitle: socialTitle,
          previewDescription: socialExcerpt,
          previewSiteName: 'Redakce XXREALIT',
          externalUrl: articleUrl,
          slug: `aktualita-${article.slug}`.slice(0, 80),
          category: mapCategory(article.category),
          city: article.region ?? '',
          publishedAt,
          ...(primary?.sourceId ? { newsSourceId: primary.sourceId } : {}),
          media: { create: [{ url: imageUrl, type: 'image', order: 0 }] },
        },
      });

      await prisma.newsArticle.update({
        where: { id: article.id },
        data: {
          portalPostId: post.id,
          socialTitle,
          socialExcerpt,
          socialImageUrl: imageUrl,
        },
      });

      const inFeed = await feedContains(post.id);
      results.push({
        newsArticleId: article.id,
        portalPostId: post.id,
        foundInFeedApi: inFeed,
      });
      created += 1;
    } catch (err) {
      errors += 1;
      results.push({
        newsArticleId: article.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { found: articles.length, created, errors, results };
}

async function main() {
  const systemUser = await prisma.user.findFirst({
    where: { isSystemUser: true },
    select: { id: true, name: true },
  });
  if (!systemUser) {
    console.error('SYSTEM USER NOT FOUND');
    process.exit(1);
  }

  const ytPost = await prisma.post.findFirst({
    where: { type: 'YOUTUBE_VIDEO' },
    orderBy: { createdAt: 'desc' },
    select: { id: true, youtubeVideoId: true, publishedAt: true },
  });

  const articleRepair = await repairArticles(systemUser.id);

  let youtubeResult = null;
  if (ytPost) {
    if (!ytPost.publishedAt) {
      await prisma.post.update({
        where: { id: ytPost.id },
        data: { publishedAt: new Date() },
      });
    }
    youtubeResult = {
      youtubeVideoId: ytPost.youtubeVideoId,
      portalPostId: ytPost.id,
      foundInFeedApi: await feedContains(ytPost.id),
    };
  }

  const after = {
    publishedArticles: await prisma.newsArticle.count({ where: { status: 'PUBLISHED' } }),
    articlesWithPortalPost: await prisma.newsArticle.count({
      where: { status: 'PUBLISHED', portalPostId: { not: null } },
    }),
    youtubePosts: await prisma.post.count({ where: { type: 'YOUTUBE_VIDEO' } }),
  };

  console.log(
    JSON.stringify(
      {
        systemUser,
        articleRepair,
        youtubeResult,
        after,
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
