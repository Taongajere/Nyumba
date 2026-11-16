// Filter state lives in the URL, so every search is shareable and survives a refresh.
import { LUSAKA_NEIGHBOURHOODS, type ListingKind } from "@/lib/listings";

export type SortKey = "newest" | "price-asc" | "price-desc";

export type ListingFilters = {
  kind: "all" | ListingKind;
  area: string; // "" means all of Lusaka
  beds: number; // 0 means any; otherwise a minimum
  maxPrice: number; // ZMW; 0 means any
  sort: SortKey;
};

export const DEFAULT_FILTERS: ListingFilters = {
  kind: "all",
  area: "",
  beds: 0,
  maxPrice: 0,
  sort: "newest",
};

export const KIND_OPTIONS: { value: ListingFilters["kind"]; label: string }[] = [
  { value: "all", label: "All" },
  { value: "rent", label: "Rent" },
  { value: "sale", label: "Sale" },
  { value: "stay", label: "Short stay" },
];

export const BED_OPTIONS = [0, 1, 2, 3, 4].map((n) => ({
  value: n,
  label: n === 0 ? "Any beds" : `${n}+ beds`,
}));

export const PRICE_OPTIONS = [
  { value: 0, label: "Any price" },
  { value: 2500, label: "Up to ZMW 2,500" },
  { value: 5000, label: "Up to ZMW 5,000" },
  { value: 10000, label: "Up to ZMW 10,000" },
  { value: 25000, label: "Up to ZMW 25,000" },
  { value: 100000, label: "Up to ZMW 100,000" },
  { value: 500000, label: "Up to ZMW 500,000" },
  { value: 2000000, label: "Up to ZMW 2,000,000" },
];

export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
];

const KINDS = new Set<string>(["rent", "sale", "stay"]);
const SORTS = new Set<string>(SORT_OPTIONS.map((o) => o.value));

// Read filters from the URL, ignoring anything we don't recognise.
export function parseFilters(params: URLSearchParams): ListingFilters {
  const kindParam = params.get("kind") ?? "";
  const areaParam = params.get("area") ?? "";
  const bedsParam = Number(params.get("beds") ?? 0);
  const priceParam = Number(params.get("max") ?? 0);
  const sortParam = params.get("sort") ?? "";

  return {
    kind: KINDS.has(kindParam) ? (kindParam as ListingKind) : "all",
    area: (LUSAKA_NEIGHBOURHOODS as readonly string[]).includes(areaParam) ? areaParam : "",
    beds: Number.isInteger(bedsParam) && bedsParam >= 0 && bedsParam <= 4 ? bedsParam : 0,
    maxPrice: PRICE_OPTIONS.some((o) => o.value === priceParam && o.value > 0) ? priceParam : 0,
    sort: SORTS.has(sortParam) ? (sortParam as SortKey) : "newest",
  };
}

// Serialise only non-default values, so the default view has a clean URL.
export function filtersToQuery(filters: ListingFilters): string {
  const params = new URLSearchParams();
  if (filters.kind !== "all") params.set("kind", filters.kind);
  if (filters.area) params.set("area", filters.area);
  if (filters.beds > 0) params.set("beds", String(filters.beds));
  if (filters.maxPrice > 0) params.set("max", String(filters.maxPrice));
  if (filters.sort !== "newest") params.set("sort", filters.sort);
  return params.toString();
}

export function countActiveFilters(filters: ListingFilters): number {
  return [
    filters.kind !== "all",
    filters.area !== "",
    filters.beds > 0,
    filters.maxPrice > 0,
  ].filter(Boolean).length;
}
