ALTER TABLE "Post" ADD COLUMN "newsArticleId" TEXT;

ALTER TABLE "NewsArticle" ADD COLUMN "socialTitle" TEXT;
ALTER TABLE "NewsArticle" ADD COLUMN "socialExcerpt" TEXT;
ALTER TABLE "NewsArticle" ADD COLUMN "socialImageUrl" TEXT;

CREATE UNIQUE INDEX "Post_newsArticleId_key" ON "Post"("newsArticleId");

ALTER TABLE "Post" ADD CONSTRAINT "Post_newsArticleId_fkey" FOREIGN KEY ("newsArticleId") REFERENCES "NewsArticle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
