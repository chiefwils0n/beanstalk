import { requireBusiness } from "../../../lib/business";
import { openInvoices } from "../../../lib/reports";
import { parseDate, todayUTC } from "../../../lib/money";
import { AgeingReport } from "../../../components/AgeingReport";

export default async function ReceivablesAgeingPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const asOf = sp.asOf ? parseDate(sp.asOf) : todayUTC();
  const docs = await openInvoices(business.id, asOf);
  return (
    <AgeingReport
      title="Receivables Ageing"
      businessName={business.name}
      fiscalStartMonth={business.fiscalYearStart}
      asOf={asOf}
      docs={docs}
      docHref={(id) => `/invoices/${id}`}
      contactLabel="Customer / invoice"
      emptyText="No unpaid invoices on this date."
    />
  );
}
