-- Migration: Add SMS-related fields to AdscapePlayer for post-payment SMS
-- Run this if columns are not created automatically by the server.

-- Send SMS after payment: on/off per screen
ALTER TABLE "AdscapePlayer"
ADD COLUMN IF NOT EXISTS "smsEnabled" BOOLEAN DEFAULT false;

-- Max SMS allowed for this screen (NULL = no limit)
ALTER TABLE "AdscapePlayer"
ADD COLUMN IF NOT EXISTS "smsLimitPerScreen" INTEGER;

-- Number of SMS sent for this screen (enforces limit)
ALTER TABLE "AdscapePlayer"
ADD COLUMN IF NOT EXISTS "smsSentCount" INTEGER DEFAULT 0;

COMMENT ON COLUMN "AdscapePlayer"."smsEnabled" IS 'Send SMS to user after payment completion';
COMMENT ON COLUMN "AdscapePlayer"."smsLimitPerScreen" IS 'Max SMS allowed for this screen (null = no limit)';
COMMENT ON COLUMN "AdscapePlayer"."smsSentCount" IS 'Number of SMS sent for this screen';
