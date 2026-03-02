-- CreateTable
CREATE TABLE "prompt_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userLogin" TEXT,
    "userName" TEXT,
    "userAvatarUrl" TEXT,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "acceptedById" TEXT,
    "acceptedByName" TEXT,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "prompt_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_request_comments" (
    "id" TEXT NOT NULL,
    "promptRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userLogin" TEXT,
    "userName" TEXT NOT NULL,
    "userAvatarUrl" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "prompt_request_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_request_reactions" (
    "id" TEXT NOT NULL,
    "promptRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userLogin" TEXT,
    "userName" TEXT NOT NULL,
    "userAvatarUrl" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,

    CONSTRAINT "prompt_request_reactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompt_requests_owner_repo_status_idx" ON "prompt_requests"("owner", "repo", "status");

-- CreateIndex
CREATE INDEX "prompt_requests_userId_idx" ON "prompt_requests"("userId");

-- CreateIndex
CREATE INDEX "prompt_request_comments_promptRequestId_createdAt_idx" ON "prompt_request_comments"("promptRequestId", "createdAt");

-- CreateIndex
CREATE INDEX "prompt_request_comments_userId_idx" ON "prompt_request_comments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_request_reactions_promptRequestId_userId_content_key" ON "prompt_request_reactions"("promptRequestId", "userId", "content");

-- CreateIndex
CREATE INDEX "prompt_request_reactions_promptRequestId_idx" ON "prompt_request_reactions"("promptRequestId");

-- CreateIndex
CREATE INDEX "prompt_request_reactions_userId_idx" ON "prompt_request_reactions"("userId");
