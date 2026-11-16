// Property search filters live in the URL, so a search can be shared and survives a refresh.
import type { ListingKind } from "@/lib/types";

export type SortKey = "newest" | "price-asc" | "price-desc";

export type ListingFilters = {
  q: string;
  town: string;
  kind: "" | ListingKind;
  type: string;
  beds: number;
  baths: number;
  minPrice: number;
  maxPrice: number;
  minSize: number;
  maxSize: number;
  furnishing: string;
  availableBy: string;
  amenities: string[];
  instant: boolean;
  verified: boolean;
  sort: SortKey;
  area: boolean; // limit results to the visible map area
};

export const DEFAULT_FILTERS: ListingFilters = {
  q: "",
  town: "Lusaka",
  kind: "",
  type: "",
  beds: 0,
  baths: 0,
  minPrice: 0,
  maxPrice: 0,
  minSize: 0,
  maxSize: 0,
  furnishing: "",
  availableBy: "",
  amenities: [],
  instant: false,
  verified: false,
  sort: "newest",
  area: true,
};

export const TOWNS = ["Lusaka", "Kitwe", "Ndola", "Livingstone", "Kabwe", "Chingola", "Solwezi"];
export const AMENITY_OPTIONS = ["Borehole", "Solar backup", "Wi-Fi", "Parking", "Security", "Garden", "DSTV", "Water tank"];

const num = (v: string | null) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function parseFilters(params: URLSearchParams): ListingFilters {
  const kind = params.get("kind") ?? "";
  const sort = params.get("sort") ?? "";
  return {
    q: (params.get("q") ?? "").slice(0, 100),
    town: params.get("town") ?? DEFAULT_FILTERS.town,
    kind: ["rent", "sale", "stay"].includes(kind) ? (kind as ListingKind) : "",
    type: params.get("type") ?? "",
    beds: Math.min(num(params.get("beds")), 6),
    baths: Math.min(num(params.get("baths")), 5),
    minPrice: num(params.get("min")),
    maxPrice: num(params.get("max")),
    minSize: num(params.get("minsize")),
    maxSize: num(params.get("maxsize")),
    furnishing: params.get("furnishing") ?? "",
    availableBy: /^\d{4}-\d{2}-\d{2}$/.test(params.get("by") ?? "") ? params.get("by")! : "",
    amenities: (params.get("amenities") ?? "").split(",").filter((a) => AMENITY_OPTIONS.includes(a)),
    instant: params.get("instant") === "1",
    verified: params.get("verified") === "1",
    sort: ["price-asc", "price-desc"].includes(sort) ? (sort as SortKey) : "newest",
    area: params.get("area") !== "0",
  };
}

export function filtersToQuery(f: ListingFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.town !== DEFAULT_FILTERS.town) p.set("town", f.town);
  if (f.kind) p.set("kind", f.kind);
  if (f.type) p.set("type", f.type);
  if (f.beds) p.set("beds", String(f.beds));
  if (f.baths) p.set("baths", String(f.baths));
  if (f.minPrice) p.set("min", String(f.minPrice));
  if (f.maxPrice) p.set("max", String(f.maxPrice));
  if (f.minSize) p.set("minsize", String(f.minSize));
  if (f.maxSize) p.set("maxsize", String(f.maxSize));
  if (f.furnishing) p.set("furnishing", f.furnishing);
  if (f.availableBy) p.set("by", f.availableBy);
  if (f.amenities.length) p.set("amenities", f.amenities.join(","));
  if (f.instant) p.set("instant", "1");
  if (f.verified) p.set("verified", "1");
  if (f.sort !== "newest") p.set("sort", f.sort);
  if (!f.area) p.set("area", "0");
  return p.toString();
}

export type Bounds = { west: number; south: number; east: number; north: number };

// What the Django search endpoint expects.
export function toApiQuery(f: ListingFilters, bounds: Bounds | null): string {
  const p = new URLSearchParams();
  if (f.area && bounds) {
    p.set("bbox", [bounds.west, bounds.south, bounds.east, bounds.north].map((n) => n.toFixed(5)).join(","));
  } else if (f.town) {
    p.set("town", f.town);
  }
  if (f.q) p.set("q", f.q);
  if (f.kind) p.set("kind", f.kind);
  if (f.type) p.set("property_type", f.type);
  if (f.beds) p.set("bedrooms", String(f.beds));
  if (f.baths) p.set("bathrooms", String(f.baths));
  if (f.minPrice) p.set("min_price", String(f.minPrice));
  if (f.maxPrice) p.set("max_price", String(f.maxPrice));
  if (f.minSize) p.set("min_size", String(f.minSize));
  if (f.maxSize) p.set("max_size", String(f.maxSize));
  if (f.furnishing) p.set("furnishing", f.furnishing);
  if (f.availableBy) p.set("available_by", f.availableBy);
  if (f.amenities.length) p.set("amenities", f.amenities.join(","));
  if (f.instant) p.set("instant", "true");
  if (f.verified) p.set("verified", "true");
  p.set("sort", f.sort);
  return p.toString();
}

export const TOWN_CENTRES: Record<string, [number, number, number]> = {
  // lng, lat, zoom
  Lusaka: [28.3, -15.41, 11.6],
  Kitwe: [28.22, -12.81, 12],
  Ndola: [28.64, -12.97, 12],
  Livingstone: [25.86, -17.85, 12.5],
  Kabwe: [28.45, -14.44, 12.5],
  Chingola: [27.85, -12.53, 12.5],
  Solwezi: [26.39, -12.18, 12.5],
};
