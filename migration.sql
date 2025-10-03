-- CreateTable
CREATE TABLE "Screen" (
    "id" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Screen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "mobile" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BMI" (
    "id" UUID NOT NULL,
    "screenId" TEXT NOT NULL,
    "userId" UUID,
    "heightCm" DOUBLE PRECISION NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "bmi" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" VARCHAR(255),
    "appVersion" VARCHAR(10),
    "location" VARCHAR(255),
    "fortune" TEXT,

    CONSTRAINT "BMI_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BMI_screenId_idx" ON "BMI"("screenId");

-- CreateIndex
CREATE INDEX "BMI_userId_idx" ON "BMI"("userId");

-- CreateIndex
CREATE INDEX "BMI_userId_timestamp_idx" ON "BMI"("userId", "timestamp");

-- AddForeignKey
ALTER TABLE "BMI" ADD CONSTRAINT "BMI_screenId_fkey" FOREIGN KEY ("screenId") REFERENCES "Screen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BMI" ADD CONSTRAINT "BMI_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

