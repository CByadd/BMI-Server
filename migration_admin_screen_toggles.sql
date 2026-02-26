-- Add smsEnabled and whatsappEnabled toggles to AdminScreenAssignment
ALTER TABLE "AdminScreenAssignment" ADD COLUMN IF NOT EXISTS "smsEnabled" BOOLEAN DEFAULT TRUE;
ALTER TABLE "AdminScreenAssignment" ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN "AdminScreenAssignment"."smsEnabled" IS 'Whether SMS is enabled for this screen assignment';
COMMENT ON COLUMN "AdminScreenAssignment"."whatsappEnabled" IS 'Whether WhatsApp is enabled for this screen assignment';
