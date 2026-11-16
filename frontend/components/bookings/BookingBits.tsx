"use client";

import Link from "next/link";
import { BedDouble, CalendarDays, Home } from "lucide-react";
import { BOOKING_STATUS, date, kwacha } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { Badge } from "@/components/kit";

export function StatusBadge({ status }: { status: Booking["status"] }) {
  const s = BOOKING_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function periodLabel(b: Booking) {
  const unit = b.category === "stay" ? (b.periods === 1 ? "night" : "nights") : b.periods === 1 ? "month" : "months";
  return `${date(b.check_in, { day: "numeric", month: "short" })} – ${date(b.check_out)} · ${b.periods} ${unit}`;
}

export function BookingRow({ booking, href, aside }: { booking: Booking; href: string; aside?: React.ReactNode }) {
  const Icon = booking.category === "boarding" ? BedDouble : Home;
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface p-4">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-subtle text-ink-2">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <Link href={href} className="font-semibold text-ink hover:underline">
          {booking.target.title}
        </Link>
        <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted-ink">
          <CalendarDays className="size-3.5" aria-hidden /> {periodLabel(booking)}
        </p>
        <p className="mt-0.5 text-[13px] text-muted-ink">
          {booking.reference} · {booking.guest_name}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <StatusBadge status={booking.status} />
        <span className="text-base font-bold text-ink tabular-nums">{kwacha(booking.total_amount)}</span>
      </div>
      {aside}
    </li>
  );
}
