-- Metadata Marketing OAuth tokenu (scopes, expires_in, token_type)
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "marketingTokenExpiresIn" INTEGER;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "marketingTokenType" TEXT;
ALTER TABLE "MetaCenterSetting" ADD COLUMN IF NOT EXISTS "marketingGrantedScopes" JSONB;
