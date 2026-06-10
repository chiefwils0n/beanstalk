-- CreateTable
CREATE TABLE "Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
    "driveFolderId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "taxLine" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    CONSTRAINT "Account_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "memo" TEXT NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "invoiceId" TEXT,
    "recurringId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntry_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#10b981',
    CONSTRAINT "Tag_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntryTag" (
    "entryId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    PRIMARY KEY ("entryId", "tagId"),
    CONSTRAINT "EntryTag_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EntryTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    CONSTRAINT "Customer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issueDate" DATETIME NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Invoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "invoiceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" REAL NOT NULL DEFAULT 1,
    "unitPrice" INTEGER NOT NULL DEFAULT 0,
    "amount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceItem_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurringTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memo" TEXT,
    "frequency" TEXT NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "nextRun" DATETIME NOT NULL,
    "endDate" DATETIME,
    "lastRun" DATETIME,
    "autoPost" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "RecurringTransaction_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RecurringLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recurringId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "description" TEXT,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RecurringLine_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "driveFileId" TEXT NOT NULL,
    "webViewLink" TEXT,
    "entryId" TEXT,
    "invoiceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GoogleAuth" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiryDate" BIGINT,
    "scope" TEXT,
    "email" TEXT
);

-- CreateIndex
CREATE INDEX "Account_businessId_type_idx" ON "Account"("businessId", "type");

-- CreateIndex
CREATE INDEX "JournalEntry_businessId_date_idx" ON "JournalEntry"("businessId", "date");

-- CreateIndex
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_businessId_name_key" ON "Tag"("businessId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_businessId_number_key" ON "Invoice"("businessId", "number");
