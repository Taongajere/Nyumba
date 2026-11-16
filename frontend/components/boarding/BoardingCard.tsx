"use client";

import Link from "next/link";
import { BedDouble, GraduationCap, Users, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavourites } from "@/lib/favourites";
import { GENDER, kwacha, plural } from "@/lib/format";
import type { BoardingHouse } from "@/lib/types";
import { CoverImage, HeartButton } from "@/components/listings/ListingCard";
import { Fact, buttonClass } from "@/components/kit";

export function BoardingCard({ house, active, onHover }: { house: BoardingHouse; active?: boolean; onHover?: (id: number | null) => void }) {
  const { houseIds, toggle } = useFavourites();
  const href = `/boarding-houses/${house.id}`;
  const free = house.rooms.reduce((n, r) => n + r.occupancy.available, 0);
  const shared = house.rooms.some((r) => r.capacity > 1);
  const priv = house.rooms.some((r) => r.capacity === 1);

  return (
    <article
      id={`result-${house.id}`}
      onMouseEnter={() => onHover?.(house.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow]",
        active ? "border-marker shadow-[0_0_0_3px_var(--marker-soft)]" : "border-line"
      )}
    >
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden>
          <CoverImage src={house.property.images[0]?.url} alt="" className="aspect-[5/4] w-full" />
        </Link>
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-surface/95 px-2.5 py-1 text-xs font-semibold text-ink">{GENDER[house.gender_policy]}</span>
          {house.booking_mode === "instant" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-semibold text-ink">
              <Zap className="size-3.5 text-marker" aria-hidden /> Instant
            </span>
          )}
        </div>
        <HeartButton saved={houseIds.has(house.id)} onToggle={() => toggle({ houseId: house.id })} label={house.name} className="absolute top-3 right-3" />
      </div>
      <div className="p-4">
        <p className="flex items-center gap-1.5 truncate text-[13px] text-muted-ink">
          <GraduationCap className="size-3.5 shrink-0" aria-hidden />
          {house.near_institution || `${house.property.neighbourhood}, ${house.property.town}`}
        </p>
        <h3 className="mt-1 truncate text-base font-semibold text-ink">
          <Link href={href} className="hover:underline">
            {house.name}
          </Link>
        </h3>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Fact icon={BedDouble}>
            <b className="font-semibold text-ok">{free}</b> {free === 1 ? "space" : "spaces"} free
          </Fact>
          <Fact icon={Users}>{shared && priv ? "Shared & private" : shared ? "Shared rooms" : "Private rooms"}</Fact>
          <Fact>{plural(house.rooms.length, "room")}</Fact>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link href={href} className={buttonClass("primary", "sm", "px-4")}>
            View rooms<span className="sr-only">: {house.name}</span>
          </Link>
          <p className="text-right">
            <span className="text-xs text-muted-ink">from </span>
            <span className="text-xl font-bold tracking-tight text-ink tabular-nums">{house.price_from ? kwacha(house.price_from) : "—"}</span>
            <span className="block text-xs text-muted-ink">per bed · month</span>
          </p>
        </div>
      </div>
    </article>
  );
}
