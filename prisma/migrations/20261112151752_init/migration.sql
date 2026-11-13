-- CreateEnum
CREATE TYPE "Site" AS ENUM ('NAUKRI', 'HIRIST', 'INSTAHYRE', 'GREENHOUSE', 'LEVER', 'ASHBY', 'JSEARCH', 'ADZUNA', 'MANUAL');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('FOUND', 'SHORTLISTED', 'READY_FOR_REVIEW', 'APPROVED', 'NEEDS_USER', 'APPLIED', 'INTERVIEW', 'OFFER', 'REJECTED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "headline" TEXT,
    "totalExpMonths" INTEGER NOT NULL DEFAULT 0,
    "skills" TEXT[],
    "currentLocation" TEXT,
    "preferredCities" TEXT[],
    "currentCtcLpa" DECIMAL(6,2),
    "expectedCtcLpa" DECIMAL(6,2),
    "noticePeriodDays" INTEGER,
    "resumeData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteCredential" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "site" "Site" NOT NULL,
    "username" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "sessionEncrypted" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "site" "Site" NOT NULL,
    "externalId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "minExpYears" INTEGER,
    "maxExpYears" INTEGER,
    "salaryText" TEXT,
    "skills" TEXT[],
    "description" TEXT,
    "url" TEXT NOT NULL,
    "applyUrl" TEXT,
    "postedAt" TIMESTAMP(3),
    "raw" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "reasons" TEXT[],
    "gaps" TEXT[],
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'FOUND',
    "resumeText" TEXT,
    "coverLetter" TEXT,
    "answers" JSONB,
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_email_key" ON "Profile"("email");

-- CreateIndex
CREATE UNIQUE INDEX "SiteCredential_profileId_site_key" ON "SiteCredential"("profileId", "site");

-- CreateIndex
CREATE INDEX "Job_dedupeKey_idx" ON "Job"("dedupeKey");

-- CreateIndex
CREATE INDEX "Job_postedAt_idx" ON "Job"("postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_site_externalId_key" ON "Job"("site", "externalId");

-- CreateIndex
CREATE INDEX "JobMatch_profileId_score_idx" ON "JobMatch"("profileId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_profileId_jobId_key" ON "JobMatch"("profileId", "jobId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Application_profileId_jobId_key" ON "Application"("profileId", "jobId");

-- AddForeignKey
ALTER TABLE "SiteCredential" ADD CONSTRAINT "SiteCredential_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
