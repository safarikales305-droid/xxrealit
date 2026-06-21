-- Safe repair: ensure Post rows exist before Media.postId FK (no data reset).
-- Step 1: report orphans via DELETE (Media without matching Post cannot be linked).
DELETE FROM "Media"
WHERE NOT EXISTS (
  SELECT 1 FROM "Post" AS p WHERE p."id" = "Media"."postId"
);

-- Step 2: add FK only when every remaining Media.postId references Post.id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Media_postId_fkey'
      AND conrelid = '"Media"'::regclass
  ) THEN
    ALTER TABLE "Media"
      ADD CONSTRAINT "Media_postId_fkey"
      FOREIGN KEY ("postId") REFERENCES "Post"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
