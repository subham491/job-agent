-- CreateTable
CREATE TABLE "NaukriDay" (
    "date" DATE NOT NULL,
    "appearances" INTEGER,
    "refreshedAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "NaukriDay_pkey" PRIMARY KEY ("date")
);
