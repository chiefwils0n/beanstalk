-- CreateTable
CREATE TABLE "ContactType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    CONSTRAINT "ContactType_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Seed default contact types for every business, then make sure a type exists
-- for any kind value present on existing contacts.
INSERT INTO "ContactType" ("id", "businessId", "name")
SELECT lower(hex(randomblob(16))), b."id", t."name"
FROM "Business" b CROSS JOIN (SELECT 'Customer' AS name UNION ALL SELECT 'Vendor') t;

INSERT INTO "ContactType" ("id", "businessId", "name")
SELECT lower(hex(randomblob(16))), c."businessId",
       CASE c."kind" WHEN 'CUSTOMER' THEN 'Customer' WHEN 'VENDOR' THEN 'Vendor' ELSE c."kind" END
FROM "Contact" c
WHERE NOT EXISTS (
    SELECT 1 FROM "ContactType" ct
    WHERE ct."businessId" = c."businessId"
      AND ct."name" = CASE c."kind" WHEN 'CUSTOMER' THEN 'Customer' WHEN 'VENDOR' THEN 'Vendor' ELSE c."kind" END
)
GROUP BY c."businessId", c."kind";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "typeId" TEXT,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "company" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "notes" TEXT,
    CONSTRAINT "Contact_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Contact_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ContactType" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Contact_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
-- Carry the old kind over as the matching ContactType.
INSERT INTO "new_Contact" ("address", "businessId", "city", "company", "email", "firstName", "id", "lastName", "name", "notes", "phone", "state", "zip", "typeId")
SELECT "address", "businessId", "city", "company", "email", "firstName", "id", "lastName", "name", "notes", "phone", "state", "zip",
    (SELECT ct."id" FROM "ContactType" ct
     WHERE ct."businessId" = "Contact"."businessId"
       AND ct."name" = CASE "Contact"."kind" WHEN 'CUSTOMER' THEN 'Customer' WHEN 'VENDOR' THEN 'Vendor' ELSE "Contact"."kind" END)
FROM "Contact";
DROP TABLE "Contact";
ALTER TABLE "new_Contact" RENAME TO "Contact";
CREATE INDEX "Contact_businessId_typeId_idx" ON "Contact"("businessId", "typeId");
CREATE TABLE "new_JournalLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "classId" TEXT,
    "contactId" TEXT,
    "description" TEXT,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "JournalLine_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalLine_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JournalLine" ("accountId", "classId", "contactId", "credit", "debit", "description", "entryId", "id") SELECT "accountId", "classId", "contactId", "credit", "debit", "description", "entryId", "id" FROM "JournalLine";
DROP TABLE "JournalLine";
ALTER TABLE "new_JournalLine" RENAME TO "JournalLine";
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");
CREATE INDEX "JournalLine_classId_idx" ON "JournalLine"("classId");
CREATE INDEX "JournalLine_contactId_idx" ON "JournalLine"("contactId");
CREATE TABLE "new_RecurringLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recurringId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "classId" TEXT,
    "contactId" TEXT,
    "description" TEXT,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "RecurringLine_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecurringLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RecurringLine_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RecurringLine_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_RecurringLine" ("accountId", "classId", "contactId", "credit", "debit", "description", "id", "recurringId") SELECT "accountId", "classId", "contactId", "credit", "debit", "description", "id", "recurringId" FROM "RecurringLine";
DROP TABLE "RecurringLine";
ALTER TABLE "new_RecurringLine" RENAME TO "RecurringLine";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ContactType_businessId_name_key" ON "ContactType"("businessId", "name");
