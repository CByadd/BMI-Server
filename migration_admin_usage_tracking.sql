-- Add usage tracking fields to AdminUser
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "smsUsedCount" INTEGER DEFAULT 0;
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "whatsappUsedCount" INTEGER DEFAULT 0;

COMMENT ON COLUMN "AdminUser"."smsUsedCount" IS 'Total SMS messages sent by this admin (across all assigned screens)';
COMMENT ON COLUMN "AdminUser"."whatsappUsedCount" IS 'Total WhatsApp messages sent by this admin (across all assigned screens)';
