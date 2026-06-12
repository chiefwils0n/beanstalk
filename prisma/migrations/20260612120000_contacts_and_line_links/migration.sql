-- Rename Customer -> Contact in place (preserves all rows; SQLite rewrites
-- referencing foreign keys, e.g. Invoice.customerId). Existing rows keep
-- kind = 'CUSTOMER'.
ALTER TABLE "Customer" RENAME TO "Contact";

ALTER TABLE "Contact" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'CUSTOMER';
ALTER TABLE "Contact" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Contact" ADD COLUMN "lastName" TEXT;
ALTER TABLE "Contact" ADD COLUMN "company" TEXT;
ALTER TABLE "Contact" ADD COLUMN "phone" TEXT;
ALTER TABLE "Contact" ADD COLUMN "city" TEXT;
ALTER TABLE "Contact" ADD COLUMN "state" TEXT;
ALTER TABLE "Contact" ADD COLUMN "zip" TEXT;
ALTER TABLE "Contact" ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "Contact_businessId_kind_idx" ON "Contact"("businessId", "kind");

-- Optional contact link on ledger and recurring-template lines.
ALTER TABLE "JournalLine" ADD COLUMN "contactId" TEXT REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringLine" ADD COLUMN "contactId" TEXT REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "JournalLine_contactId_idx" ON "JournalLine"("contactId");
