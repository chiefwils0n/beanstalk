import { requireBusiness } from "../../../lib/business";
import { setLockDate } from "../../../lib/actions";
import { formatDate, toDateInput } from "../../../lib/money";

export default async function ClosingDatePage() {
  const business = await requireBusiness();
  const lockDate = business.lockDate;

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Close the books through a date once a period is final — after you file taxes or send
        statements to your accountant. Nothing dated on or before the closing date can be added,
        edited, voided, deleted or imported, so a finished period can&apos;t change by accident.
        Reports and reconciling still work as usual.
      </p>

      <div className="card flex flex-col gap-4">
        <div>
          <h2 className="font-semibold">Closing date for {business.name}</h2>
          <p className="mt-1 text-sm">
            {lockDate ? (
              <>
                Books are closed through <span className="font-medium">{formatDate(lockDate)}</span>.
              </>
            ) : (
              <span className="text-zinc-500">No closing date — every period is open.</span>
            )}
          </p>
        </div>
        <form action={setLockDate} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Close the books through</label>
            <input
              type="date"
              name="lockDate"
              required
              defaultValue={lockDate ? toDateInput(lockDate) : ""}
              className="input"
            />
          </div>
          <button className="btn btn-primary">Save closing date</button>
        </form>
        {lockDate && (
          <form action={setLockDate}>
            <input type="hidden" name="lockDate" value="" />
            <button className="btn btn-sm">Remove closing date</button>
          </form>
        )}
      </div>

      <p className="text-xs text-zinc-400">
        To correct something in a closed period, move the closing date back, make the change, then
        set it again. Each business has its own closing date.
      </p>
    </div>
  );
}
