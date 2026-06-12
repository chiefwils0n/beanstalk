import type { Contact, ContactType } from "@prisma/client";

export type ParentOption = { id: string; name: string };

/** Shared field grid for the create and edit contact forms (server-rendered). */
export function ContactFields({
  contact,
  types,
  parents,
}: {
  contact?: Contact;
  types: ContactType[];
  parents: ParentOption[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <label className="label">Type</label>
        <select name="typeId" className="input" defaultValue={contact?.typeId ?? types[0]?.id ?? ""}>
          <option value="">— none —</option>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">First name</label>
        <input name="firstName" className="input" defaultValue={contact?.firstName ?? ""} />
      </div>
      <div>
        <label className="label">Last name</label>
        <input name="lastName" className="input" defaultValue={contact?.lastName ?? ""} />
      </div>
      <div>
        <label className="label">Company</label>
        <input name="company" className="input" defaultValue={contact?.company ?? ""} />
      </div>
      <div>
        <label className="label">Display name (defaults to company or first/last)</label>
        <input name="name" className="input" defaultValue={contact?.name ?? ""} />
      </div>
      <div>
        <label className="label">Nest under (e.g. household, organization)</label>
        <select name="parentId" className="input" defaultValue={contact?.parentId ?? ""}>
          <option value="">— top level —</option>
          {parents
            .filter((p) => p.id !== contact?.id)
            .map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
        </select>
      </div>
      <div>
        <label className="label">Email</label>
        <input name="email" type="email" className="input" defaultValue={contact?.email ?? ""} />
      </div>
      <div>
        <label className="label">Phone</label>
        <input name="phone" className="input" defaultValue={contact?.phone ?? ""} />
      </div>
      <div>
        <label className="label">Street address</label>
        <input name="address" className="input" defaultValue={contact?.address ?? ""} />
      </div>
      <div>
        <label className="label">City</label>
        <input name="city" className="input" defaultValue={contact?.city ?? ""} />
      </div>
      <div>
        <label className="label">State</label>
        <input name="state" className="input" defaultValue={contact?.state ?? ""} />
      </div>
      <div>
        <label className="label">ZIP</label>
        <input name="zip" className="input" defaultValue={contact?.zip ?? ""} />
      </div>
      <div className="sm:col-span-3">
        <label className="label">Notes</label>
        <textarea name="notes" rows={2} className="input" defaultValue={contact?.notes ?? ""} />
      </div>
    </div>
  );
}
