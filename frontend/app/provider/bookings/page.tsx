"use client";

import { useState } from "react";
import { CalendarCheck, MessageSquare } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { BookingRow } from "@/components/bookings/BookingBits";
import { Badge, Empty, Notice, PageTitle, Spinner, Tabs } from "@/components/kit";
import { BookingDecision } from "@/components/provider/BookingDecision";

type Enquiry = {
  id: number;
  name: string;
  phone: string;
  message: string;
  is_read: boolean;
  created_at: string;
  username: string | null;
  about: { type: string; id: number; title: string };
};

type Tab = "requests" | "upcoming" | "past" | "enquiries";
const FILTER: Record<Exclude<Tab, "enquiries">, string[]> = {
  requests: ["pending"],
  upcoming: ["awaiting_payment", "confirmed"],
  past: ["completed", "cancelled", "rejected"],
};

export default function ProviderBookingsPage() {
  const [tab, setTab] = useState<Tab>("requests");
  const bookings = useApi<Booking[]>("provider/bookings");
  const enquiries = useApi<Enquiry[]>("provider/enquiries");
  const list = tab === "enquiries" ? [] : (bookings.data ?? []).filter((b) => FILTER[tab].includes(b.status));
  const count = (t: Exclude<Tab, "enquiries">) => (bookings.data ?? []).filter((b) => FILTER[t].includes(b.status)).length;

  async function markRead(e: Enquiry) {
    if (e.is_read) return;
    await api(`provider/enquiries/${e.id}/read`, { method: "POST" }).catch(() => null);
    enquiries.reload();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle title="Bookings & enquiries" description="Answer requests quickly: guests can only pay after you accept." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "requests", label: "Requests", count: count("requests") },
          { value: "upcoming", label: "Upcoming", count: count("upcoming") },
          { value: "past", label: "Past", count: count("past") },
          { value: "enquiries", label: "Enquiries", count: (enquiries.data ?? []).filter((e) => !e.is_read).length },
        ]}
      />
      <div className="mt-5">
        {tab === "enquiries" ? (
          enquiries.loading && !enquiries.data ? (
            <Spinner />
          ) : !enquiries.data?.length ? (
            <Empty icon={MessageSquare} title="No enquiries yet">Questions from people viewing your listings appear here.</Empty>
          ) : (
            <ul className="space-y-3">
              {enquiries.data.map((e) => (
                <li key={e.id} className={cn("rounded-2xl border p-4", e.is_read ? "border-line" : "border-marker/40 bg-info-soft/40")} onMouseEnter={() => markRead(e)} onFocus={() => markRead(e)} tabIndex={0}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {e.name} <span className="font-medium text-muted-ink">about {e.about.title}</span>
                    </p>
                    <span className="flex items-center gap-2 text-xs text-muted-ink">
                      {!e.is_read && <Badge tone="blue">New</Badge>}
                      {timeAgo(e.created_at)}
                    </span>
                  </div>
                  {e.message && <p className="mt-2 text-[15px] text-ink-2">{e.message}</p>}
                  <p className="mt-2 text-sm">
                    <a href={`tel:${e.phone.replace(/\s/g, "")}`} className="font-semibold text-marker">
                      Call {e.phone}
                    </a>
                  </p>
                </li>
              ))}
            </ul>
          )
        ) : bookings.loading && !bookings.data ? (
          <Spinner />
        ) : bookings.error ? (
          <Notice tone="red">{bookings.error.message}</Notice>
        ) : list.length === 0 ? (
          <Empty icon={CalendarCheck} title={tab === "requests" ? "No requests waiting" : "Nothing here"} />
        ) : (
          <ul className="space-y-3">
            {list.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                href={`/bookings/${b.id}`}
                aside={
                  <div className="flex w-full flex-wrap items-center justify-between gap-3 border-t border-line pt-3 sm:w-auto sm:border-0 sm:pt-0">
                    {b.message && <p className="max-w-xs text-[13px] text-ink-2 italic sm:hidden">“{b.message}”</p>}
                    <BookingDecision booking={b} onDone={bookings.reload} />
                  </div>
                }
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
