import Link from "next/link";
import { prisma } from "../../../lib/db";
import { requireBusiness } from "../../../lib/business";
import { flattenAccounts } from "../../../lib/accounting";
import { createImportRule, updateImportRule, deleteImportRule } from "../../../lib/actions";
import { ConfirmButton } from "../../../components/ConfirmButton";

export default async function ImportRulesPage() {
  const business = await requireBusiness();
  const [rules, accounts] = await Promise.all([
    prisma.importRule.findMany({
      where: { businessId: business.id },
      orderBy: { match: "asc" },
      include: { category: { select: { name: true, isArchived: true } } },
    }),
    prisma.account.findMany({ where: { businessId: business.id, isArchived: false } }),
  ]);
  const options = flattenAccounts(accounts);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        When you{" "}
        <Link href="/transactions/import" className="underline">
          import a CSV
        </Link>
        , any row whose description contains a rule&apos;s text gets that rule&apos;s category
        filled in. Capitals and extra spaces don&apos;t matter. If several rules fit, the longest
        text wins. Rules only fill in the review screen — you can still change any row before
        importing.
      </p>

      <div className="card">
        {rules.length === 0 ? (
          <p className="text-sm text-zinc-500">No import rules yet — create one below.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Description contains</th>
                <th className="th">Category</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id}>
                  <td className="td">
                    <form action={updateImportRule} id={`rule-${rule.id}`}>
                      <input type="hidden" name="id" value={rule.id} />
                      <input
                        name="match"
                        defaultValue={rule.match}
                        required
                        maxLength={200}
                        aria-label="Description contains"
                        className="input"
                      />
                    </form>
                  </td>
                  <td className="td">
                    <select
                      name="categoryAccountId"
                      defaultValue={rule.category.isArchived ? "" : rule.categoryAccountId}
                      required
                      form={`rule-${rule.id}`}
                      aria-label="Category"
                      className="input"
                    >
                      {rule.category.isArchived && (
                        <option value="">{rule.category.name} (archived) — choose another</option>
                      )}
                      {options.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                    {rule.category.isArchived && (
                      <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                        This rule is off because its category is archived.
                      </p>
                    )}
                  </td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-1">
                      <button className="btn btn-sm" form={`rule-${rule.id}`}>
                        Save
                      </button>
                      <form action={deleteImportRule}>
                        <input type="hidden" name="id" value={rule.id} />
                        <ConfirmButton message={`Delete the rule for "${rule.match}"?`}>
                          Delete
                        </ConfirmButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 className="mb-3 font-semibold">New rule</h2>
        <form action={createImportRule} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Description contains</label>
            <input
              name="match"
              required
              maxLength={200}
              className="input"
              placeholder="e.g. Herring Rental"
            />
          </div>
          <div>
            <label className="label">Category</label>
            <select name="categoryAccountId" required defaultValue="" className="input max-w-72">
              <option value="" disabled>
                — choose account —
              </option>
              {options.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary">Add rule</button>
        </form>
      </div>
    </div>
  );
}
