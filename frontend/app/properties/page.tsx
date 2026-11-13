import { Suspense } from "react";
import ListingsGrid from "./ListingsGrid";

async function getListings() {
  const res = await fetch("http://127.0.0.1:8000/api/listings/", {
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error("Could not talk to the Django kitchen!");
  }

  return res.json();
}

async function ListingsFeed() {
  const listings = await getListings();
  return <ListingsGrid listings={listings} />;
}

export default function PropertiesPage() {
  return (
    <main className="min-h-screen bg-[#faf8f5] px-6 py-10 text-[#133a2a]">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-3xl font-bold tracking-tight text-[#133a2a]">
          Nyumba Listings
        </h1>
        <p className="mt-1 mb-6 text-stone-600">
          Verified rentals, sales, and short stays in Lusaka
        </p>

        <Suspense fallback={<p className="text-stone-500">Loading homes...</p>}>
          <ListingsFeed />
        </Suspense>
      </div>
    </main>
  );
}