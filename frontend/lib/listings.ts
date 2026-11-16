// Shared listing types, formatting and Lusaka reference data.

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export type ListingKind = "rent" | "sale" | "stay";

export type Listing = {
  id: number;
  kind: ListingKind;
  price: string; // Decimal comes over the wire as a string
  status: string;
  property: {
    id: number;
    title: string;
    address: string;
    neighbourhood: string;
    bedrooms: number;
    latitude: number | null;
    longitude: number | null;
    owner_verified: boolean;
    property_verified: boolean;
  };
};

export const KIND_META: Record<ListingKind, { label: string; priceSuffix: string }> = {
  rent: { label: "For rent", priceSuffix: "/month" },
  sale: { label: "For sale", priceSuffix: "" },
  stay: { label: "Short stay", priceSuffix: "/night" },
};

// Zambian Kwacha. Amounts are shown with the ISO code so nobody mistakes them for USD.
export function formatZMW(amount: string | number): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return `ZMW ${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Neighbourhoods shown in the area filter. Free text on the server, so keep these in sync with listings.
export const LUSAKA_NEIGHBOURHOODS = [
  "Avondale",
  "Chelstone",
  "Chilenje",
  "Ibex Hill",
  "Kabulonga",
  "Kalundu",
  "Kamwala",
  "Libala",
  "Longacres",
  "Makeni",
  "Mass Media",
  "Northmead",
  "Olympia",
  "Rhodes Park",
  "Roma",
  "Sunningdale",
  "Thorn Park",
  "Woodlands",
] as const;

// Map starts over Lusaka's CBD.
export const LUSAKA_CENTER: [number, number] = [28.2833, -15.4167];
