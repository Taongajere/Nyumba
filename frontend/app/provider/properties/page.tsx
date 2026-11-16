"use client";

import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import { useApi } from "@/lib/api";
import { KIND_LABEL, PRICE_SUFFIX, PROPERTY_TYPES, kwacha } from "@/lib/format";
import { CoverImage } from "@/components/listings/ListingCard";
import { Badge, ButtonLink, Empty, Notice, PageTitle, Spinner } from "@/components/kit";
import { LISTING_STATUS, type ProviderProperty } from "@/components/provider/types";

export default function MyPropertiesPage() {
  const { data, error, loading } = useApi<ProviderProperty[]>("provider/properties");
  const homes = (data ?? []).filter((p) => p.property_type !== "boarding_house");

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle
        title="My properties"
        description="Homes and short stays you rent out or sell. Boarding houses have their own section."
        action={
          <ButtonLink href="/provider/properties/new">
            <Plus className="size-4" /> Add property
          </ButtonLink>
        }
      />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <Notice tone="red">{error.message}</Notice>
      ) : homes.length === 0 ? (
        <Empty icon={Building2} title="No properties yet" action={<ButtonLink href="/provider/properties/new">Add your first property</ButtonLink>}>
          Add a property, set a price and submit it. An administrator reviews new listings before they go live.
        </Empty>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {homes.map((p) => (
            <li key={p.id} className="flex gap-4 rounded-2xl border border-line p-3">
              <CoverImage src={p.images[0]?.url} alt="" className="aspect-square w-28 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 py-1">
                <Link href={`/provider/properties/${p.id}`} className="font-semibold text-ink hover:underline">
                  {p.title}
                </Link>
                <p className="truncate text-[13px] text-muted-ink">
                  {PROPERTY_TYPES[p.property_type]} · {p.neighbourhood || p.address}
                </p>
                <div className="mt-2 space-y-1.5">
                  {p.listings.length === 0 && <p className="text-[13px] text-warn">No listing yet. Add a price to put it on the marketplace.</p>}
                  {p.listings.map((l) => (
                    <div key={l.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-semibold text-ink">
                        {KIND_LABEL[l.kind]} · {kwacha(l.price)}
                        {PRICE_SUFFIX[l.kind]}
                      </span>
                      <Badge tone={LISTING_STATUS[l.status].tone}>{LISTING_STATUS[l.status].label}</Badge>
                      {l.status === "approved" && <Badge tone={l.is_published ? "blue" : "gray"}>{l.is_published ? "Live" : "Unpublished"}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
