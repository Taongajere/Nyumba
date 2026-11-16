"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2 } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { GENDER, KIND_LABEL, PRICE_SUFFIX, date, kwacha } from "@/lib/format";
import type { BoardingHouse, Listing } from "@/lib/types";
import { CoverImage } from "@/components/listings/ListingCard";
import { Badge, Button, Dialog, Empty, Field, Notice, PageTitle, Spinner, Tabs } from "@/components/kit";

type Status = "pending" | "approved" | "rejected" | "removed" | "boarding";
const TONE = { pending: "amber", approved: "green", rejected: "red", removed: "gray" } as const;

export default function AdminListingsPage() {
  const [tab, setTab] = useState<Status>("pending");
  const listings = useApi<{ count: number; results: Listing[] }>(tab === "boarding" ? null : `admin/listings?status=${tab}&page_size=100`);
  const houses = useApi<BoardingHouse[]>(tab === "boarding" ? "admin/boarding-houses" : null);
  const [decision, setDecision] = useState<{ type: "listing" | "house"; id: number; title: string; kind: "reject" | "remove" } | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function approve(type: "listing" | "house", id: number, verify = false) {
    setBusy(id);
    await api(type === "listing" ? `admin/listings/${id}/approve` : `admin/boarding-houses/${id}/approve`, { method: "POST", body: { verify_property: verify } }).catch(() => null);
    setBusy(null);
    listings.reload();
    houses.reload();
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Listings" description="Review new listings before they go live, and remove anything inappropriate." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "pending", label: "To review" },
          { value: "approved", label: "Approved" },
          { value: "rejected", label: "Needs changes" },
          { value: "removed", label: "Removed" },
          { value: "boarding", label: "Boarding houses" },
        ]}
      />
      <div className="mt-5">
        {tab === "boarding" ? (
          houses.loading && !houses.data ? (
            <Spinner />
          ) : !houses.data?.length ? (
            <Empty icon={Building2} title="No boarding houses" />
          ) : (
            <ul className="space-y-3">
              {houses.data.map((h) => (
                <li key={h.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-line p-3">
                  <CoverImage src={h.property.images[0]?.url} alt="" className="aspect-square w-20 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/boarding-houses/${h.id}`} className="font-semibold hover:underline">
                      {h.name}
                    </Link>
                    <p className="text-[13px] text-muted-ink">
                      {h.provider.name} · {h.property.town} · {GENDER[h.gender_policy]} · {h.rooms.length} rooms, {h.totals.capacity} beds
                    </p>
                  </div>
                  <Badge tone={h.is_approved ? "green" : "amber"}>{h.is_approved ? "Approved" : "To review"}</Badge>
                  {h.is_approved ? (
                    <Button size="sm" variant="ghost" className="text-bad" onClick={() => setDecision({ type: "house", id: h.id, title: h.name, kind: "remove" })}>
                      Hide from students
                    </Button>
                  ) : (
                    <Button size="sm" busy={busy === h.id} onClick={() => approve("house", h.id)}>
                      Approve
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : listings.loading && !listings.data ? (
          <Spinner />
        ) : listings.error ? (
          <Notice tone="red">{listings.error.message}</Notice>
        ) : !listings.data?.results.length ? (
          <Empty icon={Building2} title={tab === "pending" ? "Nothing to review" : "Nothing here"} />
        ) : (
          <ul className="space-y-3">
            {listings.data.results.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-line p-3">
                <CoverImage src={l.property.images[0]?.url} alt="" className="aspect-square w-20 rounded-xl" />
                <div className="min-w-0 flex-1">
                  <Link href={`/listings/${l.id}`} className="font-semibold hover:underline">
                    {l.property.title}
                  </Link>
                  <p className="text-[13px] text-muted-ink">
                    {KIND_LABEL[l.kind]} · {kwacha(l.price)}
                    {PRICE_SUFFIX[l.kind]} · {l.provider.name} · {l.property.neighbourhood || l.property.town} · {date(l.created_at)}
                  </p>
                  <p className="text-[13px] text-muted-ink">
                    {l.property.images.length} photos · owner {l.property.owner_verified ? "verified" : "not verified"} · ownership {l.property.property_verified ? "verified" : "not verified"}
                  </p>
                </div>
                <Badge tone={TONE[l.status as keyof typeof TONE]}>{l.status}</Badge>
                <div className="flex gap-2">
                  {l.status !== "approved" && l.status !== "removed" && (
                    <>
                      <Button size="sm" busy={busy === l.id} onClick={() => approve("listing", l.id)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => approve("listing", l.id, true)}>
                        Approve + verify ownership
                      </Button>
                    </>
                  )}
                  {l.status === "pending" && (
                    <Button size="sm" variant="ghost" onClick={() => setDecision({ type: "listing", id: l.id, title: l.property.title, kind: "reject" })}>
                      Ask for changes
                    </Button>
                  )}
                  {l.status === "approved" && (
                    <Button size="sm" variant="ghost" className="text-bad" onClick={() => setDecision({ type: "listing", id: l.id, title: l.property.title, kind: "remove" })}>
                      Remove
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DecisionDialog
        decision={decision}
        onClose={() => setDecision(null)}
        onDone={() => {
          listings.reload();
          houses.reload();
        }}
      />
    </div>
  );
}

function DecisionDialog({
  decision,
  onClose,
  onDone,
}: {
  decision: { type: "listing" | "house"; id: number; title: string; kind: "reject" | "remove" } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!decision) return;
    setState({ busy: true, error: "" });
    try {
      const path = decision.type === "listing" ? `admin/listings/${decision.id}/${decision.kind}` : `admin/boarding-houses/${decision.id}/${decision.kind}`;
      await api(path, { method: "POST", body: { note } });
      setNote("");
      setState({ busy: false, error: "" });
      onClose();
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <Dialog open={Boolean(decision)} onClose={onClose} title={decision ? `${decision.kind === "reject" ? "Ask for changes to" : "Remove"} ${decision.title}` : ""}>
      <form onSubmit={submit} className="space-y-4">
        {state.error && <Notice tone="red">{state.error}</Notice>}
        <Field label="Message to the provider" hint={decision?.kind === "remove" ? "The listing disappears from search immediately." : "They can edit and resubmit."}>
          <textarea className="field" rows={3} required value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Button type="submit" variant={decision?.kind === "remove" ? "danger" : "primary"} busy={state.busy} className="w-full">
          {decision?.kind === "remove" ? "Remove listing" : "Send back to provider"}
        </Button>
      </form>
    </Dialog>
  );
}
