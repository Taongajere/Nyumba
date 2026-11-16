"use client";

import Link from "next/link";
import { BedDouble, Plus } from "lucide-react";
import { useApi } from "@/lib/api";
import { GENDER } from "@/lib/format";
import type { BoardingHouse } from "@/lib/types";
import { BedDots } from "@/components/boarding/BedDots";
import { Badge, ButtonLink, Empty, Notice, PageTitle, Spinner } from "@/components/kit";

export default function ProviderBoardingPage() {
  const { data, error, loading } = useApi<BoardingHouse[]>("provider/boarding-houses");
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="Boarding houses"
        description="Rooms, beds and occupants. Availability updates from who is actually checked in."
        action={
          <ButtonLink href="/provider/boarding/new">
            <Plus className="size-4" /> Register boarding house
          </ButtonLink>
        }
      />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <Notice tone="red">{error.message}</Notice>
      ) : !data?.length ? (
        <Empty icon={BedDouble} title="No boarding houses yet" action={<ButtonLink href="/provider/boarding/new">Register a boarding house</ButtonLink>}>
          Register the house, add its rooms with their bed counts and prices, then register occupants.
        </Empty>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {data.map((h) => (
            <li key={h.id} className="rounded-2xl border border-line p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/provider/boarding/${h.id}`} className="text-lg font-semibold hover:underline">
                    {h.name}
                  </Link>
                  <p className="text-[13px] text-muted-ink">
                    {h.property.neighbourhood}, {h.property.town} · {GENDER[h.gender_policy]}
                  </p>
                </div>
                <div className="flex gap-1.5">
                  {!h.is_approved && <Badge tone="amber">In review</Badge>}
                  {!h.is_active && <Badge>Unpublished</Badge>}
                  {h.is_approved && h.is_active && <Badge tone="green">Live</Badge>}
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-4 gap-2 text-center">
                {[
                  ["Beds", h.totals.capacity],
                  ["Occupied", h.totals.occupied],
                  ["Reserved", h.totals.reserved],
                  ["Free", h.totals.available],
                ].map(([label, n]) => (
                  <div key={label} className="rounded-xl bg-subtle py-2">
                    <dt className="text-xs text-muted-ink">{label}</dt>
                    <dd className="text-lg font-bold tabular-nums">{n}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-subtle" aria-label={`${h.totals.occupancy_rate}% occupied`}>
                <div className="h-2 rounded-full bg-marker" style={{ width: `${h.totals.occupancy_rate}%` }} />
              </div>
              <ul className="mt-4 space-y-1.5">
                {h.rooms.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink-2">{r.name}</span>
                    <BedDots room={r} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
