"use client";

import { useEffect, useMemo, useState } from "react";
import { API_URL, type Listing } from "@/lib/listings";
import { type ListingFilters, type SortKey } from "@/lib/listing-filters";

export type Bounds = { west: number; south: number; east: number; north: number };

// Whole-of-Lusaka box used until the map reports its real viewport.
export const LUSAKA_BOUNDS: Bounds = { west: 28.15, south: -15.55, east: 28.45, north: -15.25 };

// Shape returned by GET /api/listings/search/
type SearchResponse = {
  results: Listing[];
  count: number;
  truncated: boolean;
};

type Entry = {
  key: string;
  error: boolean;
  listings: Listing[];
  count: number;
  truncated: boolean;
};

// Build the same query the backend expects; the key doubles as the cache identity.
export function buildSearchParams(filters: ListingFilters, bounds: Bounds): URLSearchParams {
  const params = new URLSearchParams({
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north].map((n) => n.toFixed(5)).join(","),
  });
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.area) params.set("neighbourhood", filters.area);
  if (filters.beds > 0) params.set("bedrooms", String(filters.beds));
  if (filters.maxPrice > 0) params.set("max_price", String(filters.maxPrice));
  return params;
}

export function sortListings(listings: Listing[], sort: SortKey): Listing[] {
  const copy = [...listings];
  if (sort === "price-asc") copy.sort((a, b) => Number(a.price) - Number(b.price));
  if (sort === "price-desc") copy.sort((a, b) => Number(b.price) - Number(a.price));
  return copy; // "newest" keeps the server order (newest first)
}

// Fetches listings inside the bounds. Debounced, and stale requests are aborted.
export function useListingSearch(filters: ListingFilters, bounds: Bounds) {
  const params = useMemo(() => buildSearchParams(filters, bounds), [filters, bounds]);
  const key = params.toString();
  const [entry, setEntry] = useState<Entry | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/listings/search/?${key}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as SearchResponse;
        setEntry({
          key,
          error: false,
          listings: data.results,
          count: data.count,
          truncated: data.truncated,
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setEntry({ key, error: true, listings: [], count: 0, truncated: false });
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  // Keep the previous results on screen while a new search runs, so the grid doesn't flash.
  // `loading` says whether what's shown belongs to the current filters and bounds.
  return {
    listings: entry?.listings ?? [],
    count: entry?.count ?? 0,
    truncated: entry?.truncated ?? false,
    error: entry?.error ?? false,
    loading: entry === null || entry.key !== key,
    hasLoaded: entry !== null,
  };
}
