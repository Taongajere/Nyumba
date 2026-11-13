import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";

// 1. The Waiter: Fetches ONE specific listing by its ID number from Django
async function getSingleListing(id: string) {
  const res = await fetch(`http://127.0.0.1:8000/api/listings/${id}/`, {
    cache: "no-store",
  });

  // If the ID doesn't exist (or isn't approved), show Next.js's clean 404 page
  if (res.status === 404) {
    notFound();
  }

  if (!res.ok) {
    throw new Error("Could not load this property from Django.");
  }

  return res.json();
}

// 2. The Full House View: Displays all details for that single property
async function PropertyDetails({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // Reads the ID number from the URL (e.g., "1")
  const listing = await getSingleListing(id);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#133a2a]/15 bg-white shadow-sm">
      {/* Large Photo Placeholder */}
      <div className="flex h-64 items-center justify-center bg-[#133a2a]/10 text-base font-medium text-[#133a2a]/60">
        Property Photos Coming Soon
      </div>

      <div className="p-6 sm:p-8">
        {/* Top Row: Category Badge & Verified Tag */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="rounded-full bg-[#d4a843]/20 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#9a741c]">
            {listing.kind}
          </span>
          <span className="rounded-full bg-[#133a2a]/10 px-3 py-1 text-xs font-semibold text-[#133a2a]">
            ✓ Approved Listing
          </span>
        </div>

        {/* Title, Address & Price */}
        <div className="mt-4 flex flex-col justify-between gap-4 border-b border-stone-100 pb-6 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-bold text-[#133a2a] sm:text-3xl">
              {listing.property?.title || "Untitled Property"}
            </h1>
            <p className="mt-1 text-stone-500">
              {listing.property?.address || "Lusaka, Zambia"}
            </p>
          </div>
          <p className="text-3xl font-bold text-[#133a2a]">
            K{Number(listing.price).toLocaleString()}
          </p>
        </div>

        {/* Key Specs */}
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-[#faf8f5] p-4">
            <p className="text-xs uppercase tracking-wide text-stone-500">
              Bedrooms
            </p>
            <p className="mt-1 text-lg font-bold text-[#133a2a]">
              {listing.property?.bedrooms ?? 1}
            </p>
          </div>
          <div className="rounded-xl bg-[#faf8f5] p-4">
            <p className="text-xs uppercase tracking-wide text-stone-500">
              Listing Type
            </p>
            <p className="mt-1 text-lg font-bold capitalize text-[#133a2a]">
              {listing.kind}
            </p>
          </div>
          <div className="rounded-xl bg-[#faf8f5] p-4">
            <p className="text-xs uppercase tracking-wide text-stone-500">
              Reference ID
            </p>
            <p className="mt-1 text-lg font-bold text-[#133a2a]">
              #{listing.id}
            </p>
          </div>
        </div>

        {/* Placeholder Enquiry Call-to-Action (We wire this up in Phase 5!) */}
        <div className="mt-8 rounded-xl bg-[#133a2a] p-6 text-white">
          <h2 className="text-lg font-bold">Interested in this property?</h2>
          <p className="mt-1 text-sm text-white/80">
            Enquiry & viewing requests are coming soon in the next phase.
          </p>
        </div>
      </div>
    </div>
  );
}

// 3. Page Shell with Back Button & Suspense Loader
export default function SinglePropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <main className="min-h-screen bg-[#faf8f5] px-6 py-10 text-[#133a2a]">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/properties"
          className="mb-6 inline-flex items-center text-sm font-semibold text-[#133a2a] hover:underline"
        >
          ← Back to all listings
        </Link>

        <Suspense
          fallback={
            <p className="text-stone-500">Loading property details...</p>
          }
        >
          <PropertyDetails params={params} />
        </Suspense>
      </div>
    </main>
  );
}