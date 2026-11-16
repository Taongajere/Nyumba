"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink, ImagePlus, Plus, Trash2 } from "lucide-react";
import { ApiError, api, useApi } from "@/lib/api";
import { KIND_LABEL, kwacha } from "@/lib/format";
import { Badge, Button, Dialog, Field, Notice, PageTitle, Panel, PanelHeader, Spinner } from "@/components/kit";
import { PropertyFields, type PropertyDraft } from "@/components/provider/PropertyFields";
import { LISTING_STATUS, type ProviderListing, type ProviderProperty, type Unit } from "@/components/provider/types";

export default function EditPropertyPage() {
  const { id } = useParams<{ id: string }>();
  const created = useSearchParams().get("created") === "1";
  const { data: p, error, loading, reload } = useApi<ProviderProperty>(`provider/properties/${id}`);

  if (loading && !p) return <Spinner />;
  if (error || !p) return <Notice tone="red">{error?.message ?? "Property not found."}</Notice>;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/provider/properties" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-ink hover:text-ink">
        <ArrowLeft className="size-4" /> My properties
      </Link>
      <PageTitle title={p.title} description={p.address} />
      {created && (
        <Notice tone="green" className="mb-6">
          Saved and sent for review. Add photos now. Listings with photos get far more enquiries.
        </Notice>
      )}
      <div className="space-y-6">
        <Listings property={p} onChange={reload} />
        <Photos property={p} onChange={reload} />
        <Details property={p} onSaved={reload} />
        <Units property={p} onChange={reload} />
        <DangerZone property={p} />
      </div>
    </div>
  );
}

function Listings({ property, onChange }: { property: ProviderProperty; onChange: () => void }) {
  const [adding, setAdding] = useState(false);
  const missing = (["rent", "stay", "sale"] as const).filter((k) => !property.listings.some((l) => l.kind === k && l.status !== "removed"));
  return (
    <Panel>
      <PanelHeader
        title="Listings"
        description="How this property appears on the marketplace."
        action={missing.length > 0 && <Button size="sm" variant="secondary" onClick={() => setAdding(true)}><Plus className="size-4" /> Add listing</Button>}
      />
      <ul className="divide-y divide-line">
        {property.listings.length === 0 && <li className="p-5 text-sm text-muted-ink">No listing yet. Add one to appear in search.</li>}
        {property.listings.map((l) => (
          <ListingRow key={l.id} listing={l} onChange={onChange} />
        ))}
      </ul>
      <NewListingDialog open={adding} kinds={missing} propertyId={property.id} onClose={() => setAdding(false)} onDone={onChange} />
    </Panel>
  );
}

function ListingRow({ listing, onChange }: { listing: ProviderListing; onChange: () => void }) {
  const [form, setForm] = useState({ price: listing.price, booking_mode: listing.booking_mode, available_from: listing.available_from ?? "" });
  const [state, setState] = useState({ busy: "", error: "", saved: false });

  async function save(patch: Record<string, unknown>, which: string) {
    setState({ busy: which, error: "", saved: false });
    try {
      await api(`provider/listings/${listing.id}`, { method: "PATCH", body: patch });
      setState({ busy: "", error: "", saved: which === "save" });
      onChange();
    } catch (err) {
      setState({ busy: "", error: (err as Error).message, saved: false });
    }
  }

  const s = LISTING_STATUS[listing.status];
  return (
    <li className="space-y-3 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-semibold">{KIND_LABEL[listing.kind]}</p>
        <Badge tone={s.tone}>{s.label}</Badge>
        {listing.status === "approved" && <Badge tone={listing.is_published ? "blue" : "gray"}>{listing.is_published ? "Live in search" : "Unpublished"}</Badge>}
        <Link href={`/listings/${listing.id}`} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-marker">
          Preview <ExternalLink className="size-3.5" />
        </Link>
      </div>
      {listing.moderation_note && <Notice tone={listing.status === "rejected" ? "red" : "gray"}>Administrator: {listing.moderation_note}</Notice>}
      {state.error && <Notice tone="red">{state.error}</Notice>}
      {state.saved && <Notice tone="green">Saved.</Notice>}
      {listing.status !== "removed" && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Price (K)" className="w-36">
            <input className="field" inputMode="numeric" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
          </Field>
          {listing.kind !== "sale" && (
            <Field label="Booking" className="w-48">
              <select className="field" value={form.booking_mode} onChange={(e) => setForm({ ...form, booking_mode: e.target.value as "request" | "instant" })}>
                <option value="request">Request to book</option>
                <option value="instant">Instant booking</option>
              </select>
            </Field>
          )}
          <Field label="Available from" className="w-44">
            <input className="field" type="date" value={form.available_from} onChange={(e) => setForm({ ...form, available_from: e.target.value })} />
          </Field>
          <Button variant="secondary" busy={state.busy === "save"} onClick={() => save({ ...form, available_from: form.available_from || null }, "save")}>
            Save
          </Button>
          <Button variant="ghost" busy={state.busy === "publish"} onClick={() => save({ is_published: !listing.is_published }, "publish")}>
            {listing.is_published ? "Unpublish" : "Publish"}
          </Button>
          {listing.status === "rejected" && (
            <Button busy={state.busy === "resubmit"} onClick={() => save({ ...form, available_from: form.available_from || null, resubmit: true }, "resubmit")}>
              Resubmit for review
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

function NewListingDialog({ open, kinds, propertyId, onClose, onDone }: { open: boolean; kinds: string[]; propertyId: number; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ kind: kinds[0] ?? "rent", price: "", booking_mode: "request" });
  const [state, setState] = useState({ busy: false, error: "" });
  const kind = kinds.includes(form.kind) ? form.kind : (kinds[0] ?? "rent");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "" });
    try {
      await api(`provider/properties/${propertyId}/listings`, { method: "POST", body: { ...form, kind } });
      onClose();
      onDone();
      setState({ busy: false, error: "" });
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title="Add a listing">
      <form onSubmit={submit} className="space-y-4">
        {state.error && <Notice tone="red">{state.error}</Notice>}
        <Field label="Offer it as">
          <select className="field" value={kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k as "rent"]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Price (K)">
          <input className="field" inputMode="numeric" required value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </Field>
        {kind !== "sale" && (
          <Field label="Booking">
            <select className="field" value={form.booking_mode} onChange={(e) => setForm({ ...form, booking_mode: e.target.value })}>
              <option value="request">Request to book</option>
              <option value="instant">Instant booking</option>
            </select>
          </Field>
        )}
        <Button type="submit" busy={state.busy} className="w-full">
          Submit for review
        </Button>
      </form>
    </Dialog>
  );
}

function Photos({ property, onChange }: { property: ProviderProperty; onChange: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState({ busy: false, error: "" });

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const body = new FormData();
    Array.from(files).forEach((f) => body.append("images", f));
    setState({ busy: true, error: "" });
    try {
      await api(`provider/properties/${property.id}/images`, { method: "POST", body });
      onChange();
      setState({ busy: false, error: "" });
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
    if (input.current) input.current.value = "";
  }
  async function remove(imageId: number) {
    await api(`provider/images/${imageId}`, { method: "DELETE" }).catch(() => null);
    onChange();
  }

  return (
    <Panel>
      <PanelHeader
        title="Photos"
        description="JPEG, PNG or WebP, up to 5 MB each. The first photo is the cover."
        action={
          <Button size="sm" variant="secondary" busy={state.busy} onClick={() => input.current?.click()}>
            <ImagePlus className="size-4" /> Upload
          </Button>
        }
      />
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={(e) => upload(e.target.files)} aria-label="Upload photos" />
      <div className="p-5">
        {state.error && <Notice tone="red" className="mb-4">{state.error}</Notice>}
        {property.images.length === 0 ? (
          <button type="button" onClick={() => input.current?.click()} className="grid h-36 w-full place-items-center rounded-2xl border-2 border-dashed border-line-strong text-sm font-semibold text-muted-ink hover:bg-subtle">
            Add photos
          </button>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {property.images.map((img, i) => (
              <li key={img.id} className="group relative overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.caption || `Photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                {i === 0 && <span className="absolute top-2 left-2 rounded-full bg-surface/95 px-2 py-0.5 text-xs font-semibold">Cover</span>}
                <button type="button" onClick={() => remove(img.id)} aria-label={`Delete photo ${i + 1}`} className="absolute top-2 right-2 grid size-8 place-items-center rounded-full bg-surface/95 text-bad opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100">
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}

function Details({ property, onSaved }: { property: ProviderProperty; onSaved: () => void }) {
  const [draft, setDraft] = useState<PropertyDraft>(property);
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [state, setState] = useState({ busy: false, error: "", saved: false });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "", saved: false });
    try {
      const { title, description, property_type, bedrooms, bathrooms, size_sqm, furnishing, amenities, address, neighbourhood, town, latitude, longitude } = draft;
      await api(`provider/properties/${property.id}`, {
        method: "PATCH",
        body: { title, description, property_type, bedrooms, bathrooms, size_sqm, furnishing, amenities, address, neighbourhood, town, latitude, longitude },
      });
      setErrors({});
      setState({ busy: false, error: "", saved: true });
      onSaved();
    } catch (err) {
      setErrors(((err as ApiError).fields as Record<string, string[]>) ?? {});
      setState({ busy: false, error: (err as Error).message, saved: false });
    }
  }
  return (
    <Panel>
      <PanelHeader title="Details" />
      <form onSubmit={submit} className="space-y-4 p-5">
        {state.error && <Notice tone="red">{state.error}</Notice>}
        {state.saved && <Notice tone="green">Details saved.</Notice>}
        <PropertyFields value={draft} onChange={setDraft} errors={errors} hideType={property.property_type === "boarding_house"} />
        <Button type="submit" busy={state.busy}>
          Save details
        </Button>
      </form>
    </Panel>
  );
}

const UNIT_STATUS = { available: "Available", occupied: "Occupied", maintenance: "Under maintenance" };

function Units({ property, onChange }: { property: ProviderProperty; onChange: () => void }) {
  const [editing, setEditing] = useState<Partial<Unit> | null>(null);
  const [state, setState] = useState({ busy: false, error: "" });
  if (property.property_type === "boarding_house") return null;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setState({ busy: true, error: "" });
    try {
      if (editing.id) await api(`provider/units/${editing.id}`, { method: "PATCH", body: editing });
      else await api(`provider/properties/${property.id}/units`, { method: "POST", body: editing });
      setEditing(null);
      setState({ busy: false, error: "" });
      onChange();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  async function remove(unit: Unit) {
    await api(`provider/units/${unit.id}`, { method: "DELETE" }).catch(() => null);
    onChange();
  }

  return (
    <Panel>
      <PanelHeader
        title="Units"
        description="For blocks of flats or plots with several homes: track each unit and who lives there."
        action={<Button size="sm" variant="secondary" onClick={() => setEditing({ name: "", bedrooms: property.bedrooms, bathrooms: property.bathrooms, monthly_rent: "0", status: "available" })}><Plus className="size-4" /> Add unit</Button>}
      />
      {property.units.length === 0 ? (
        <p className="p-5 text-sm text-muted-ink">No units. Skip this if the property is rented as one home.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-subtle text-left text-muted-ink">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Unit</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5 font-semibold">Tenant</th>
                <th className="px-3 py-2.5 text-right font-semibold">Rent</th>
                <th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {property.units.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3 font-semibold">{u.name}</td>
                  <td className="px-3 py-3">
                    <Badge tone={u.status === "available" ? "green" : u.status === "occupied" ? "blue" : "amber"}>{UNIT_STATUS[u.status]}</Badge>
                  </td>
                  <td className="px-3 py-3 text-ink-2">{u.tenant_name || "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{kwacha(u.monthly_rent)}</td>
                  <td className="px-5 py-3 text-right whitespace-nowrap">
                    <button type="button" className="font-semibold text-marker" onClick={() => setEditing(u)}>
                      Edit
                    </button>
                    <button type="button" className="ml-4 font-semibold text-bad" onClick={() => remove(u)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? `Edit ${editing.name}` : "Add a unit"}>
        {editing && (
          <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
            {state.error && <Notice tone="red" className="sm:col-span-2">{state.error}</Notice>}
            <Field label="Name">
              <input className="field" required value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Flat 2" />
            </Field>
            <Field label="Status">
              <select className="field" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Unit["status"] })}>
                {Object.entries(UNIT_STATUS).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Monthly rent (K)">
              <input className="field" inputMode="numeric" value={editing.monthly_rent ?? ""} onChange={(e) => setEditing({ ...editing, monthly_rent: e.target.value })} />
            </Field>
            <Field label="Bedrooms">
              <input className="field" type="number" min={0} value={editing.bedrooms ?? 1} onChange={(e) => setEditing({ ...editing, bedrooms: Number(e.target.value) })} />
            </Field>
            <Field label="Tenant name">
              <input className="field" value={editing.tenant_name ?? ""} onChange={(e) => setEditing({ ...editing, tenant_name: e.target.value })} />
            </Field>
            <Field label="Tenant phone">
              <input className="field" type="tel" value={editing.tenant_phone ?? ""} onChange={(e) => setEditing({ ...editing, tenant_phone: e.target.value })} />
            </Field>
            <Field label="Lease start">
              <input className="field" type="date" value={editing.lease_start ?? ""} onChange={(e) => setEditing({ ...editing, lease_start: e.target.value || null })} />
            </Field>
            <Field label="Lease end">
              <input className="field" type="date" value={editing.lease_end ?? ""} onChange={(e) => setEditing({ ...editing, lease_end: e.target.value || null })} />
            </Field>
            <Button type="submit" busy={state.busy} className="sm:col-span-2">
              Save unit
            </Button>
          </form>
        )}
      </Dialog>
    </Panel>
  );
}

function DangerZone({ property }: { property: ProviderProperty }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState({ busy: false, error: "" });
  if (!property.is_owner) return null;
  async function remove() {
    setState({ busy: true, error: "" });
    try {
      const res = await api<{ message?: string } | undefined>(`provider/properties/${property.id}`, { method: "DELETE" });
      if (res?.message) {
        setState({ busy: false, error: res.message });
        return;
      }
      router.push("/provider/properties");
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <h2 className="font-bold">Delete property</h2>
        <p className="text-sm text-muted-ink">Properties with booking history are unpublished instead, so records stay intact.</p>
      </div>
      <Button variant="ghost" className="text-bad" onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Delete
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Delete ${property.title}?`}>
        <p className="text-[15px] text-ink-2">This removes the property, its listings and photos. It can&apos;t be undone.</p>
        {state.error && <Notice tone="amber" className="mt-4">{state.error}</Notice>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Keep it
          </Button>
          <Button variant="danger" busy={state.busy} onClick={remove}>
            Delete property
          </Button>
        </div>
      </Dialog>
    </Panel>
  );
}
