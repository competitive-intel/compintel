-- AlterTable
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "turnstileSiteKey" TEXT NOT NULL DEFAULT '';
ALTER TABLE "SystemSettings" ADD COLUMN IF NOT EXISTS "turnstileSecretKey" TEXT NOT NULL DEFAULT '';

-- Expand legacy short provider names (e.g. gmail → gmail.com) for full-domain matching.
UPDATE "SystemSettings"
SET "allowedEmailProviders" = ARRAY(
  SELECT CASE
    WHEN position('.' IN provider) > 0 THEN provider
    ELSE provider || '.com'
  END
  FROM unnest("allowedEmailProviders") AS provider
)
WHERE EXISTS (
  SELECT 1
  FROM unnest("allowedEmailProviders") AS provider
  WHERE position('.' IN provider) = 0
);

-- Align default for new rows.
ALTER TABLE "SystemSettings"
  ALTER COLUMN "allowedEmailProviders"
  SET DEFAULT ARRAY['gmail.com', 'qq.com', '163.com', '126.com']::TEXT[];
