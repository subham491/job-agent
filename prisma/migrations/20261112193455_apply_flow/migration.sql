-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "angelMode" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Answer_key_key" ON "Answer"("key");
