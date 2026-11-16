import type { BookingStatus, ListingKind } from "@/lib/types";

// Zambian Kwacha, written the way prices are read locally: K18,500.
export function kwacha(amount: string | number, { decimals = false } = {}): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "K0";
  return `K${value.toLocaleString("en-ZM", {
    minimumFractionDigits: decimals ? 2 : 0,
    maximumFractionDigits: decimals ? 2 : 0,
  })}`;
}

// Short price for map pins and tight spaces: K18.5k, K4.2M.
export function kwachaShort(amount: string | number): string {
  const n = Number(amount);
  if (n >= 1_000_000) return `K${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `K${(n / 1000).toFixed(n >= 10_000 ? 0 : 1).replace(/\.0$/, "")}k`;
  return `K${Math.round(n)}`;
}

export const KIND_LABEL: Record<ListingKind, string> = { rent: "For rent", sale: "For sale", stay: "Short stay" };
export const PRICE_SUFFIX: Record<ListingKind, string> = { rent: "/month", sale: "", stay: "/night" };

export const PROPERTY_TYPES: Record<string, string> = {
  house: "House",
  apartment: "Apartment",
  townhouse: "Townhouse",
  cottage: "Cottage",
  room: "Room",
  boarding_house: "Boarding house",
  commercial: "Commercial",
  land: "Land",
};

export const FURNISHING: Record<string, string> = {
  furnished: "Furnished",
  semi_furnished: "Semi-furnished",
  unfurnished: "Unfurnished",
};

export const ROOM_TYPES: Record<string, string> = {
  single: "Single",
  double: "Double",
  triple: "Triple",
  dorm: "Dormitory",
  self_contained: "Self-contained",
};

export const GENDER: Record<string, string> = { mixed: "Mixed", female: "Female only", male: "Male only" };

export const PROVIDER_TYPES: Record<string, string> = {
  landlord: "Landlord / owner",
  agent: "Estate agent",
  property_manager: "Property manager",
  boarding_house: "Boarding-house operator",
  short_stay_host: "Short-stay host",
};

export type Tone = "green" | "amber" | "red" | "blue" | "gray";

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: Tone }> = {
  pending: { label: "Waiting for provider", tone: "amber" },
  accepted: { label: "Accepted", tone: "blue" },
  rejected: { label: "Declined", tone: "red" },
  awaiting_payment: { label: "Awaiting payment", tone: "amber" },
  confirmed: { label: "Confirmed", tone: "green" },
  cancelled: { label: "Cancelled", tone: "gray" },
  completed: { label: "Completed", tone: "gray" },
};

export function date(
  value: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }
) {
  if (!value) return "";
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-GB", opts);
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(value: string) {
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} d ago`;
  return date(value);
}

export function plural(n: number, word: string, many = `${word}s`) {
  return `${n} ${n === 1 ? word : many}`;
}

export function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
