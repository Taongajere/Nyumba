"use client";

import { cn } from "@/lib/utils";
import type { Room } from "@/lib/types";

// One dot per bed: filled = taken, outlined = free. Makes "3 of 4" readable at a glance.
export function BedDots({ room }: { room: Pick<Room, "capacity" | "occupancy"> }) {
  const taken = room.capacity - room.occupancy.available;
  return (
    <span className="flex gap-1" aria-label={`${room.occupancy.available} of ${room.capacity} beds free`}>
      {Array.from({ length: room.capacity }, (_, i) => (
        <span key={i} className={cn("size-3 rounded-full border-2", i < taken ? "border-ink-2 bg-ink-2" : "border-ok bg-ok-soft")} />
      ))}
    </span>
  );
}

