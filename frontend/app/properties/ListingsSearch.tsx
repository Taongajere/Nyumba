"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { List, Map as MapIcon } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingCard } from "@/components/listings/ListingCard";
import { ListingFilters as FilterBar } from "@/components/listings/ListingFilters";

// MapLibre needs a browser canvas, so the map is never rendered on the server.
const ListingsMap = dynamic(() => import("@/components/listings/ListingsMap"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-1 items-center justify-center rounded-2xl border border-border bg-card text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});
import {
  countActiveFilters,
  filtersToQuery,
  parseFilters,
  type ListingFilters,
} from "@/lib/listing-filters";
import { LUSAKA_BOUNDS, sortListings, useListingSearch } from "@/lib/use-listing-search";

type MobileView = "list" | "map";

export default function ListingsSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The URL is the source of truth for filters. Parsing it again on each render keeps back/forward working.
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  const updateFilters = useCallback(
    (patch: Partial<ListingFilters>) => {
      const query = filtersToQuery({ ...filters, ...patch });
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router]
  );

  // Phones show one panel at a time; desktop always shows both side by side.
  const [mobileView, setMobileView] = useState<MobileView>("list");

  // Map bounds drive the search. Until the map exists, the whole of Lusaka is searched.
  const [bounds, setBounds] = useState(LUSAKA_BOUNDS);
  const search = useListingSearch(filters, bounds);
  const listings = useMemo(() => sortListings(search.listings, filters.sort), [search.listings, filters.sort]);

  const activeCount = countActiveFilters(filters);
  const resultLabel = search.error
    ? "Could not load listings. Is the API running?"
    : !search.hasLoaded
      ? "Searching…"
      : `${search.count} home${search.count === 1 ? "" : "s"} in this map area${
          search.truncated ? ` (showing the first ${listings.length})` : ""
        }`;

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-4.5rem)]">
      {/* One sticky group, so the filters and the mobile switch never overlap */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur">
        {/* 1. Filter bar: state lives in the URL */}
        <div className="border-b border-border px-4 py-3 lg:px-6">
          <FilterBar filters={filters} onChange={updateFilters} />
        </div>

        {/* 2. Mobile-only list / map switch */}
        <div className="flex justify-center py-2 lg:hidden">
        <ToggleGroup
          value={[mobileView]}
          onValueChange={(next) => {
            if (next[0]) setMobileView(next[0] as MobileView);
          }}
          variant="outline"
        >
          <ToggleGroupItem value="list" aria-label="Show list">
            <List className="size-4" /> List
          </ToggleGroupItem>
          <ToggleGroupItem value="map" aria-label="Show map">
            <MapIcon className="size-4" /> Map
          </ToggleGroupItem>
        </ToggleGroup>
        </div>
      </div>

      <div className="flex flex-1 flex-col lg:min-h-0 lg:flex-row">
        {/* 3. Map panel (left on desktop) */}
        <section
          className={`${
            mobileView === "map" ? "flex" : "hidden"
          } h-[65dvh] flex-col p-4 lg:flex lg:h-auto lg:w-[46%] lg:p-6 lg:pr-3`}
        >
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <ListingsMap
              listings={listings}
              visible={mobileView === "map"}
              onBoundsChange={setBounds}
            />
          </div>
        </section>

        {/* 4. Results panel (right on desktop) */}
        <section
          className={`${
            mobileView === "list" ? "block" : "hidden"
          } flex-1 p-4 lg:block lg:min-h-0 lg:overflow-y-auto lg:p-6 lg:pl-3`}
        >
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            {filters.area ? `Homes in ${filters.area}` : "Homes in Lusaka"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {resultLabel}
            {activeCount > 0 && !search.loading && " · filtered"}
          </p>

          <div
            className={`mt-4 grid grid-cols-2 gap-3 transition-opacity sm:gap-4 xl:grid-cols-3 ${
              search.loading && search.hasLoaded ? "opacity-60" : ""
            }`}
          >
            {!search.hasLoaded ? (
              Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
              ))
            ) : listings.length === 0 && !search.error ? (
              <p className="col-span-full rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No homes match these filters yet. Try clearing a filter.
              </p>
            ) : (
              listings.map((listing) => <ListingCard key={listing.id} listing={listing} />)
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
