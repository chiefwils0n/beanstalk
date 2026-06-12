import { prisma } from "../../lib/db";
import { requireBusiness } from "../../lib/business";
import { createClass, updateClass, deleteClass } from "../../lib/actions";
import { ConfirmButton } from "../../components/ConfirmButton";

export default async function ClassesPage() {
  const business = await requireBusiness();
  const classes = await prisma.class.findMany({
    where: { businessId: business.id },
    orderBy: { name: "asc" },
    include: { _count: { select: { lines: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="page-title">Classes</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Classes label individual transaction lines — departments, locations, product lines —
        for report grouping. Once you create one, a Class column appears on transaction,
        recurring, and invoice forms, and reports can be filtered by class.
      </p>

      <div className="card">
        {classes.length === 0 ? (
          <p className="text-sm text-zinc-500">No classes yet — create one below.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Class</th>
                <th className="th text-right">Lines</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {classes.map((cls) => (
                <tr key={cls.id}>
                  <td className="td">
                    <form action={updateClass} className="flex items-center gap-2" id={`class-${cls.id}`}>
                      <input type="hidden" name="id" value={cls.id} />
                      <input name="name" defaultValue={cls.name} className="input max-w-64" />
                    </form>
                  </td>
                  <td className="td text-right">{cls._count.lines}</td>
                  <td className="td text-right">
                    <div className="flex justify-end gap-1">
                      <button className="btn btn-sm" form={`class-${cls.id}`}>
                        Save
                      </button>
                      <form action={deleteClass}>
                        <input type="hidden" name="id" value={cls.id} />
                        <ConfirmButton message={`Delete class ${cls.name}? Lines using it become unclassified (no data is lost).`}>
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
        <h2 className="mb-3 font-semibold">New class</h2>
        <form action={createClass} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Name</label>
            <input name="name" required className="input" placeholder="e.g. Retail, Wholesale, East Region" />
          </div>
          <button className="btn btn-primary">Add class</button>
        </form>
      </div>
    </div>
  );
}
