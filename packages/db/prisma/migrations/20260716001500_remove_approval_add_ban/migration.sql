-- Non-transactional by design: Prisma 7.8+ applies each statement separately on
-- PostgreSQL (no implicit batch transaction), which is required for CONCURRENTLY.
-- migration_lock.toml stays at the migrations root; there is no per-migration
-- companion file in this Prisma version.

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_reviewedById_fkey";

-- DropIndex (ShareUpdateExclusive instead of ACCESS EXCLUSIVE)
DROP INDEX CONCURRENTLY IF EXISTS "User_approvalStatus_createdAt_idx";

-- Rebuild UserRole to include BANNED; map REJECTED users to BANNED.
-- Each statement below is independently valid when run outside a transaction.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;

ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING (
  CASE
    WHEN "approvalStatus" = 'REJECTED' THEN 'BANNED'
    WHEN "role"::text = 'ADMIN' THEN 'ADMIN'
    ELSE 'USER'
  END
);

DROP TYPE "UserRole";

CREATE TYPE "UserRole" AS ENUM ('USER', 'BANNED', 'ADMIN');

ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::"UserRole");

ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER'::"UserRole";

-- AlterTable: remove approval fields
ALTER TABLE "User" DROP COLUMN "approvalStatus";

ALTER TABLE "User" DROP COLUMN "reviewedAt";

ALTER TABLE "User" DROP COLUMN "reviewedById";

-- DropEnum
DROP TYPE "ApprovalStatus";

-- CreateIndex (non-blocking build)
CREATE INDEX CONCURRENTLY "User_role_createdAt_idx" ON "User"("role", "createdAt");
