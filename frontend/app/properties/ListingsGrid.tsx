"use client";

import { useState } from "react";
import Link from "next/link";

const KIND_FILTERS = [
  { label: "All", value: "all" },
  { label: "Rent", value: "rent" },
  { label: "Sale", value: "sale" },
  { label: "Short stay", value: "stay" },
];

const NEIGHBOURHOODS = [
  "All Areas",
  "Kabulonga",
  "Woodlands",
  "Roma",
  "Ibex Hill",
  "Chilenje",
  "Olympia",
  "Avondale",
];

// Popular Lusaka landmarks with their exact GPS coordinates
const LANDMARKS = [
  { name: "Anywhere in Lusaka", lat: null, lng: null },
  { name: "University of Zambia (UNZA)", lat: -15.3917, lng: 28.3292 },
  { name: "East Park Mall", lat: -15.3965, lng: 28.3168 },
  { name: "Manda Hill", lat: -15.3905, lng: 28.3075 },
  { name: "Lusaka CBD (Cairo Rd)", lat: -15.4167, lng: 28.2833 },
  { name: "Kenneth Kaunda Airport", lat: -15.3308, lng: 28.4526 },
];

// Tiny ruler that calculates distance in kilometres between two GPS pins
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ListingsGrid({ listings }: { listings: any[] }) {
  const [selectedKind, setSelectedKind] = useState("all");
  const [selectedArea, setSelectedArea] = useState("All Areas");
  const [selectedLandmarkIndex, setSelectedLandmarkIndex] = useState(0);
  const [radiusKm, setRadiusKm] = useState(5);

  const activeLandmark = LANDMARKS[selectedLandmarkIndex];

  // Filter listings by Type, Neighbourhood, AND Landmark Distance
  const filteredListings = listings.filter((listing) => {
    // 1. Check category (Rent / Sale / Short stay)
    if (selectedKind !== "all" && listing.kind !== selectedKind) {
      return false;
    }

    // 2. Check neighbourhood name
    const propArea = (listing.property?.neighbourhood || "").toLowerCase();
    const propAddress = (listing.property?.address || "").toLowerCase();
    if (selectedArea !== "All Areas") {
      const target = selectedArea.toLowerCase();
      if (!propArea.includes(target) && !propAddress.includes(target)) {
        return false;
      }
    }

    // 3. Check distance around chosen landmark
    if (activeLandmark.lat !== null && activeLandmark.lng !== null) {
      const lat = listing.property?.latitude;
      const lng = listing.property?.longitude;
      if (lat == null || lng == null) return false;

      const distance = getDistanceKm(
        activeLandmark.lat,
        activeLandmark.lng,
        lat,
        lng
      );
      if (distance > radiusKm) return false;
    }

    return true;
  });

  return (
    <div>
      {/* 1. Category Filter Pills */}
      <div className="mb-4 flex flex-wrap gap-2">
        {KIND_FILTERS.map((filter) => {
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

      {/* 2. Lusaka Location & Radius Search Bar */}
      <div className="mb-8 grid gap-3 rounded-2xl border border-[#133a2a]/15 bg-white p-4 shadow-sm sm:grid-cols-3">
        {/* Neighbourhood Dropdown */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
            Neighbourhood
          </label>
          <select
            value={selectedArea}
            onChange={(e) => setSelectedArea(e.target.value)}
            className="mt-1 w-full rounded-xl border border-[#133a2a]/20 bg-[#faf8f5] px-3 py-2 text-sm font-medium focus:border-[#133a2a] focus:outline-none"
          >
            {NEIGHBOURHOODS.map((area) => (
              <option key={area} value={area}>
                {area}
              </option>
            ))}
          </select>
        </div>

        {/* Landmark Dropdown */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
            Near Landmark
          </label>
          <select
            value={selectedLandmarkIndex}
            onChange={(e) => setSelectedLandmarkIndex(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-[#133a2a]/20 bg-[#faf8f5] px-3 py-2 text-sm font-medium focus:border-[#133a2a] focus:outline-none"
          >
            {LANDMARKS.map((lm, idx) => (
              <option key={lm.name} value={idx}>
                {lm.name}
              </option>
            ))}
          </select>
        </div>

        {/* Distance Radius Picker */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-stone-500">
            Search Radius
          </label>
          <select
            disabled={activeLandmark.lat === null}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            className="mt-1 w-full rounded-xl border border-[#133a2a]/20 bg-[#faf8f5] px-3 py-2 text-sm font-medium disabled:opacity-40 focus:border-[#133a2a] focus:outline-none"
          >
            <option value={2}>Within 2 km</option>
            <option value={5}>Within 5 km</option>
            <option value={10}>Within 10 km</option>
            <option value={20}>Within 20 km</option>
          </select>
        </div>
      </div>

      {/* 3. Matching Property Cards */}
      {filteredListings.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#133a2a]/20 bg-white p-8 text-center text-stone-500">
          No approved properties match these location filters yet.
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredListings.map((listing: any) => {
            // Calculate exact distance from chosen landmark if selected
            const distance =
              activeLandmark.lat !== null &&
              activeLandmark.lng !== null &&
              listing.property?.latitude != null &&
              listing.property?.longitude != null
                ? getDistanceKm(
                    activeLandmark.lat,
                    activeLandmark.lng,
                    listing.property.latitude,
                    listing.property.longitude
                  )
                : null;

            return (
              <Link
                href={`/properties/${listing.id}`}
                key={listing.id}
                className="block overflow-hidden rounded-xl border border-[#133a2a]/15 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex h-36 items-center justify-center bg-[#133a2a]/10 text-sm font-medium text-[#133a2a]/60">
                  Photo coming soon
                </div>

                <div className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-block rounded-full bg-[#d4a843]/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#9a741c]">
                      {listing.kind}
                    </span>

                    {listing.property?.neighbourhood && (
                      <span className="text-xs font-semibold text-[#133a2a]/70">
                        📍 {listing.property.neighbourhood}
                      </span>
                    )}
                  </div>

                  <h2 className="mt-3 text-lg font-bold text-[#133a2a]">
                    {listing.property?.title || "Untitled Property"}
                  </h2>
                  <p className="mt-1 text-sm text-stone-500">
                    {listing.property?.address || "Lusaka"}
                  </p>

                  {distance !== null && (
                    <p className="mt-2 text-xs font-semibold text-[#9a741c]">
                      {distance.toFixed(1)} km from {activeLandmark.name}
                    </p>
                  )}

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
            );
          })}
        </div>
      )}
    </div>
  );
}