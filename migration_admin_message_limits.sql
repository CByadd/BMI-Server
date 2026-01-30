-- Add total message limit to AdminUser (set by super admin when creating admin)
ALTER TABLE "AdminUser" ADD COLUMN IF NOT EXISTS "totalMessageLimit" INTEGER;

-- Add per-screen message limit to AdminScreenAssignment (admin allocates from total)
ALTER TABLE "AdminScreenAssignment" ADD COLUMN IF NOT EXISTS "messageLimit" INTEGER;

COMMENT ON COLUMN "AdminUser"."totalMessageLimit" IS 'Total message (SMS) limit for this admin; set by super admin';
COMMENT ON COLUMN "AdminScreenAssignment"."messageLimit" IS 'Message limit allocated to this screen by the admin';
