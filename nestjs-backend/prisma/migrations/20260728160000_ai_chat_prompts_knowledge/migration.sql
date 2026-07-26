-- Rozšíření promptů a znalostí + audit logy
ALTER TABLE "AiPromptVersion" ADD COLUMN IF NOT EXISTS "name" TEXT;
ALTER TABLE "AiPromptVersion" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

ALTER TABLE "AiKnowledgeItem" ADD COLUMN IF NOT EXISTS "priority" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AiKnowledgeItem" ADD COLUMN IF NOT EXISTS "validFrom" TIMESTAMP(3);
ALTER TABLE "AiKnowledgeItem" ADD COLUMN IF NOT EXISTS "validTo" TIMESTAMP(3);
ALTER TABLE "AiKnowledgeItem" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "AiPromptAuditLog" (
    "id" TEXT NOT NULL,
    "promptId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousContent" TEXT,
    "newContent" TEXT,
    "changeDescription" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiPromptAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AiKnowledgeAuditLog" (
    "id" TEXT NOT NULL,
    "knowledgeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "previousAnswer" TEXT,
    "newAnswer" TEXT,
    "changeDescription" TEXT,
    "performedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiKnowledgeAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AiPromptAuditLog_promptId_idx" ON "AiPromptAuditLog"("promptId");
CREATE INDEX IF NOT EXISTS "AiKnowledgeAuditLog_knowledgeId_idx" ON "AiKnowledgeAuditLog"("knowledgeId");

-- Pouze jedna ACTIVE verze na feature (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS "AiPromptVersion_feature_active_unique"
ON "AiPromptVersion"("feature")
WHERE "status" = 'ACTIVE';
