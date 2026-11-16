import type { Property } from "@/lib/types";

export type ProviderListing = {
  id: number;
  kind: "rent" | "sale" | "stay";
  price: string;
  status: "pending" | "approved" | "rejected" | "removed";
  is_published: boolean;
  booking_mode: "request" | "instant";
  available_from: string | null;
  moderation_note: string;
};

export type Unit = {
  id: number;
  name: string;
  bedrooms: number;
  bathrooms: number;
  monthly_rent: string;
  status: "available" | "occupied" | "maintenance";
  tenant_name: string;
  tenant_phone: string;
  lease_start: string | null;
  lease_end: string | null;
};

export type ProviderProperty = Property & {
  listings: ProviderListing[];
  units: Unit[];
  boarding_house_id: number | null;
  is_owner: boolean;
  created_at: string;
};

export const LISTING_STATUS: Record<ProviderListing["status"], { label: string; tone: "green" | "amber" | "red" | "gray" }> = {
  pending: { label: "In review", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Needs changes", tone: "red" },
  removed: { label: "Removed", tone: "gray" },
};
