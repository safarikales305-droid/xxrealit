-- AlterTable
ALTER TABLE "User" ADD COLUMN "firstContentCompleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RegistrationGateSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "requireFirstContent" BOOLEAN NOT NULL DEFAULT false,
    "shortsGateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shortsGateAfterViews" INTEGER NOT NULL DEFAULT 4,
    "gateType" TEXT NOT NULL DEFAULT 'BANNER',
    "title" TEXT NOT NULL DEFAULT 'Založte si účet na XXrealit',
    "description" TEXT NOT NULL DEFAULT 'Inzerujte, tipujte a vydělávejte s portálem XXrealit.',
    "buttonText" TEXT NOT NULL DEFAULT 'Založit účet',
    "videoUrl" TEXT,
    "bannerImageUrl" TEXT,
    "skipAfterSeconds" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationGateSetting_pkey" PRIMARY KEY ("id")
);
