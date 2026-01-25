-- Migration: Add healthTip column to BMI table
-- Stores locally-picked health tip from Android app (fortune.json / health.json).
-- Run on production before or after deploying code that sends healthTip.

ALTER TABLE "BMI"
ADD COLUMN IF NOT EXISTS "healthTip" TEXT;

COMMENT ON COLUMN "BMI"."healthTip" IS 'Locally-picked health tip from Android assets (by BMI category)';
