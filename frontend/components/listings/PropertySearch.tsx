"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, List, Map as MapIcon, SearchX } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { KIND_LABEL, PRICE_SUFFIX, kwacha, kwachaShort } from "@/lib/format";
import {
  DEFAULT_FILTERS,
  TOWN_CENTRES,
  filtersToQuery,
  parseFilters,
  toApiQuery,
  type Bounds,
  type ListingFilters,
} from "@/lib/listing-filters";
import type { Listing } from "@/lib/types";
import { ListingCard } from "@/components/listings/ListingCard";
import { PropertyFilters } from "@/components/listings/PropertyFilters";
import { Button, ButtonLink, Empty, Notice } from "@/components/kit";
import type { MapPoint } from "@/components/map/ResultsMap";

const ResultsMap = dynamic(() => import("@/components/map/ResultsMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-3xl bg-subtle" />,
});

type SearchResponse = { count: number; truncated: boolean; results: Listing[] };

// True on screens wide enough to show the map and the list side by side.
function useIsDesktop() {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(min-width: 1024px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => true
  );
}

export function PropertySearch({ layout }: { layout: "map" | "grid" }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseFilters(new URLSearchParams(searchParams.toString())), [searchParams]);

  const update = useCallback(
    (patch: Partial<ListingFilters>) => {
      const query = filtersToQuery({ ...filters, ...patch });
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [filters, pathname, router]
  );

  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [state, setState] = useState<{ key: string; data: SearchResponse | null; error: string }>({ key: "", data: null, error: "" });

  const isDesktop = useIsDesktop();
  // The map area only limits results while the map is on screen.
  const useBounds = layout === "map" && filters.area && (isDesktop || mobileView === "map");
  // Until the map reports its viewport, search the whole town so results show immediately.
  const key = toApiQuery(filters, useBounds ? bounds : null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api<SearchResponse>(`listings/search?${key}`, { signal: controller.signal })
        .then((data) => setState({ key, data, error: "" }))
        .catch((err) => {
          if ((err as Error).name !== "AbortError") setState({ key, data: null, error: (err as Error).message });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  const listings = useMemo(() => state.data?.results ?? [], [state.data]);
  const loading = state.key !== key;
  const center = TOWN_CENTRES[filters.town] ?? TOWN_CENTRES.Lusaka;
  const centerKey = useMemo(() => center, [center]);

  const points: MapPoint[] = useMemo(
    () =>
      listings.flatMap((l) =>
        l.property.latitude == null || l.property.longitude == null
          ? []
          : [
              {
                id: l.id,
                lat: l.property.latitude,
                lng: l.property.longitude,
                label: kwachaShort(l.price),
                title: l.property.title,
                subtitle: `${KIND_LABEL[l.kind]} · ${l.property.neighbourhood || l.property.town}`,
                price: `${kwacha(l.price)}${PRICE_SUFFIX[l.kind]}`,
                href: `/listings/${l.id}`,
                image: l.property.images[0]?.url,
              },
            ]
      ),
    [listings]
  );

  const heading = filters.q
    ? `Homes matching “${filters.q}”`
    : filters.kind === "stay"
      ? `Short stays in ${filters.town}`
      : filters.kind === "sale"
        ? `Homes for sale in ${filters.town}`
        : `Showing homes in ${filters.town}`;
  const count = state.data?.count ?? 0;
  const summary = state.error
    ? ""
    : !state.data
      ? "Searching…"
      : `${count} ${count === 1 ? "home" : "homes"}${useBounds ? " in this map area" : ""}${state.data.truncated ? `, showing the first ${listings.length}` : ""}`;

  const results = (
    <section aria-labelledby="results-heading" className={cn(layout === "map" && "lg:min-h-0 lg:overflow-y-auto")}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="results-heading" className="text-[22px] font-bold tracking-tight text-ink">
            {heading}
          </h1>
          <p className="mt-1 text-sm text-muted-ink" aria-live="polite">
            {summary}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-sm text-muted-ink">
          <ArrowUpDown className="size-4" aria-hidden />
          <span className="sr-only">Sort by</span>
          <select
            value={filters.sort}
            onChange={(e) => update({ sort: e.target.value as ListingFilters["sort"] })}
            className="cursor-pointer bg-transparent font-semibold text-ink outline-none"
          >
            <option value="newest">Newest</option>
            <option value="price-asc">Lowest price</option>
            <option value="price-desc">Highest price</option>
          </select>
        </label>
      </div>

      {state.error && (
        <Notice tone="red" className="mt-4">
          {state.error}
        </Notice>
      )}

      <div
        className={cn(
          "mt-5 grid gap-4 transition-opacity",
          layout === "map" ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
          loading && state.data && "opacity-60"
        )}
      >
        {!state.data && !state.error
          ? Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-subtle" />)
          : listings.map((l) => <ListingCard key={l.id} listing={l} active={activeId === l.id} onHover={setActiveId} />)}
      </div>

      {state.data && listings.length === 0 && (
        <Empty
          icon={SearchX}
          title="No homes match this search"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {useBounds && (
                <Button variant="secondary" onClick={() => update({ area: false })}>
                  Search all of {filters.town}
                </Button>
              )}
              <Button onClick={() => router.replace(pathname)}>Clear filters</Button>
            </div>
          }
        >
          {useBounds ? "Try moving or zooming out the map, or loosen a filter." : "Try loosening a filter or searching another town."}
        </Empty>
      )}
    </section>
  );

  return (
    <div className="flex flex-1 flex-col">
      <PropertyFilters filters={filters} onChange={update} />

      {layout === "grid" ? (
        <div className="px-4 pt-2 pb-10 sm:px-6 lg:px-8">{results}</div>
      ) : (
        <div className="flex flex-1 flex-col gap-5 px-4 pb-6 sm:px-6 lg:h-[calc(100dvh-10.5rem)] lg:flex-none lg:flex-row lg:px-8">
          <div className={cn("flex-col gap-4 lg:flex lg:min-h-0 lg:w-[55%] lg:shrink-0", mobileView === "map" ? "flex" : "hidden")}>
            <div className="relative h-[62dvh] overflow-hidden rounded-3xl border border-line lg:h-auto lg:min-h-0 lg:flex-1">
              <ResultsMap
                points={points}
                activeId={activeId}
                onActivate={setActiveId}
                onBoundsChange={setBounds}
                center={centerKey}
                overlay={
                  <>
                    <ToggleOverlay active={filters.kind === "stay"} onClick={() => update({ kind: filters.kind === "stay" ? "" : "stay" })}>
                      Short stays
                    </ToggleOverlay>
                    <ToggleOverlay active={filters.verified} onClick={() => update({ verified: !filters.verified })}>
                      Verified only
                    </ToggleOverlay>
                  </>
                }
                footer={
                  <button
                    type="button"
                    onClick={() => update({ area: !filters.area })}
                    className="h-10 rounded-full border border-line bg-surface px-5 text-sm font-semibold whitespace-nowrap text-ink shadow-md hover:bg-subtle"
                  >
                    {filters.area ? "Clear map boundary" : "Search this map area"}
                  </button>
                }
              />
            </div>
            <ProviderPrompt />
          </div>
          <div className={cn("lg:block lg:flex-1 lg:overflow-y-auto lg:pr-1", mobileView === "list" ? "block" : "hidden")}>{results}</div>

          <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center lg:hidden">
            <button
              type="button"
              onClick={() => setMobileView((v) => (v === "list" ? "map" : "list"))}
              className="flex h-11 items-center gap-2 rounded-full bg-navy px-5 text-sm font-semibold text-white shadow-lg"
            >
              {mobileView === "list" ? <MapIcon className="size-4" /> : <List className="size-4" />}
              {mobileView === "list" ? "Show map" : "Show list"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ToggleOverlay({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-10 rounded-full border px-4 text-sm font-semibold shadow-sm transition-colors",
        active ? "border-navy bg-navy text-white" : "border-line bg-surface text-ink hover:bg-subtle"
      )}
    >
      {children}
    </button>
  );
}

// The card under the map in the reference ("Connect with a local agent"), adapted to Nyumba's model.
function ProviderPrompt() {
  const { me } = useSession();
  if (!me) return null;
  const approved = me.provider_status === "approved";
  const pending = me.provider_status === "pending";
  return (
    <div className="hidden items-center gap-5 rounded-2xl border border-line bg-subtle/60 px-6 py-5 lg:flex">
      <div className="flex -space-x-3" aria-hidden>
        {["#2160e8", "#0f1d33", "#f5a524"].map((c, i) => (
          <span key={c} className="grid size-11 place-items-center rounded-full border-2 border-surface text-sm font-bold text-white" style={{ background: c }}>
            {["CM", "MB", "TP"][i]}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-lg font-semibold text-ink">{approved ? "Manage your places" : "Rent out your place on Nyumba"}</p>
        <p className="text-[15px] text-muted-ink">
          {approved
            ? "Your listings, boarding houses and bookings are in provider tools."
            : pending
              ? "Your provider application is being reviewed. We'll notify you."
              : "Landlords, agents and boarding-house operators list for free and pay commission only on bookings."}
        </p>
      </div>
      {!pending && (
        <ButtonLink href={approved ? "/provider" : "/become-provider"} variant="secondary" size="lg" className="shrink-0">
          {approved ? "Open provider tools" : "Become a provider"}
        </ButtonLink>
      )}
    </div>
  );
}

export { DEFAULT_FILTERS };
