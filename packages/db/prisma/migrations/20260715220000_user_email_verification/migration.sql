-- AlterTable
ALTER TABLE "User" ADD COLUMN "email" TEXT,
ADD COLUMN "emailNormalized" TEXT,
ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Backfill migrated accounts with verified local addresses
UPDATE "User"
SET
  "email" = "username" || '@compintel.local',
  "emailNormalized" = "username" || '@compintel.local',
  "emailVerifiedAt" = CURRENT_TIMESTAMP
WHERE "email" IS NULL;

-- Make email columns required after backfill
ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "emailNormalized" SET NOT NULL;

CREATE UNIQUE INDEX "User_emailNormalized_key" ON "User"("emailNormalized");

-- CreateTable
CREATE TABLE "EmailVerification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailVerification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmailVerification_userId_key" ON "EmailVerification"("userId");

ALTER TABLE "EmailVerification" ADD CONSTRAINT "EmailVerification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" TEXT NOT NULL,
    "tencentSesSecretId" TEXT NOT NULL DEFAULT '',
    "tencentSesSecretKey" TEXT NOT NULL DEFAULT '',
    "tencentSesFromAddress" TEXT NOT NULL DEFAULT '',
    "allowedEmailProviders" TEXT[] DEFAULT ARRAY['gmail', 'qq', '163', '126']::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedById" TEXT,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SystemSettings" ADD CONSTRAINT "SystemSettings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SystemSettings" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP);
