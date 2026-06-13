-- Reconciles drift between prisma/migrations and schema.prisma. The billing,
-- theme-store, and prompt-request models were previously applied to hosted
-- databases via `prisma db push` and never captured as migrations, so a fresh
-- `migrate deploy` produced a schema missing these columns/tables. Some of
-- these objects may already exist on databases that were db-pushed or whose
-- schema was mutated at runtime, so every statement here is written to be
-- idempotent (IF NOT EXISTS / guarded constraints).

-- AlterTable
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;

-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN IF NOT EXISTS "colorMode" TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE "user_settings" ALTER COLUMN "colorTheme" SET DEFAULT 'better-auth';

-- CreateTable
CREATE TABLE IF NOT EXISTS "subscription" (
    "id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" TEXT DEFAULT 'incomplete',
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "trialStart" TIMESTAMP(3),
    "trialEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN DEFAULT false,
    "cancelAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "seats" INTEGER,
    "billingInterval" TEXT,
    "stripeScheduleId" TEXT,

    CONSTRAINT "subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "usage_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "costUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "creditUsed" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "aiCallLogId" INTEGER,
    "stripeReported" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ai_call_logs" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "usageJson" TEXT,
    "costJson" TEXT,
    "usingOwnKey" BOOLEAN NOT NULL DEFAULT false,
    "conversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_call_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "credit_ledger" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,6) NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "spending_limit" (
    "userId" TEXT NOT NULL,
    "monthlyCapUsd" DECIMAL(10,2) NOT NULL DEFAULT 10.00,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spending_limit_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "prompt_requests" (
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
CREATE TABLE IF NOT EXISTS "prompt_request_comments" (
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
CREATE TABLE IF NOT EXISTS "prompt_request_reactions" (
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

-- CreateTable
CREATE TABLE IF NOT EXISTS "pr_overview_analyses" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "pullNumber" INTEGER NOT NULL,
    "headSha" TEXT NOT NULL,
    "analysisJson" TEXT NOT NULL,
    "createdAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,

    CONSTRAINT "pr_overview_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "theme_store_extensions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "repo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "manifestJson" TEXT NOT NULL,
    "dataJson" TEXT,
    "readmeHtml" TEXT,
    "iconUrl" TEXT,
    "license" TEXT,
    "authorGithubId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorAvatarUrl" TEXT,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TEXT NOT NULL,
    "updatedAt" TEXT NOT NULL,
    "dataCachedAt" TEXT,

    CONSTRAINT "theme_store_extensions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_theme_store_installs" (
    "userId" TEXT NOT NULL,
    "extensionId" TEXT NOT NULL,
    "installedAt" TEXT NOT NULL,

    CONSTRAINT "user_theme_store_installs_pkey" PRIMARY KEY ("userId","extensionId")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "usage_logs_aiCallLogId_key" ON "usage_logs"("aiCallLogId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "usage_logs_userId_createdAt_idx" ON "usage_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "usage_logs_stripeReported_createdAt_idx" ON "usage_logs"("stripeReported", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ai_call_logs_userId_createdAt_idx" ON "ai_call_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "credit_ledger_userId_expiresAt_idx" ON "credit_ledger"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "prompt_requests_owner_repo_status_idx" ON "prompt_requests"("owner", "repo", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "prompt_requests_userId_idx" ON "prompt_requests"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "prompt_request_comments_promptRequestId_createdAt_idx" ON "prompt_request_comments"("promptRequestId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "prompt_request_comments_userId_idx" ON "prompt_request_comments"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "prompt_request_reactions_promptRequestId_idx" ON "prompt_request_reactions"("promptRequestId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "prompt_request_reactions_userId_idx" ON "prompt_request_reactions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "prompt_request_reactions_promptRequestId_userId_content_key" ON "prompt_request_reactions"("promptRequestId", "userId", "content");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pr_overview_analyses_owner_repo_pullNumber_headSha_idx" ON "pr_overview_analyses"("owner", "repo", "pullNumber", "headSha");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "pr_overview_analyses_owner_repo_pullNumber_key" ON "pr_overview_analyses"("owner", "repo", "pullNumber");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "theme_store_extensions_slug_key" ON "theme_store_extensions"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "theme_store_extensions_type_idx" ON "theme_store_extensions"("type");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "theme_store_extensions_downloads_idx" ON "theme_store_extensions"("downloads");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "theme_store_extensions_owner_repo_key" ON "theme_store_extensions"("owner", "repo");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_theme_store_installs_userId_idx" ON "user_theme_store_installs"("userId");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_aiCallLogId_fkey" FOREIGN KEY ("aiCallLogId") REFERENCES "ai_call_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "usage_logs" ADD CONSTRAINT "usage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "ai_call_logs" ADD CONSTRAINT "ai_call_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "user_theme_store_installs" ADD CONSTRAINT "user_theme_store_installs_extensionId_fkey" FOREIGN KEY ("extensionId") REFERENCES "theme_store_extensions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
