-- Legacy placeholder migration; keeps deploy consistent if directory exists.
CREATE TABLE IF NOT EXISTS "public"."Visit" (
  "id" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Visit_pkey" PRIMARY KEY ("id")
);
