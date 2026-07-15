-- SES API credentials move to environment variables; do not persist in DB.
ALTER TABLE "SystemSettings" DROP COLUMN IF EXISTS "tencentSesSecretId";
ALTER TABLE "SystemSettings" DROP COLUMN IF EXISTS "tencentSesSecretKey";
