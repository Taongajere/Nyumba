import { Suspense } from "react";
import Link from "next/link";

// 1. The Waiter: Fetches approved listings to show on the homepage
async function getFeaturedListings() {
  const res = await fetch("http://127.0.0.1:8000/api/listings/", {
    cache: "no-store",
  });

  if (!res.ok) {
    return [];
  }

  const data = await res.json();
  return data.slice(0, 3); // Show up to 3 featured properties on the front page
}

// 2. Featured Homes Preview
async function FeaturedSection() {
  const featured = await getFeaturedListings();

  if (featured.length === 0) {
    return (
      <p className="text-stone-500">
        No approved listings yet—add one in Django Admin to see it here!
      </p>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {featured.map((listing: any) => (
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

            <h3 className="mt-3 text-lg font-bold text-[#133a2a]">
              {listing.property?.title || "Untitled Property"}
            </h3>
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
  );
}

// 3. The Main Homepage
export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#faf8f5] text-[#133a2a]">
      {/* Dark Forest-Green Hero Banner */}
      <section className="bg-[#133a2a] px-6 py-16 text-white sm:py-24">
        <div className="mx-auto max-w-5xl">
          <span className="inline-block rounded-full bg-[#d4a843]/20 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-[#f3cf7a]">
            Lusaka Property Marketplace
          </span>

          <h1 className="mt-4 max-w-2xl text-3xl font-extrabold tracking-tight sm:text-5xl">
            Find verified homes, rentals, and short stays across Lusaka.
          </h1>

          <p className="mt-4 max-w-xl text-base text-white/80 sm:text-lg">
            Browse reviewed properties in Kabulonga, Woodlands, Roma, Ibex Hill,
            and beyond—with transparent pricing and direct owner connections.
          </p>

          {/* Primary Call-to-Action Buttons */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/properties"
              className="rounded-xl bg-[#d4a843] px-6 py-3 text-sm font-bold text-[#133a2a] shadow-sm transition hover:bg-[#e0b653]"
            >
              Explore All Properties
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Listings Section */}
      <section className="mx-auto max-w-5xl px-6 py-14">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#133a2a]">
              Featured Listings
            </h2>
            <p className="text-sm text-stone-500">
              Recently approved properties ready for viewing
            </p>
          </div>

          <Link
            href="/properties"
            className="text-sm font-semibold text-[#133a2a] hover:underline"
          >
            View all →
          </Link>
        </div>

        <Suspense
          fallback={<p className="text-stone-500">Loading featured homes...</p>}
        >
          <FeaturedSection />
        </Suspense>
      </section>
    </main>
  );
}