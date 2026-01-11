-- Migration: Add paymentStatus and paymentAmount fields to BMI table
-- Run this migration to add payment tracking fields to the BMI table

-- Add paymentStatus column (Boolean, defaults to false)
ALTER TABLE "BMI" 
ADD COLUMN IF NOT EXISTS "paymentStatus" BOOLEAN DEFAULT false;

-- Add paymentAmount column (Float, nullable)
ALTER TABLE "BMI" 
ADD COLUMN IF NOT EXISTS "paymentAmount" DOUBLE PRECISION;

-- Add comments for documentation
COMMENT ON COLUMN "BMI"."paymentStatus" IS 'Whether payment was completed for this BMI record';
COMMENT ON COLUMN "BMI"."paymentAmount" IS 'Actual amount paid by the user in rupees';
