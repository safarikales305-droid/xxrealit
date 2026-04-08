DO $$ BEGIN
  CREATE TYPE "PostCategory" AS ENUM ('MAKLERI', 'STAVEBNI_FIRMY', 'REMESLNICI', 'REALITNI_KANCELARE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ReactionType" AS ENUM ('LIKE', 'DISLIKE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Post"
ADD COLUMN IF NOT EXISTS "category" "PostCategory" NOT NULL DEFAULT 'MAKLERI';

CREATE TABLE IF NOT EXISTS "PostReaction" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "type" "ReactionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PostReaction_userId_postId_key" ON "PostReaction"("userId", "postId");
CREATE INDEX IF NOT EXISTS "PostReaction_postId_idx" ON "PostReaction"("postId");
CREATE INDEX IF NOT EXISTS "PostReaction_userId_idx" ON "PostReaction"("userId");

DO $$ BEGIN
  ALTER TABLE "PostReaction"
  ADD CONSTRAINT "PostReaction_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "PostReaction"
  ADD CONSTRAINT "PostReaction_postId_fkey"
  FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
