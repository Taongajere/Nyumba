"use client";

import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { useApi } from "@/lib/api";
import type { Booking } from "@/lib/types";
import { BookingRow } from "@/components/bookings/BookingBits";
import { ButtonLink, Empty, Notice, PageTitle, Spinner, Tabs } from "@/components/kit";

const GROUPS = {
  current: ["pending", "accepted", "awaiting_payment", "confirmed"],
  past: ["completed", "cancelled", "rejected"],
} as const;

export default function MyBookingsPage() {
  const { data, error, loading } = useApi<Booking[]>("bookings");
  const [tab, setTab] = useState<"current" | "past">("current");
  const list = (data ?? []).filter((b) => (GROUPS[tab] as readonly string[]).includes(b.status));
  const needsAction = (data ?? []).filter((b) => b.can_pay);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageTitle title="My bookings" description="Stays, rentals and boarding-house beds you've booked." />
      {needsAction.length > 0 && (
        <Notice tone="amber" className="mb-5">
          {needsAction.length === 1 ? "One booking is" : `${needsAction.length} bookings are`} waiting for payment. Pay before the hold expires to keep it.
        </Notice>
      )}
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "current", label: "Upcoming", count: (data ?? []).filter((b) => (GROUPS.current as readonly string[]).includes(b.status)).length },
          { value: "past", label: "Past", count: (data ?? []).filter((b) => (GROUPS.past as readonly string[]).includes(b.status)).length },
        ]}
      />
      <div className="mt-5">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <Notice tone="red">{error.message}</Notice>
        ) : list.length === 0 ? (
          <Empty icon={CalendarCheck} title={tab === "current" ? "No upcoming bookings" : "Nothing here yet"} action={<ButtonLink href="/">Find a place</ButtonLink>}>
            {tab === "current" ? "When you book a stay, a rental or a boarding-house bed, it shows up here." : "Finished and cancelled bookings appear here."}
          </Empty>
        ) : (
          <ul className="space-y-3">
            {list.map((b) => (
              <BookingRow key={b.id} booking={b} href={`/bookings/${b.id}`} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
