"use client";

import { useState } from "react";
import { useApi } from "@/lib/api";
import type { Notification } from "@/lib/types";

export type Dashboard = {
  properties: { id: number; title: string }[];
  totals: {
    properties: number;
    active_listings: number;
    pending_review: number;
    boarding_houses: number;
    units_total: number;
    units_occupied: number;
    units_available: number;
    beds_reserved: number;
    tenants: number;
    occupancy_rate: number;
    booking_requests: number;
    unread_enquiries: number;
  };
  money: {
    gross: string;
    commission: string;
    processing_fees: string;
    net_revenue: string;
    rental_income: string;
    pending_payments: { bookings: number; amount: string; occupant_balances: string };
    paid_out: string;
    by_category: Record<string, string>;
  };
  monthly_revenue: { month: string; gross: string; net: string; bookings: number }[];
  booking_performance: {
    by_status: Record<string, number>;
    total: number;
    acceptance_rate: number | null;
    payment_conversion: number | null;
  };
  recent_activity: Notification[];
};

export function useDashboard() {
  const [filters, setFilters] = useState({ from: "", to: "", property: "" });
  const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const result = useApi<Dashboard>(`provider/dashboard${q ? `?${q}` : ""}`);
  return { ...result, filters, setFilters };
}

export function monthLabel(key: string) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" });
}
