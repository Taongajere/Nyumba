"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";

// Saved listings and boarding houses for the signed-in user, kept in the database.
// The header count and every heart button read from here so they never disagree.
type FavouritesState = {
  listingIds: Set<number>;
  houseIds: Set<number>;
  count: number;
  toggle: (target: { listingId?: number; houseId?: number }) => Promise<void>;
  reload: () => void;
};

type FavouriteRow = { id: number; listing: { id: number } | null; boarding_house: { id: number } | null };

const Ctx = createContext<FavouritesState | null>(null);

export function FavouritesProvider({ children }: { children: React.ReactNode }) {
  const [listingIds, setListingIds] = useState<Set<number>>(new Set());
  const [houseIds, setHouseIds] = useState<Set<number>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api<FavouriteRow[]>("favourites")
      .then((rows) => {
        setListingIds(new Set(rows.filter((r) => r.listing).map((r) => r.listing!.id)));
        setHouseIds(new Set(rows.filter((r) => r.boarding_house).map((r) => r.boarding_house!.id)));
      })
      .catch(() => null);
  }, [tick]);

  const toggle = useCallback(
    async ({ listingId, houseId }: { listingId?: number; houseId?: number }) => {
      const isListing = listingId !== undefined;
      const id = (isListing ? listingId : houseId)!;
      const set = isListing ? listingIds : houseIds;
      const setter = isListing ? setListingIds : setHouseIds;
      const saved = set.has(id);
      // Optimistic: flip now, roll back if the server says no.
      setter((prev) => {
        const next = new Set(prev);
        if (saved) next.delete(id);
        else next.add(id);
        return next;
      });
      try {
        if (saved) {
          await api(`favourites/remove?${isListing ? "listing_id" : "boarding_house_id"}=${id}`, { method: "DELETE" });
        } else {
          await api("favourites", { method: "POST", body: isListing ? { listing_id: id } : { boarding_house_id: id } });
        }
      } catch {
        setter((prev) => {
          const next = new Set(prev);
          if (saved) next.add(id);
          else next.delete(id);
          return next;
        });
      }
    },
    [listingIds, houseIds]
  );

  const value = useMemo(
    () => ({
      listingIds,
      houseIds,
      count: listingIds.size + houseIds.size,
      toggle,
      reload: () => setTick((t) => t + 1),
    }),
    [listingIds, houseIds, toggle]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFavourites() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFavourites must be used inside FavouritesProvider");
  return ctx;
}
