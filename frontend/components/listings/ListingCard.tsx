"use client";

import Link from "next/link";
import { Bath, BedDouble, Heart, Home, Maximize2, ShieldCheck, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavourites } from "@/lib/favourites";
import { KIND_LABEL, PRICE_SUFFIX, kwacha, kwachaShort } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { Fact, buttonClass } from "@/components/kit";

export function HeartButton({
  saved,
  onToggle,
  label,
  className,
}: {
  saved: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${label} from favourites` : `Save ${label} to favourites`}
      className={cn(
        "grid size-9 place-items-center rounded-full bg-surface/95 shadow-sm transition-transform active:scale-90",
        className
      )}
    >
      <Heart className={cn("size-[18px]", saved ? "fill-heart text-heart" : "text-muted-ink")} />
    </button>
  );
}

export function CoverImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  if (!src) {
    return (
      <div className={cn("grid place-items-center bg-gradient-to-br from-info-soft to-subtle", className)}>
        <Home className="size-8 text-marker/40" aria-hidden />
        <span className="sr-only">No photo yet</span>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" className={cn("object-cover", className)} />;
}

export function ListingCard({
  listing,
  active,
  onHover,
}: {
  listing: Listing;
  active?: boolean;
  onHover?: (id: number | null) => void;
}) {
  const { listingIds, toggle } = useFavourites();
  const { property } = listing;
  const saved = listingIds.has(listing.id);
  const verified = property.owner_verified && property.property_verified;
  const href = `/listings/${listing.id}`;

  return (
    <article
      id={`result-${listing.id}`}
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "group overflow-hidden rounded-2xl border bg-surface transition-[border-color,box-shadow]",
        active ? "border-marker shadow-[0_0_0_3px_var(--marker-soft)]" : "border-line"
      )}
    >
      <div className="relative">
        <Link href={href} tabIndex={-1} aria-hidden>
          <CoverImage src={property.images[0]?.url} alt="" className="aspect-[5/4] w-full" />
        </Link>
        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
          {listing.booking_mode === "instant" && listing.kind !== "sale" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface/95 px-2.5 py-1 text-xs font-semibold text-ink">
              <Zap className="size-3.5 text-marker" aria-hidden /> Instant booking
            </span>
          )}
        </div>
        <HeartButton saved={saved} onToggle={() => toggle({ listingId: listing.id })} label={property.title} className="absolute top-3 right-3" />
      </div>

      {/* White panel rises over the photo with a rounded top edge, as in the reference */}
      <div className="relative -mt-5 rounded-t-[20px] bg-surface p-4 pt-5">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-[13px] text-muted-ink">
            {property.neighbourhood ? `${property.neighbourhood}, ${property.town}` : property.address}
          </p>
          {listing.rating.average ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-ink-2">
              <Star className="size-3 fill-star text-star" aria-hidden /> {listing.rating.average}
            </span>
          ) : verified ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-ok">
              <ShieldCheck className="size-3" aria-hidden /> Verified
            </span>
          ) : null}
        </div>
        <h3 className="mt-1 truncate text-base font-semibold text-ink">
          <Link href={href} className="hover:underline">
            {property.title}
          </Link>
        </h3>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Fact icon={BedDouble}>
            <b className="font-semibold text-ink">{property.bedrooms}</b> Bed
          </Fact>
          <Fact icon={Bath}>
            <b className="font-semibold text-ink">{property.bathrooms}</b> Bath
          </Fact>
          {property.size_sqm ? (
            <Fact icon={Maximize2}>
              <b className="font-semibold text-ink">{property.size_sqm}</b> m²
            </Fact>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <Link href={href} className={buttonClass("primary", "sm", "px-4")}>
            View details<span className="sr-only">: {property.title}</span>
          </Link>
          <p className="text-right">
            <span className="block text-xl font-bold tracking-tight text-ink tabular-nums">
              {listing.kind === "sale" ? kwachaShort(listing.price) : kwacha(listing.price)}
            </span>
            <span className="text-xs text-muted-ink">
              {KIND_LABEL[listing.kind]}
              {PRICE_SUFFIX[listing.kind] && ` · ${PRICE_SUFFIX[listing.kind].slice(1)}`}
            </span>
          </p>
        </div>
      </div>
    </article>
  );
}
