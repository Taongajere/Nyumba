import Link from "next/link";
import { BedDouble, Home, MapPin, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { KIND_META, formatZMW, type Listing } from "@/lib/listings";

export function ListingCard({ listing }: { listing: Listing }) {
  const { property } = listing;
  const kind = KIND_META[listing.kind];
  const verified = property.owner_verified && property.property_verified;

  return (
    <Card className="group gap-0 p-0 ring-foreground/10 transition hover:-translate-y-0.5 hover:shadow-md">
      {/* Photo area: real photos arrive with the photo upload feature */}
      <div className="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-primary/10 via-secondary to-accent/60">
        <Home className="size-8 text-primary/40" aria-hidden />
        <span className="sr-only">Photo coming soon</span>

        <Badge className="absolute top-2 left-2 bg-card/95 text-primary shadow-sm">
          {kind.label}
        </Badge>

        {verified && (
          <Badge className="absolute top-2 right-2 bg-card/95 text-emerald-800 shadow-sm">
            <ShieldCheck className="size-3" aria-hidden /> Verified
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3 sm:p-4">
        <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" aria-hidden />
          <span className="truncate">{property.neighbourhood || "Lusaka"}</span>
        </p>

        <h2 className="line-clamp-1 text-sm font-semibold text-primary sm:text-base">
          {property.title}
        </h2>

        <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5">
            <BedDouble className="size-3" aria-hidden />
            {property.bedrooms} bed{property.bedrooms === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 border-t border-border pt-3">
          <p className="text-sm font-bold text-primary sm:text-base">
            {formatZMW(listing.price)}
            {kind.priceSuffix && (
              <span className="text-xs font-medium text-muted-foreground">
                {" "}
                {kind.priceSuffix}
              </span>
            )}
          </p>
          <Link
            href={`/properties/${listing.id}`}
            className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
          >
            View
            <span className="sr-only"> {property.title}</span>
          </Link>
        </div>
      </div>
    </Card>
  );
}
