import { requireBusiness } from "../../../lib/business";
import { openBills } from "../../../lib/reports";
import { parseDate, todayUTC } from "../../../lib/money";
import { AgeingReport } from "../../../components/AgeingReport";

export default async function PayablesAgeingPage({
  searchParams,
}: {
  searchParams: Promise<{ asOf?: string }>;
}) {
  const business = await requireBusiness();
  const sp = await searchParams;
  const asOf = sp.asOf ? parseDate(sp.asOf) : todayUTC();
  const docs = await openBills(business.id, asOf);
  return (
    <AgeingReport
      title="Payables Ageing"
      businessName={business.name}
      fiscalStartMonth={business.fiscalYearStart}
      asOf={asOf}
      docs={docs}
      docHref={(id) => `/bills/${id}`}
      contactLabel="Vendor / bill"
      emptyText="No unpaid bills on this date."
    />
  );
}
