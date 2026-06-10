import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { createTag, updateTag, deleteTag } from "../../lib/actions";
import { ConfirmButton } from "../../components/ConfirmButton";

export default async function TagsPage() {
  const business = await requireBusiness();
  const tags = await prisma.tag.findMany({
    where: { businessId: business.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { entries: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Tags</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Tag transactions to track projects, clients, locations, or anything else across
        accounts. Filter the transaction list by tag at any time.
      </p>

      <div className="card">
        {tags.length === 0 ? (
          <p className="text-sm text-zinc-500">No tags yet — create one below.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Tag</th>
                <th className="th">Color</th>
                <th className="th text-right">Transactions</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {tags.map((tag) => (
                <tr key={tag.id}>
                  <td className="td">
                    <form action={updateTag} className="flex items-center gap-2" id={`tag-${tag.id}`}>
                      <input type="hidden" name="id" value={tag.id} />
                      <span className="h-3 w-3 rounded-full" style={{ backgroundColor: tag.color }} />
                      <input name="name" defaultValue={tag.name} className="input max-w-48" />
                    </form>
                  </td>
                  <td className="td">
                    <input
                      type="color"
                      name="color"
                      defaultValue={tag.color}
                      form={`tag-${tag.id}`}
                      className="h-8 w-12 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
                    />
                  </td>
                  <td className="td text-right">{tag._count.entries}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-1">
                      <button className="btn btn-sm" form={`tag-${tag.id}`}>
                        Save
                      </button>
                      <form action={deleteTag}>
                        <input type="hidden" name="id" value={tag.id} />
                        <ConfirmButton message={`Delete tag ${tag.name}? It will be removed from all transactions.`}>
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
        <h2 className="mb-3 font-semibold">New tag</h2>
        <form action={createTag} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Name</label>
            <input name="name" required className="input" placeholder="e.g. Project Phoenix" />
          </div>
          <div>
            <label className="label">Color</label>
            <input
              type="color"
              name="color"
              defaultValue="#10b981"
              className="h-8 w-12 cursor-pointer rounded border border-zinc-300 dark:border-zinc-700"
            />
          </div>
          <button className="btn btn-primary">Add tag</button>
        </form>
      </div>
    </div>
  );
}
