-- AlterTable
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "smtpHost" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "smtpPort" INTEGER DEFAULT 465;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "smtpUser" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "smtpPass" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "smtpFromName" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "evolutionInstance" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "evolutionToken" TEXT;
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "whatsappStatus" TEXT NOT NULL DEFAULT 'disconnected';

UPDATE "Company" SET "slug" = LOWER(REGEXP_REPLACE(COALESCE("name", 'tenant'), '[^a-zA-Z0-9]+', '-', 'g')) || '-' || SUBSTRING("id" FROM LENGTH("id") - 3) WHERE "slug" IS NULL OR "slug" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "Company_slug_key" ON "Company"("slug");

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");
