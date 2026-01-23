-- Migration: Add gender and age fields to User table
-- Run this migration to add gender and age tracking fields to the User table

-- Add gender column (VARCHAR(10), nullable) - 'Male' or 'Female'
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "gender" VARCHAR(10);

-- Add age column (INTEGER, nullable) - Age in years
ALTER TABLE "User" 
ADD COLUMN IF NOT EXISTS "age" INTEGER;

-- Add comments for documentation
COMMENT ON COLUMN "User"."gender" IS 'Gender: Male or Female';
COMMENT ON COLUMN "User"."age" IS 'Age in years';
