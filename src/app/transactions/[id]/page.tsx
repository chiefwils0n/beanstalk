import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "../../../lib/db";
import { flattenAccounts } from "../../../lib/accounting";
import { flattenContacts } from "../../../lib/contacts";
import { voidEntry, deleteEntry } from "../../../lib/actions";
import { formatDate, toDateInput, todayUTC } from "../../../lib/money";
import { EntryForm } from "../../../components/EntryForm";
import { ConfirmButton } from "../../../components/ConfirmButton";
import { AuditList } from "../../../components/AuditList";

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await prisma.journalEntry.findUnique({
    where: { id },
    include: { lines: true, tags: true, documents: true },
  });
  if (!entry) notFound();

  const [accounts, tags, classes, contacts, auditEvents] = await Promise.all([
    prisma.account.findMany({ where: { businessId: entry.businessId } }),
    prisma.tag.findMany({ where: { businessId: entry.businessId }, orderBy: { name: "asc" } }),
    prisma.class.findMany({ where: { businessId: entry.businessId }, orderBy: { name: "asc" } }),
    prisma.contact.findMany({
      where: { businessId: entry.businessId },
      include: { type: true },
      orderBy: { name: "asc" },
    }),
    prisma.auditEvent.findMany({ where: { entryId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/transactions" className="text-sm text-emerald-600 hover:underline">
            ← Transactions
          </Link>
          <h1 className="page-title mt-1">
            {entry.memo}
            {entry.status === "VOID" && (
              <span className="badge ml-2 bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                void
              </span>
            )}
          </h1>
          <p className="text-sm text-zinc-500">Posted {formatDate(entry.date)}</p>
        </div>
        <div className="flex gap-2">
          {entry.status === "POSTED" && (
            <form action={voidEntry}>
              <input type="hidden" name="id" value={entry.id} />
              <ConfirmButton message="Void this entry? It will be excluded from all balances and reports." className="btn btn-sm">
                Void
              </ConfirmButton>
            </form>
          )}
          <form action={deleteEntry}>
            <input type="hidden" name="id" value={entry.id} />
            <ConfirmButton message="Permanently delete this entry?">Delete</ConfirmButton>
          </form>
        </div>
      </div>

      {entry.documents.length > 0 && (
        <div className="card">
          <h2 className="mb-2 font-semibold">Attached documents</h2>
          <ul className="text-sm">
            {entry.documents.map((doc) => (
              <li key={doc.id}>
                📎{" "}
                {doc.webViewLink ? (
                  <a href={doc.webViewLink} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
                    {doc.name}
                  </a>
                ) : (
                  doc.name
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <EntryForm
        accounts={flattenAccounts(accounts)}
        tags={tags.map((t) => ({ id: t.id, name: t.name, color: t.color }))}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        contacts={flattenContacts(contacts)}
        defaultDate={toDateInput(todayUTC())}
        entryId={entry.id}
        initial={{
          date: toDateInput(entry.date),
          memo: entry.memo,
          reference: entry.reference ?? "",
          tagIds: entry.tags.map((t) => t.tagId),
          lines: entry.lines.map((line) => ({
            accountId: line.accountId,
            classId: line.classId ?? "",
            contactId: line.contactId ?? "",
            description: line.description ?? "",
            debit: line.debit ? (line.debit / 100).toFixed(2) : "",
            credit: line.credit ? (line.credit / 100).toFixed(2) : "",
          })),
        }}
      />

      <div className="card">
        <h2 className="mb-2 font-semibold">History</h2>
        <AuditList events={auditEvents} />
      </div>
    </div>
  );
}
