-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "entryId" TEXT,
    "action" TEXT NOT NULL,
    "memo" TEXT NOT NULL,
    "amount" INTEGER NOT NULL DEFAULT 0,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AuditEvent_businessId_createdAt_idx" ON "AuditEvent"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entryId_idx" ON "AuditEvent"("entryId");
