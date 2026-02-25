/*
  Warnings:

  - You are about to drop the `github_accounts` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "chat_conversations" ADD COLUMN     "activeStreamId" TEXT;

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "partsJson" TEXT;

-- AlterTable
ALTER TABLE "session" ADD COLUMN     "impersonatedBy" TEXT;

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "aiMessageCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "banExpires" TIMESTAMP(3),
ADD COLUMN     "banReason" TEXT,
ADD COLUMN     "banned" BOOLEAN DEFAULT false,
ADD COLUMN     "githubPat" TEXT,
ADD COLUMN     "lastActiveAt" TIMESTAMP(3),
ADD COLUMN     "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "role" TEXT;

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "onboardingDone" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "github_accounts";

-- CreateTable
CREATE TABLE "pinned_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "pinnedAt" TEXT NOT NULL,

    CONSTRAINT "pinned_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pinned_items_userId_owner_repo_idx" ON "pinned_items"("userId", "owner", "repo");

-- CreateIndex
CREATE UNIQUE INDEX "pinned_items_userId_owner_repo_url_key" ON "pinned_items"("userId", "owner", "repo", "url");

-- CreateIndex
CREATE INDEX "account_userId_providerId_idx" ON "account"("userId", "providerId");

-- CreateIndex
CREATE INDEX "session_userId_expiresAt_idx" ON "session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "user_githubPat_email_idx" ON "user"("githubPat", "email");

-- CreateIndex
CREATE INDEX "verification_identifier_expiresAt_idx" ON "verification"("identifier", "expiresAt");
