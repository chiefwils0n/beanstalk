import "server-only";
import { prisma } from "./db";
import type { Contact, ContactType } from "@prisma/client";

export type ContactOption = {
  id: string;
  name: string;
  typeName: string | null;
  depth: number;
};

/** Flatten contacts into tree order (parents before indented children). */
export function flattenContacts(
  contacts: (Contact & { type: ContactType | null })[]
): ContactOption[] {
  const byParent = new Map<string | null, (Contact & { type: ContactType | null })[]>();
  const ids = new Set(contacts.map((c) => c.id));
  for (const contact of contacts) {
    // A parent outside the list (e.g. filtered out) renders at top level.
    const key = contact.parentId && ids.has(contact.parentId) ? contact.parentId : null;
    byParent.set(key, [...(byParent.get(key) ?? []), contact]);
  }
  const out: ContactOption[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const list = (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const contact of list) {
      out.push({
        id: contact.id,
        name: contact.name,
        typeName: contact.type?.name ?? null,
        depth,
      });
      walk(contact.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/** A contact id plus all of its descendants — lets filtering by a parent
 *  (e.g. a household) include the nested contacts (its tenants). */
export async function contactWithDescendants(businessId: string, contactId: string): Promise<string[]> {
  const contacts = await prisma.contact.findMany({
    where: { businessId },
    select: { id: true, parentId: true },
  });
  const byParent = new Map<string, string[]>();
  for (const contact of contacts) {
    if (contact.parentId) {
      byParent.set(contact.parentId, [...(byParent.get(contact.parentId) ?? []), contact.id]);
    }
  }
  const result: string[] = [];
  const queue = [contactId];
  while (queue.length) {
    const id = queue.shift()!;
    result.push(id);
    queue.push(...(byParent.get(id) ?? []));
  }
  return result;
}

/** Make sure a business has the starter contact types. */
export async function ensureDefaultContactTypes(businessId: string) {
  const count = await prisma.contactType.count({ where: { businessId } });
  if (count === 0) {
    await prisma.contactType.createMany({
      data: [
        { businessId, name: "Customer" },
        { businessId, name: "Vendor" },
      ],
    });
  }
}
