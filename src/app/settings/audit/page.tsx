import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { AuditList } from "../../../components/AuditList";

export default async function AuditLogPage() {
  const business = await requireBusiness();
  const events = await prisma.auditEvent.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Every change to a transaction — created, updated, voided, or deleted — is recorded here
        (most recent first). Deleted transactions stay in the log even though the entry is gone.
      </p>
      <div className="card overflow-x-auto p-0">
        <AuditList events={events} linkEntries />
      </div>
    </div>
  );
}
