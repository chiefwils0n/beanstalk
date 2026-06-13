-- RedefineTables (adds status, closedAt, closureNote, replacesId + self-FK; preserves rows)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Loan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lenderId" TEXT,
    "principal" INTEGER NOT NULL,
    "annualRate" REAL NOT NULL,
    "termMonths" INTEGER NOT NULL,
    "firstPaymentDate" DATETIME NOT NULL,
    "payment" INTEGER NOT NULL,
    "liabilityAccountId" TEXT NOT NULL,
    "interestAccountId" TEXT NOT NULL,
    "paymentAccountId" TEXT NOT NULL,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closedAt" DATETIME,
    "closureNote" TEXT,
    "replacesId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Loan_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Loan_lenderId_fkey" FOREIGN KEY ("lenderId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Loan_liabilityAccountId_fkey" FOREIGN KEY ("liabilityAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Loan_interestAccountId_fkey" FOREIGN KEY ("interestAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Loan_paymentAccountId_fkey" FOREIGN KEY ("paymentAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Loan_replacesId_fkey" FOREIGN KEY ("replacesId") REFERENCES "Loan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Loan" ("annualRate", "businessId", "createdAt", "firstPaymentDate", "id", "interestAccountId", "lenderId", "liabilityAccountId", "name", "notes", "payment", "paymentAccountId", "principal", "termMonths") SELECT "annualRate", "businessId", "createdAt", "firstPaymentDate", "id", "interestAccountId", "lenderId", "liabilityAccountId", "name", "notes", "payment", "paymentAccountId", "principal", "termMonths" FROM "Loan";
DROP TABLE "Loan";
ALTER TABLE "new_Loan" RENAME TO "Loan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
