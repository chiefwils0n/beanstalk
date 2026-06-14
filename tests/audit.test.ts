import { describe, it, expect } from "vitest";
import { diffSnapshots, withDiffs, type Snapshot } from "../src/lib/audit";

const base: Snapshot = {
  memo: "Rent",
  date: "2026-06-01",
  reference: "INV-1",
  status: "POSTED",
  lines: [
    { account: "Checking", debit: 130000, credit: 0, class: "2305 Jake", contact: null, description: null },
    { account: "Rental Income", debit: 0, credit: 130000, class: "2305 Jake", contact: null, description: null },
  ],
};

describe("diffSnapshots", () => {
  it("reports scalar field changes", () => {
    const next = { ...base, memo: "Rent (May)", reference: null };
    expect(diffSnapshots(base, next)).toEqual([
      { kind: "field", label: "Memo", from: "Rent", to: "Rent (May)" },
      { kind: "field", label: "Reference", from: "INV-1", to: "—" },
    ]);
  });

  it("reports a changed line amount as a removed + added pair", () => {
    const next: Snapshot = {
      ...base,
      lines: [
        base.lines[0],
        { ...base.lines[1], credit: 140000 },
      ],
    };
    const changes = diffSnapshots(base, next);
    expect(changes).toContainEqual({ kind: "line-removed", text: "Rental Income Cr $1,300.00 (2305 Jake)" });
    expect(changes).toContainEqual({ kind: "line-added", text: "Rental Income Cr $1,400.00 (2305 Jake)" });
  });

  it("returns no changes when nothing differs", () => {
    expect(diffSnapshots(base, { ...base, lines: [...base.lines] })).toEqual([]);
  });
});

describe("withDiffs", () => {
  const snap = (s: Partial<Snapshot> & { memo: string }) =>
    JSON.stringify({ date: "2026-06-01", reference: null, status: "POSTED", lines: [], ...s, memo: undefined });

  it("diffs an UPDATED event against the prior event of the same entry", () => {
    const events = [
      { id: "e2", entryId: "x", action: "UPDATED", memo: "B", detail: snap({ memo: "B" }), createdAt: new Date(2000) },
      { id: "e1", entryId: "x", action: "CREATED", memo: "A", detail: snap({ memo: "A" }), createdAt: new Date(1000) },
    ];
    const out = withDiffs(events);
    const updated = out.find((e) => e.id === "e2")!;
    const created = out.find((e) => e.id === "e1")!;
    expect(created.changes).toBeUndefined(); // creation has nothing to diff
    expect(updated.changes).toContainEqual({ kind: "field", label: "Memo", from: "A", to: "B" });
  });
});
