-- CreateTable
CREATE TABLE "PublicPortalStat" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "realValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "manualValue" DOUBLE PRECISION,
    "displayedValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "category" TEXT,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicPortalStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicPortalMonthlyStat" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "visits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "views" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "socialReach" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "leads" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicPortalMonthlyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadPrice" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceCzk" INTEGER NOT NULL DEFAULT 0,
    "priceCredits" INTEGER NOT NULL DEFAULT 0,
    "appliesToRoles" TEXT NOT NULL DEFAULT 'ALL',
    "billedToLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicPortalStat_key_key" ON "PublicPortalStat"("key");

-- CreateIndex
CREATE INDEX "PublicPortalStat_enabled_order_idx" ON "PublicPortalStat"("enabled", "order");

-- CreateIndex
CREATE UNIQUE INDEX "PublicPortalMonthlyStat_month_key" ON "PublicPortalMonthlyStat"("month");

-- CreateIndex
CREATE INDEX "PublicPortalMonthlyStat_enabled_month_idx" ON "PublicPortalMonthlyStat"("enabled", "month");

-- CreateIndex
CREATE INDEX "LeadPrice_active_order_idx" ON "LeadPrice"("active", "order");
