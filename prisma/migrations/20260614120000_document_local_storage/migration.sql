-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "storage" TEXT NOT NULL DEFAULT 'drive',
    "driveFileId" TEXT,
    "localKey" TEXT,
    "webViewLink" TEXT,
    "entryId" TEXT,
    "invoiceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Document_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Document_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Document_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Document" ("id", "businessId", "name", "mimeType", "category", "driveFileId", "webViewLink", "entryId", "invoiceId", "createdAt") SELECT "id", "businessId", "name", "mimeType", "category", "driveFileId", "webViewLink", "entryId", "invoiceId", "createdAt" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
