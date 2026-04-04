-- AlterEnum: UserRole bez ADMIN — existující ADMIN se mapuje na AGENT
BEGIN;

CREATE TYPE "UserRole_new" AS ENUM ('USER', 'AGENT', 'DEVELOPER');

ALTER TABLE "public"."User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole_new" USING (
  CASE "role"::text
    WHEN 'USER' THEN 'USER'::"UserRole_new"
    WHEN 'ADMIN' THEN 'AGENT'::"UserRole_new"
    WHEN 'AGENT' THEN 'AGENT'::"UserRole_new"
    WHEN 'DEVELOPER' THEN 'DEVELOPER'::"UserRole_new"
    ELSE 'USER'::"UserRole_new"
  END
);

ALTER TYPE "UserRole" RENAME TO "UserRole_old";
ALTER TYPE "UserRole_new" RENAME TO "UserRole";
DROP TYPE "public"."UserRole_old";

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";

COMMIT;
