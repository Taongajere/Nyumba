"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api } from "@/lib/api";
import { Button, Field, Notice, PageTitle, Panel } from "@/components/kit";
import { EMPTY_PROPERTY, PropertyFields } from "@/components/provider/PropertyFields";
import type { ProviderProperty } from "@/components/provider/types";

export default function NewPropertyPage() {
  const router = useRouter();
  const [property, setProperty] = useState(EMPTY_PROPERTY);
  const [listing, setListing] = useState({ kind: "rent", price: "", booking_mode: "request", available_from: "" });
  const [errors, setErrors] = useState<Record<string, string[] | undefined>>({});
  const [state, setState] = useState({ busy: false, error: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "" });
    setErrors({});
    try {
      const created = await api<ProviderProperty>("provider/properties", {
        method: "POST",
        body: { ...property, listing: { ...listing, available_from: listing.available_from || null } },
      });
      router.push(`/provider/properties/${created.id}?created=1`);
    } catch (err) {
      setErrors(((err as ApiError).fields as Record<string, string[]>) ?? {});
      setState({ busy: false, error: (err as Error).message });
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="Add a property" description="You can add photos and units on the next screen." />
      <form onSubmit={submit} className="space-y-6">
        {state.error && <Notice tone="red">{state.error}</Notice>}
        <Panel className="p-5">
          <h2 className="mb-4 font-bold">The property</h2>
          <PropertyFields value={property} onChange={setProperty} errors={errors} />
        </Panel>
        <Panel className="p-5">
          <h2 className="mb-4 font-bold">Listing</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Offer it as">
              <select className="field" value={listing.kind} onChange={(e) => setListing({ ...listing, kind: e.target.value })}>
                <option value="rent">Long-term rental (per month)</option>
                <option value="stay">Short stay (per night)</option>
                <option value="sale">Sale</option>
              </select>
            </Field>
            <Field label={listing.kind === "rent" ? "Monthly rent (K)" : listing.kind === "stay" ? "Price per night (K)" : "Asking price (K)"}>
              <input className="field" inputMode="numeric" required value={listing.price} onChange={(e) => setListing({ ...listing, price: e.target.value.replace(/[^\d.]/g, "") })} />
            </Field>
            {listing.kind !== "sale" && (
              <Field label="How guests book" hint={listing.booking_mode === "instant" ? "Guests book and pay straight away if the dates are free." : "You accept or decline each request first."}>
                <select className="field" value={listing.booking_mode} onChange={(e) => setListing({ ...listing, booking_mode: e.target.value })}>
                  <option value="request">Request to book</option>
                  <option value="instant">Instant booking</option>
                </select>
              </Field>
            )}
            <Field label="Available from (optional)">
              <input className="field" type="date" value={listing.available_from} onChange={(e) => setListing({ ...listing, available_from: e.target.value })} />
            </Field>
          </div>
          <p className="mt-4 text-[13px] text-muted-ink">New listings are reviewed by a Nyumba administrator before they appear in search.</p>
        </Panel>
        <Button type="submit" size="lg" busy={state.busy}>
          Save and submit for review
        </Button>
      </form>
    </div>
  );
}
