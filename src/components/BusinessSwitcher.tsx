"use client";

import { useTransition } from "react";
import { switchBusiness } from "../lib/actions";

export function BusinessSwitcher({
  businesses,
  activeId,
}: {
  businesses: { id: string; name: string }[];
  activeId: string | null;
}) {
  const [pending, startTransition] = useTransition();
  if (businesses.length === 0) return null;
  return (
    <select
      className="input"
      value={activeId ?? ""}
      disabled={pending}
      onChange={(e) => startTransition(() => switchBusiness(e.target.value))}
    >
      {businesses.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
