-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_reviewedById_fkey";

-- DropIndex
DROP INDEX IF EXISTS "User_approvalStatus_createdAt_idx";

-- Rebuild UserRole to include BANNED; map REJECTED users to BANNED
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
ALTER TABLE "User" DROP COLUMN "approvalStatus",
DROP COLUMN "reviewedAt",
DROP COLUMN "reviewedById";

-- DropEnum
DROP TYPE "ApprovalStatus";

-- CreateIndex
CREATE INDEX "User_role_createdAt_idx" ON "User"("role", "createdAt");
