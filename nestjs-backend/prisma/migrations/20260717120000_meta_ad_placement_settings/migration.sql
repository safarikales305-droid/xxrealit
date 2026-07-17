-- Meta Centrum: placement targeting (facebook_positions / instagram_positions)
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "adPlacementSettings" JSONB;
