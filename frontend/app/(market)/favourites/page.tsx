"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { useApi } from "@/lib/api";
import { useFavourites } from "@/lib/favourites";
import type { BoardingHouse, Listing } from "@/lib/types";
import { BoardingCard } from "@/components/boarding/BoardingCard";
import { ListingCard } from "@/components/listings/ListingCard";
import { ButtonLink, Empty, Notice, PageTitle, Spinner, Tabs } from "@/components/kit";

type Row = { id: number; listing: Listing | null; boarding_house: BoardingHouse | null };

export default function FavouritesPage() {
  const { data, error, loading, reload } = useApi<Row[]>("favourites");
  const { listingIds, houseIds } = useFavourites();
  const [tab, setTab] = useState<"homes" | "boarding">("homes");

  // When a heart is un-ticked on this page, the card stays until the next visit so it can be re-saved.
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const homes = (data ?? []).filter((r) => r.listing).map((r) => r.listing!);
  const houses = (data ?? []).filter((r) => r.boarding_house).map((r) => r.boarding_house!);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <PageTitle title="Favourites" description="Places you've saved. They're kept on your account, on every device." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "homes", label: "Homes", count: listingIds.size },
          { value: "boarding", label: "Boarding houses", count: houseIds.size },
        ]}
      />
      <div className="mt-6">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <Notice tone="red">{error.message}</Notice>
        ) : tab === "homes" ? (
          homes.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {homes.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          ) : (
            <Empty icon={Heart} title="No saved homes yet" action={<ButtonLink href="/">Explore homes</ButtonLink>}>
              Tap the heart on any home to keep it here.
            </Empty>
          )
        ) : houses.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {houses.map((h) => (
              <BoardingCard key={h.id} house={h} />
            ))}
          </div>
        ) : (
          <Empty icon={Heart} title="No saved boarding houses yet" action={<ButtonLink href="/boarding-houses">Browse boarding houses</ButtonLink>}>
            Save a boarding house to compare rooms and prices later.
          </Empty>
        )}
      </div>
    </div>
  );
}
