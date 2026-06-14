import Link from "next/link";
import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { isGoogleConfigured, getSavedAuth } from "../../lib/google";
import { deleteDocument, disconnectGoogle } from "../../lib/actions";
import { formatDate } from "../../lib/money";
import { DocumentUpload } from "../../components/DocumentUpload";
import { ConfirmButton } from "../../components/ConfirmButton";

export default async function DocumentsPage() {
  const business = await requireBusiness();
  const configured = isGoogleConfigured();
  const auth = configured ? await getSavedAuth() : null;

  const [documents, entries, invoices] = await Promise.all([
    prisma.document.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      include: { entry: true, invoice: true },
    }),
    prisma.journalEntry.findMany({
      where: { businessId: business.id, status: "POSTED" },
      orderBy: { date: "desc" },
      take: 100,
    }),
    prisma.invoice.findMany({
      where: { businessId: business.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { customer: true },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Documents</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Receipts, contracts, and statements, linked to transactions and invoices.{" "}
        {configured ? (
          <>
            Stored in your Google Drive under{" "}
            <span className="font-mono">Beanstalk/{business.name}</span>.
          </>
        ) : (
          "Stored on this server."
        )}
      </p>

      {!configured && (
        <div className="card text-sm text-zinc-600 dark:text-zinc-300">
          Uploads are saved to local storage on this server. To use Google Drive instead, set{" "}
          <span className="font-mono">GOOGLE_CLIENT_ID</span> /{" "}
          <span className="font-mono">GOOGLE_CLIENT_SECRET</span> in{" "}
          <span className="font-mono">.env</span> (
          <a
            href="https://console.cloud.google.com/apis/credentials"
            className="text-emerald-600 hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            create an OAuth client
          </a>
          , enable the Drive API, add{" "}
          <span className="font-mono">http://localhost:3000/api/google/callback</span> as a
          redirect URI) and restart.
        </div>
      )}

      {configured && !auth && (
        <div className="card flex items-center justify-between">
          <p className="text-sm">
            Google credentials are configured — connect your account to start uploading.
          </p>
          <a href="/api/google/auth" className="btn btn-primary">
            Connect Google Drive
          </a>
        </div>
      )}

      {configured && auth && (
        <div className="card flex items-center justify-between">
          <p className="text-sm">
            ✅ Connected to Google Drive{auth.email ? ` as ${auth.email}` : ""}.
          </p>
          <form action={disconnectGoogle}>
            <ConfirmButton message="Disconnect Google Drive? Uploaded files stay in your Drive." className="btn btn-sm">
              Disconnect
            </ConfirmButton>
          </form>
        </div>
      )}

      {(!configured || auth) && (
        <div className="card">
          <h2 className="mb-3 font-semibold">Upload document</h2>
          <DocumentUpload
            entries={entries.map((e) => ({
              id: e.id,
              label: `${formatDate(e.date)} — ${e.memo.slice(0, 40)}`,
            }))}
            invoices={invoices.map((inv) => ({
              id: inv.id,
              label: `${inv.number} — ${inv.customer.name}`,
            }))}
          />
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full">
          <thead>
            <tr>
              <th className="th">Document</th>
              <th className="th">Category</th>
              <th className="th">Linked to</th>
              <th className="th">Uploaded</th>
              <th className="th" />
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 && (
              <tr>
                <td className="td text-zinc-500" colSpan={5}>
                  No documents yet.
                </td>
              </tr>
            )}
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td className="td">
                  {(() => {
                    const href = doc.storage === "local" ? `/api/documents/${doc.id}` : doc.webViewLink;
                    return href ? (
                      <a href={href} target="_blank" rel="noreferrer" className="text-emerald-600 hover:underline">
                        📎 {doc.name}
                      </a>
                    ) : (
                      <>📎 {doc.name}</>
                    );
                  })()}
                </td>
                <td className="td">
                  <span className="badge bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                    {doc.category.toLowerCase()}
                  </span>
                </td>
                <td className="td text-sm text-zinc-500">
                  {doc.entry && (
                    <Link href={`/transactions/${doc.entry.id}`} className="hover:underline">
                      {doc.entry.memo}
                    </Link>
                  )}
                  {doc.invoice && (
                    <Link href={`/invoices/${doc.invoice.id}`} className="hover:underline">
                      {doc.invoice.number}
                    </Link>
                  )}
                  {!doc.entry && !doc.invoice && "—"}
                </td>
                <td className="td whitespace-nowrap text-zinc-500">{formatDate(doc.createdAt)}</td>
                <td className="td text-right">
                  <form action={deleteDocument}>
                    <input type="hidden" name="id" value={doc.id} />
                    <ConfirmButton
                      message={
                        doc.storage === "local"
                          ? `Remove ${doc.name}? The stored file will be deleted.`
                          : `Remove ${doc.name}? The Drive file will be moved to trash.`
                      }
                    >
                      Delete
                    </ConfirmButton>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
