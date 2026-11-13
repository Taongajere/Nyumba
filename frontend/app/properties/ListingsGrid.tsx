"use client"; // Tells Next.js this component listens to user clicks in the browser

import { useState } from "react";
import Link from "next/link";

// The filter choices matching the "kind" values stored in Django
const FILTERS = [
  { label: "All", value: "all" },
  { label: "Rent", value: "rent" },
  { label: "Sale", value: "sale" },
  { label: "Short stay", value: "stay" },
];

export default function ListingsGrid({ listings }: { listings: any[] }) {
  // Memory box tracking which button is currently clicked (starts on "all")
  const [selectedKind, setSelectedKind] = useState("all");

  // Keep only the listings that match the selected button
  const filteredListings =
    selectedKind === "all"
      ? listings
      : listings.filter((listing) => listing.kind === selectedKind);

  return (
    <div>
      {/* 1. Filter Buttons Bar */}
      <div className="mb-8 flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const isActive = selectedKind === filter.value;
          return (
            <button
              key={filter.value}
              onClick={() => setSelectedKind(filter.value)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-[#133a2a] text-white shadow-sm"
                  : "border border-[#133a2a]/20 bg-white text-[#133a2a] hover:bg-[#133a2a]/5"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* 2. Filtered Cards Grid */}
      {filteredListings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#133a2a]/20 bg-white p-8 text-center text-stone-500">
          No approved properties in this category yet.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredListings.map((listing: any) => (
            <Link
                href={`/properties/${listing.id}`}
                key={listing.id}
                className="block overflow-hidden rounded-xl border border-[#133a2a]/15 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-36 items-center justify-center bg-[#133a2a]/10 text-sm font-medium text-[#133a2a]/60">
                Photo coming soon
              </div>

              <div className="p-5">
                <span className="inline-block rounded-full bg-[#d4a843]/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#9a741c]">
                  {listing.kind}
                </span>

                <h2 className="mt-3 text-lg font-bold text-[#133a2a]">
                  {listing.property?.title || "Untitled Property"}
                </h2>
                <p className="mt-1 text-sm text-stone-500">
                  {listing.property?.address || "Lusaka"}
                </p>

                <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                  <p className="text-xl font-bold text-[#133a2a]">
                    K{Number(listing.price).toLocaleString()}
                  </p>
                  <span className="text-sm font-medium text-stone-600">
                    {listing.property?.bedrooms ?? 1} Bed
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}