-- Add WhatsApp limit to AdminUser (set by super admin when creating admin)
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "totalWhatsAppLimit" INTEGER;

-- Add per-screen WhatsApp limit to AdminScreenAssignment (admin allocates from total)
ALTER TABLE "AdminScreenAssignment" ADD COLUMN IF NOT EXISTS "whatsappLimit" INTEGER;

-- Add WhatsApp fields to AdscapePlayer (per-screen toggle and limits)
ALTER TABLE "AdscapePlayer" ADD COLUMN IF NOT EXISTS "whatsappEnabled" BOOLEAN DEFAULT false;
ALTER TABLE "AdscapePlayer" ADD COLUMN IF NOT EXISTS "whatsappLimitPerScreen" INTEGER;
ALTER TABLE "AdscapePlayer" ADD COLUMN IF NOT EXISTS "whatsappSentCount" INTEGER DEFAULT 0;

COMMENT ON COLUMN "AdminUser"."totalWhatsAppLimit" IS 'Total WhatsApp message limit for this admin; set by super admin';
COMMENT ON COLUMN "AdminScreenAssignment"."whatsappLimit" IS 'WhatsApp message limit allocated to this screen by the admin';
COMMENT ON COLUMN "AdscapePlayer"."whatsappEnabled" IS 'Send WhatsApp to user after payment completion';
COMMENT ON COLUMN "AdscapePlayer"."whatsappLimitPerScreen" IS 'Max WhatsApp messages allowed for this screen (null = no limit)';
COMMENT ON COLUMN "AdscapePlayer"."whatsappSentCount" IS 'Number of WhatsApp messages sent for this screen';
