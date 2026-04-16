-- Add real views system + admin autopilot controls for shorts/video listings
ALTER TABLE "Property"
ADD COLUMN "viewsCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "autoViewsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "autoViewsIncrement" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN "autoViewsIntervalMinutes" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "lastAutoViewsAt" TIMESTAMP(3);

ALTER TABLE "Property"
ADD CONSTRAINT "Property_viewsCount_non_negative" CHECK ("viewsCount" >= 0),
ADD CONSTRAINT "Property_autoViewsIncrement_positive" CHECK ("autoViewsIncrement" > 0),
ADD CONSTRAINT "Property_autoViewsIntervalMinutes_positive" CHECK ("autoViewsIntervalMinutes" > 0);
