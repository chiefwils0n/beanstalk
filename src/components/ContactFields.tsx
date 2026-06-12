import type { Contact } from "@prisma/client";

/** Shared field grid for the create and edit contact forms (server-rendered). */
export function ContactFields({ contact }: { contact?: Contact }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <label className="label">Type</label>
        <select name="kind" className="input" defaultValue={contact?.kind ?? "CUSTOMER"}>
          <option value="CUSTOMER">Customer</option>
          <option value="VENDOR">Vendor</option>
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
        <label className="label">Email</label>
        <input name="email" type="email" className="input" defaultValue={contact?.email ?? ""} />
      </div>
      <div>
        <label className="label">Phone</label>
        <input name="phone" className="input" defaultValue={contact?.phone ?? ""} />
      </div>
      <div className="sm:col-span-2">
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
