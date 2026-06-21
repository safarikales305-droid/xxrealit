CREATE TABLE "PurchaseAdviceArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'obecne',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseAdviceArticle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseAdviceArticle_isPublished_sortOrder_idx" ON "PurchaseAdviceArticle"("isPublished", "sortOrder");
CREATE INDEX "PurchaseAdviceArticle_category_idx" ON "PurchaseAdviceArticle"("category");
