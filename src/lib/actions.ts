"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "./db";
import { BUSINESS_COOKIE, requireBusiness } from "./business";
import { seedChartOfAccounts } from "./coa";
import { parseDate, parseMoney } from "./money";
import { postOccurrence, runDueRecurring, advanceDate } from "./recurring";
import { standardPayment, monthlyRate } from "./loans";

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

// ---------------------------------------------------------------- businesses

export async function createBusiness(formData: FormData) {
  const name = str(formData, "name");
  if (!name) throw new Error("Business name is required");
  const business = await prisma.business.create({
    data: {
      name,
      legalName: str(formData, "legalName") || null,
      taxId: str(formData, "taxId") || null,
      fiscalYearStart: Number(formData.get("fiscalYearStart") || 1),
    },
  });
  await seedChartOfAccounts(business.id);
  await prisma.contactType.createMany({
    data: [
      { businessId: business.id, name: "Customer" },
      { businessId: business.id, name: "Vendor" },
    ],
  });
  (await cookies()).set(BUSINESS_COOKIE, business.id, { maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateBusiness(id: string, formData: FormData) {
  await prisma.business.update({
    where: { id },
    data: {
      name: str(formData, "name"),
      legalName: str(formData, "legalName") || null,
      taxId: str(formData, "taxId") || null,
      fiscalYearStart: Number(formData.get("fiscalYearStart") || 1),
    },
  });
  revalidatePath("/", "layout");
  redirect("/settings/businesses");
}

export async function deleteBusiness(formData: FormData) {
  const id = str(formData, "id");
  await prisma.business.delete({ where: { id } });
  (await cookies()).delete(BUSINESS_COOKIE);
  revalidatePath("/", "layout");
  redirect("/settings/businesses");
}

export async function switchBusiness(id: string) {
  const business = await prisma.business.findUniqueOrThrow({ where: { id } });
  (await cookies()).set(BUSINESS_COOKIE, business.id, { maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
  redirect("/");
}

// ------------------------------------------------------------------ accounts

export async function createAccount(formData: FormData) {
  const business = await requireBusiness();
  const name = str(formData, "name");
  const type = str(formData, "type");
  if (!name || !type) throw new Error("Name and type are required");
  const parentId = str(formData, "parentId") || null;
  if (parentId) {
    const parent = await prisma.account.findUniqueOrThrow({ where: { id: parentId } });
    if (parent.type !== type) throw new Error("Sub-accounts must share their parent's type");
  }
  await prisma.account.create({
    data: {
      businessId: business.id,
      name,
      type,
      code: str(formData, "code") || null,
      taxLine: str(formData, "taxLine") || null,
      description: str(formData, "description") || null,
      parentId,
    },
  });
  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function updateAccount(id: string, formData: FormData) {
  const account = await prisma.account.findUniqueOrThrow({ where: { id } });
  const parentId = str(formData, "parentId") || null;
  if (parentId === id) throw new Error("An account cannot be its own parent");
  await prisma.account.update({
    where: { id },
    data: {
      name: str(formData, "name") || account.name,
      code: str(formData, "code") || null,
      taxLine: str(formData, "taxLine") || null,
      description: str(formData, "description") || null,
      parentId,
    },
  });
  revalidatePath("/accounts");
  redirect("/accounts");
}

export async function setAccountArchived(formData: FormData) {
  const id = str(formData, "id");
  const archived = str(formData, "archived") === "true";
  await prisma.account.update({ where: { id }, data: { isArchived: archived } });
  revalidatePath("/accounts");
}

export async function deleteAccount(formData: FormData) {
  const id = str(formData, "id");
  const [lineCount, childCount] = await Promise.all([
    prisma.journalLine.count({ where: { accountId: id } }),
    prisma.account.count({ where: { parentId: id } }),
  ]);
  if (lineCount > 0) throw new Error("Account has transactions — archive it instead");
  if (childCount > 0) throw new Error("Account has sub-accounts — move or delete them first");
  await prisma.account.delete({ where: { id } });
  revalidatePath("/accounts");
}

// ---------------------------------------------------------------------- tags

export async function createTag(formData: FormData) {
  const business = await requireBusiness();
  const name = str(formData, "name");
  if (!name) throw new Error("Tag name is required");
  await prisma.tag.create({
    data: { businessId: business.id, name, color: str(formData, "color") || "#10b981" },
  });
  revalidatePath("/settings/tags");
}

export async function updateTag(formData: FormData) {
  const id = str(formData, "id");
  await prisma.tag.update({
    where: { id },
    data: { name: str(formData, "name"), color: str(formData, "color") },
  });
  revalidatePath("/settings/tags");
}

export async function deleteTag(formData: FormData) {
  await prisma.tag.delete({ where: { id: str(formData, "id") } });
  revalidatePath("/settings/tags");
}

// ------------------------------------------------------------------- classes

export async function createClass(formData: FormData) {
  const business = await requireBusiness();
  const name = str(formData, "name");
  if (!name) throw new Error("Class name is required");
  await prisma.class.create({ data: { businessId: business.id, name } });
  revalidatePath("/settings/classes");
}

export async function updateClass(formData: FormData) {
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!name) throw new Error("Class name is required");
  await prisma.class.update({ where: { id }, data: { name } });
  revalidatePath("/settings/classes");
}

export async function deleteClass(formData: FormData) {
  // Lines keep their data; classId is nulled out by the relation's SetNull.
  await prisma.class.delete({ where: { id: str(formData, "id") } });
  revalidatePath("/settings/classes");
}

// ------------------------------------------------------------ journal entries

export type EntryLineInput = {
  accountId: string;
  classId?: string;
  contactId?: string;
  description?: string;
  debit: number; // cents
  credit: number; // cents
};

export type EntryInput = {
  date: string; // yyyy-mm-dd
  memo: string;
  reference?: string;
  tagIds: string[];
  lines: EntryLineInput[];
};

function validateEntry(input: EntryInput) {
  const lines = input.lines
    .filter((l) => l.accountId && (l.debit !== 0 || l.credit !== 0))
    .map((l) => ({ ...l, classId: l.classId || undefined, contactId: l.contactId || undefined }));
  if (lines.length < 2) return { error: "An entry needs at least two non-zero lines" };
  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) return { error: "Amounts must be positive" };
    if (line.debit > 0 && line.credit > 0)
      return { error: "A line can have a debit or a credit, not both" };
  }
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit)
    return { error: `Entry is out of balance: debits ${totalDebit} ≠ credits ${totalCredit}` };
  if (!input.memo.trim()) return { error: "Memo is required" };
  return { lines };
}

export async function createEntry(input: EntryInput): Promise<{ error?: string }> {
  const business = await requireBusiness();
  const result = validateEntry(input);
  if ("error" in result) return { error: result.error };
  await prisma.journalEntry.create({
    data: {
      businessId: business.id,
      date: parseDate(input.date),
      memo: input.memo.trim(),
      reference: input.reference?.trim() || null,
      lines: { create: result.lines },
      tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
    },
  });
  revalidatePath("/transactions");
  revalidatePath("/");
  return {};
}

export async function updateEntry(id: string, input: EntryInput): Promise<{ error?: string }> {
  const result = validateEntry(input);
  if ("error" in result) return { error: result.error };
  await prisma.$transaction([
    prisma.journalLine.deleteMany({ where: { entryId: id } }),
    prisma.entryTag.deleteMany({ where: { entryId: id } }),
    prisma.journalEntry.update({
      where: { id },
      data: {
        date: parseDate(input.date),
        memo: input.memo.trim(),
        reference: input.reference?.trim() || null,
        lines: { create: result.lines },
        tags: { create: input.tagIds.map((tagId) => ({ tagId })) },
      },
    }),
  ]);
  revalidatePath("/transactions");
  revalidatePath("/");
  return {};
}

export async function voidEntry(formData: FormData) {
  const id = str(formData, "id");
  await prisma.journalEntry.update({ where: { id }, data: { status: "VOID" } });
  revalidatePath("/transactions");
  revalidatePath("/");
}

export async function deleteEntry(formData: FormData) {
  const id = str(formData, "id");
  await prisma.journalEntry.delete({ where: { id } });
  revalidatePath("/transactions");
  revalidatePath("/");
  redirect("/transactions");
}

// ------------------------------------------------------------------ contacts

function contactData(formData: FormData) {
  const firstName = str(formData, "firstName") || null;
  const lastName = str(formData, "lastName") || null;
  const company = str(formData, "company") || null;
  const explicit = str(formData, "name");
  const name =
    explicit || company || [firstName, lastName].filter(Boolean).join(" ").trim();
  return {
    typeId: str(formData, "typeId") || null,
    parentId: str(formData, "parentId") || null,
    name,
    firstName,
    lastName,
    company,
    email: str(formData, "email") || null,
    phone: str(formData, "phone") || null,
    address: str(formData, "address") || null,
    city: str(formData, "city") || null,
    state: str(formData, "state") || null,
    zip: str(formData, "zip") || null,
    notes: str(formData, "notes") || null,
  };
}

export async function createContact(formData: FormData) {
  const business = await requireBusiness();
  const data = contactData(formData);
  if (!data.name) throw new Error("Provide a display name, company, or first/last name");
  await prisma.contact.create({ data: { businessId: business.id, ...data } });
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function updateContact(id: string, formData: FormData) {
  const data = contactData(formData);
  if (!data.name) throw new Error("Provide a display name, company, or first/last name");
  if (data.parentId === id) throw new Error("A contact cannot be its own parent");
  await prisma.contact.update({ where: { id }, data });
  revalidatePath("/contacts");
  redirect("/contacts");
}

// -------------------------------------------------------------- contact types

export async function createContactType(formData: FormData) {
  const business = await requireBusiness();
  const name = str(formData, "name");
  if (!name) throw new Error("Type name is required");
  await prisma.contactType.create({ data: { businessId: business.id, name } });
  revalidatePath("/settings/contact-types");
  revalidatePath("/contacts");
}

export async function updateContactType(formData: FormData) {
  const id = str(formData, "id");
  const name = str(formData, "name");
  if (!name) throw new Error("Type name is required");
  await prisma.contactType.update({ where: { id }, data: { name } });
  revalidatePath("/settings/contact-types");
  revalidatePath("/contacts");
}

export async function deleteContactType(formData: FormData) {
  // Contacts keep their data; typeId is nulled via SetNull.
  await prisma.contactType.delete({ where: { id: str(formData, "id") } });
  revalidatePath("/settings/contact-types");
  revalidatePath("/contacts");
}

export async function deleteContact(formData: FormData) {
  const id = str(formData, "id");
  const invoiceCount = await prisma.invoice.count({ where: { customerId: id } });
  if (invoiceCount > 0)
    throw new Error("Contact has invoices and cannot be deleted");
  // Journal/recurring lines keep their amounts; contactId is nulled via SetNull.
  await prisma.contact.delete({ where: { id } });
  revalidatePath("/contacts");
}

// ------------------------------------------------------------------ invoices

export type InvoiceItemInput = {
  accountId: string;
  classId?: string;
  description: string;
  quantity: number;
  unitPrice: number; // cents
};

export type InvoiceInput = {
  customerId?: string;
  newCustomerName?: string;
  issueDate: string;
  dueDate: string;
  notes?: string;
  items: InvoiceItemInput[];
};

export async function createInvoice(input: InvoiceInput): Promise<{ error?: string; id?: string }> {
  const business = await requireBusiness();
  const items = input.items.filter((i) => i.accountId && i.quantity > 0 && i.unitPrice > 0);
  if (items.length === 0) return { error: "An invoice needs at least one line item" };

  let customerId = input.customerId;
  if (!customerId && input.newCustomerName?.trim()) {
    const customerType = await prisma.contactType.findFirst({
      where: { businessId: business.id, name: "Customer" },
    });
    const customer = await prisma.contact.create({
      data: {
        businessId: business.id,
        typeId: customerType?.id ?? null,
        name: input.newCustomerName.trim(),
      },
    });
    customerId = customer.id;
  }
  if (!customerId) return { error: "Choose or create a customer" };

  const count = await prisma.invoice.count({ where: { businessId: business.id } });
  const number = `INV-${String(count + 1).padStart(4, "0")}`;
  const total = items.reduce((s, i) => s + Math.round(i.quantity * i.unitPrice), 0);
  const invoice = await prisma.invoice.create({
    data: {
      businessId: business.id,
      customerId,
      number,
      issueDate: parseDate(input.issueDate),
      dueDate: parseDate(input.dueDate),
      notes: input.notes?.trim() || null,
      total,
      items: {
        create: items.map((i) => ({
          accountId: i.accountId,
          classId: i.classId || undefined,
          description: i.description,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          amount: Math.round(i.quantity * i.unitPrice),
        })),
      },
    },
  });
  revalidatePath("/invoices");
  return { id: invoice.id };
}

async function getReceivableAccount(businessId: string) {
  const existing = await prisma.account.findFirst({
    where: { businessId, type: "ASSET", name: "Accounts Receivable" },
  });
  if (existing) return existing;
  return prisma.account.create({
    data: { businessId, name: "Accounts Receivable", type: "ASSET", code: "1100" },
  });
}

/** Mark a draft invoice as sent and post the receivable to the ledger. */
export async function sendInvoice(formData: FormData) {
  const id = str(formData, "id");
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id },
    include: { items: true, customer: true },
  });
  if (invoice.status !== "DRAFT") throw new Error("Only draft invoices can be sent");
  const receivable = await getReceivableAccount(invoice.businessId);
  await prisma.journalEntry.create({
    data: {
      businessId: invoice.businessId,
      date: invoice.issueDate,
      memo: `Invoice ${invoice.number} — ${invoice.customer.name}`,
      reference: invoice.number,
      invoiceId: invoice.id,
      lines: {
        create: [
          { accountId: receivable.id, contactId: invoice.customerId, debit: invoice.total, credit: 0 },
          ...invoice.items.map((item) => ({
            accountId: item.accountId,
            classId: item.classId,
            contactId: invoice.customerId,
            description: item.description,
            debit: 0,
            credit: item.amount,
          })),
        ],
      },
    },
  });
  await prisma.invoice.update({ where: { id }, data: { status: "SENT" } });
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
}

export async function recordInvoicePayment(
  invoiceId: string,
  input: { date: string; accountId: string; amount: number }
): Promise<{ error?: string }> {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true },
  });
  if (invoice.status !== "SENT") return { error: "Send the invoice before recording payments" };
  if (input.amount <= 0) return { error: "Payment amount must be positive" };
  const receivable = await getReceivableAccount(invoice.businessId);
  await prisma.journalEntry.create({
    data: {
      businessId: invoice.businessId,
      date: parseDate(input.date),
      memo: `Payment — Invoice ${invoice.number} (${invoice.customer.name})`,
      reference: invoice.number,
      invoiceId: invoice.id,
      lines: {
        create: [
          { accountId: input.accountId, contactId: invoice.customerId, debit: input.amount, credit: 0 },
          { accountId: receivable.id, contactId: invoice.customerId, debit: 0, credit: input.amount },
        ],
      },
    },
  });
  const paid = await invoicePaidAmount(invoiceId, receivable.id);
  if (paid >= invoice.total) {
    await prisma.invoice.update({ where: { id: invoiceId }, data: { status: "PAID" } });
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return {};
}

export async function invoicePaidAmount(invoiceId: string, receivableId: string): Promise<number> {
  const result = await prisma.journalLine.aggregate({
    where: { accountId: receivableId, entry: { invoiceId, status: "POSTED" } },
    _sum: { credit: true },
  });
  return result._sum.credit ?? 0;
}

export async function voidInvoice(formData: FormData) {
  const id = str(formData, "id");
  await prisma.$transaction([
    prisma.journalEntry.updateMany({ where: { invoiceId: id }, data: { status: "VOID" } }),
    prisma.invoice.update({ where: { id }, data: { status: "VOID" } }),
  ]);
  revalidatePath(`/invoices/${id}`);
  revalidatePath("/invoices");
}

export async function deleteInvoice(formData: FormData) {
  const id = str(formData, "id");
  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
  if (invoice.status !== "DRAFT" && invoice.status !== "VOID")
    throw new Error("Only draft or void invoices can be deleted");
  await prisma.$transaction([
    prisma.journalEntry.deleteMany({ where: { invoiceId: id } }),
    prisma.invoice.delete({ where: { id } }),
  ]);
  revalidatePath("/invoices");
  redirect("/invoices");
}

// ----------------------------------------------------------------- recurring

export type RecurringInput = {
  name: string;
  memo?: string;
  frequency: string;
  interval: number;
  startDate: string;
  endDate?: string;
  autoPost: boolean;
  lines: EntryLineInput[];
};

export async function createRecurring(input: RecurringInput): Promise<{ error?: string }> {
  const business = await requireBusiness();
  if (!input.name.trim()) return { error: "Name is required" };
  const lines = input.lines
    .filter((l) => l.accountId && (l.debit !== 0 || l.credit !== 0))
    .map((l) => ({ ...l, classId: l.classId || undefined, contactId: l.contactId || undefined }));
  if (lines.length < 2) return { error: "A recurring transaction needs at least two non-zero lines" };
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit) return { error: "Recurring transaction is out of balance" };
  await prisma.recurringTransaction.create({
    data: {
      businessId: business.id,
      name: input.name.trim(),
      memo: input.memo?.trim() || null,
      frequency: input.frequency,
      interval: Math.max(1, Math.round(input.interval)),
      nextRun: parseDate(input.startDate),
      endDate: input.endDate ? parseDate(input.endDate) : null,
      autoPost: input.autoPost,
      lines: { create: lines },
    },
  });
  revalidatePath("/settings/recurring");
  return {};
}

export async function updateRecurring(
  id: string,
  input: RecurringInput
): Promise<{ error?: string }> {
  if (!input.name.trim()) return { error: "Name is required" };
  const lines = input.lines
    .filter((l) => l.accountId && (l.debit !== 0 || l.credit !== 0))
    .map((l) => ({ ...l, classId: l.classId || undefined, contactId: l.contactId || undefined }));
  if (lines.length < 2) return { error: "A recurring transaction needs at least two non-zero lines" };
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  if (totalDebit !== totalCredit) return { error: "Recurring transaction is out of balance" };
  await prisma.$transaction([
    prisma.recurringLine.deleteMany({ where: { recurringId: id } }),
    prisma.recurringTransaction.update({
      where: { id },
      data: {
        name: input.name.trim(),
        memo: input.memo?.trim() || null,
        frequency: input.frequency,
        interval: Math.max(1, Math.round(input.interval)),
        nextRun: parseDate(input.startDate),
        endDate: input.endDate ? parseDate(input.endDate) : null,
        autoPost: input.autoPost,
        lines: { create: lines },
      },
    }),
  ]);
  revalidatePath("/settings/recurring");
  return {};
}

export async function toggleRecurring(formData: FormData) {
  const id = str(formData, "id");
  const recurring = await prisma.recurringTransaction.findUniqueOrThrow({ where: { id } });
  await prisma.recurringTransaction.update({
    where: { id },
    data: { isActive: !recurring.isActive },
  });
  revalidatePath("/settings/recurring");
}

export async function deleteRecurring(formData: FormData) {
  await prisma.recurringTransaction.delete({ where: { id: str(formData, "id") } });
  revalidatePath("/settings/recurring");
}

/** Post the next occurrence immediately and advance the schedule. */
export async function postRecurringNow(formData: FormData) {
  const id = str(formData, "id");
  const recurring = await prisma.recurringTransaction.findUniqueOrThrow({ where: { id } });
  await postOccurrence(id, recurring.nextRun);
  await prisma.recurringTransaction.update({
    where: { id },
    data: {
      nextRun: advanceDate(recurring.nextRun, recurring.frequency, recurring.interval),
      lastRun: new Date(),
    },
  });
  revalidatePath("/settings/recurring");
  revalidatePath("/transactions");
}

export async function runAllDueRecurring() {
  const business = await requireBusiness();
  await runDueRecurring(business.id);
  revalidatePath("/settings/recurring");
  revalidatePath("/transactions");
  revalidatePath("/");
}

// --------------------------------------------------------------------- loans

async function findOrCreateAccount(
  businessId: string,
  where: { name: string; type: string },
  extra: { code?: string; parentName?: string; taxLine?: string } = {}
) {
  const existing = await prisma.account.findFirst({
    where: { businessId, name: where.name, type: where.type },
  });
  if (existing) return existing;
  let parentId: string | null = null;
  if (extra.parentName) {
    const parent = await prisma.account.findFirst({
      where: { businessId, name: extra.parentName, type: where.type },
    });
    parentId = parent?.id ?? null;
  }
  return prisma.account.create({
    data: {
      businessId,
      name: where.name,
      type: where.type,
      code: extra.code ?? null,
      taxLine: extra.taxLine ?? null,
      parentId,
    },
  });
}

export async function createLoan(formData: FormData) {
  const business = await requireBusiness();
  const name = str(formData, "name");
  if (!name) throw new Error("Loan name is required");
  const principal = parseMoney(str(formData, "principal"));
  const annualRate = Number(str(formData, "annualRate") || 0);
  const termMonths = Math.round(Number(str(formData, "termMonths") || 0));
  if (principal <= 0 || termMonths <= 0 || annualRate < 0)
    throw new Error("Principal, rate, and term must be positive");
  const paymentOverride = str(formData, "payment");
  const payment = paymentOverride
    ? parseMoney(paymentOverride)
    : standardPayment(principal, annualRate, termMonths);

  let liabilityAccountId = str(formData, "liabilityAccountId");
  if (!liabilityAccountId) {
    const account = await findOrCreateAccount(
      business.id,
      { name: `Loan — ${name}`, type: "LIABILITY" },
      { parentName: "Loans Payable" }
    );
    liabilityAccountId = account.id;
  }
  let interestAccountId = str(formData, "interestAccountId");
  if (!interestAccountId) {
    const account = await findOrCreateAccount(
      business.id,
      { name: "Interest Expense", type: "EXPENSE" },
      { code: "6150", taxLine: "Interest (Line 16)" }
    );
    interestAccountId = account.id;
  }
  const paymentAccountId = str(formData, "paymentAccountId");
  if (!paymentAccountId) throw new Error("Choose the account payments come from");

  const loan = await prisma.loan.create({
    data: {
      businessId: business.id,
      name,
      lenderId: str(formData, "lenderId") || null,
      principal,
      annualRate,
      termMonths,
      firstPaymentDate: parseDate(str(formData, "firstPaymentDate")),
      payment,
      liabilityAccountId,
      interestAccountId,
      paymentAccountId,
      notes: str(formData, "notes") || null,
    },
  });

  // Optionally post the loan funds arriving (new borrowing, not an existing loan).
  if (str(formData, "postDisbursement") === "on") {
    await prisma.journalEntry.create({
      data: {
        businessId: business.id,
        date: parseDate(str(formData, "firstPaymentDate")),
        memo: `Loan disbursement — ${name}`,
        lines: {
          create: [
            { accountId: paymentAccountId, contactId: loan.lenderId, debit: principal, credit: 0 },
            { accountId: liabilityAccountId, contactId: loan.lenderId, debit: 0, credit: principal },
          ],
        },
      },
    });
  }

  revalidatePath("/loans");
  redirect(`/loans/${loan.id}`);
}

export async function deleteLoan(formData: FormData) {
  // Posted payment entries stay in the ledger (LoanPayment rows cascade away).
  await prisma.loan.delete({ where: { id: str(formData, "id") } });
  revalidatePath("/loans");
  redirect("/loans");
}

export async function recordLoanPayment(
  loanId: string,
  input: { date: string; extra: number; principalOnly: boolean }
): Promise<{ error?: string }> {
  const loan = await prisma.loan.findUniqueOrThrow({
    where: { id: loanId },
    include: { payments: true },
  });
  const paidPrincipal = loan.payments.reduce((s, p) => s + p.principal, 0);
  const balance = loan.principal - paidPrincipal;
  if (balance <= 0) return { error: "This loan is already paid off" };
  if (input.extra < 0) return { error: "Extra principal cannot be negative" };

  let interest = 0;
  let scheduledPrincipal = 0;
  let extra = 0;
  if (input.principalOnly) {
    if (input.extra <= 0) return { error: "Enter the principal amount to apply" };
    extra = Math.min(input.extra, balance);
  } else {
    interest = Math.round(balance * monthlyRate(loan.annualRate));
    scheduledPrincipal = Math.min(Math.max(loan.payment - interest, 0), balance);
    if (scheduledPrincipal <= 0 && interest >= loan.payment)
      return { error: "Payment does not cover interest — check the rate and payment" };
    extra = Math.min(input.extra, balance - scheduledPrincipal);
  }
  const principal = scheduledPrincipal + extra;
  const total = principal + interest;

  const entry = await prisma.journalEntry.create({
    data: {
      businessId: loan.businessId,
      date: parseDate(input.date),
      memo: input.principalOnly
        ? `Extra principal — ${loan.name}`
        : `Loan payment — ${loan.name}`,
      lines: {
        create: [
          { accountId: loan.liabilityAccountId, contactId: loan.lenderId, debit: principal, credit: 0 },
          ...(interest > 0
            ? [{ accountId: loan.interestAccountId, contactId: loan.lenderId, debit: interest, credit: 0 }]
            : []),
          { accountId: loan.paymentAccountId, contactId: loan.lenderId, debit: 0, credit: total },
        ],
      },
    },
  });
  await prisma.loanPayment.create({
    data: { loanId, date: parseDate(input.date), interest, principal, extra, entryId: entry.id },
  });
  revalidatePath(`/loans/${loanId}`);
  revalidatePath("/loans");
  revalidatePath("/transactions");
  revalidatePath("/");
  return {};
}

export async function deleteLoanPayment(formData: FormData) {
  const id = str(formData, "id");
  const payment = await prisma.loanPayment.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction([
    prisma.loanPayment.delete({ where: { id } }),
    ...(payment.entryId
      ? [prisma.journalEntry.delete({ where: { id: payment.entryId } })]
      : []),
  ]);
  revalidatePath(`/loans/${payment.loanId}`);
  revalidatePath("/loans");
  revalidatePath("/transactions");
}

// ----------------------------------------------------------------- documents

export async function deleteDocument(formData: FormData) {
  const id = str(formData, "id");
  const doc = await prisma.document.findUniqueOrThrow({ where: { id } });
  const { trashDriveFile } = await import("./google");
  await trashDriveFile(doc.driveFileId);
  await prisma.document.delete({ where: { id } });
  revalidatePath("/documents");
}

export async function disconnectGoogle() {
  await prisma.googleAuth.deleteMany({});
  revalidatePath("/documents");
}
