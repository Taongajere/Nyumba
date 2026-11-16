"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { GraduationCap, List, Map as MapIcon, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { GENDER, ROOM_TYPES, kwacha, kwachaShort } from "@/lib/format";
import { TOWN_CENTRES, TOWNS, type Bounds } from "@/lib/listing-filters";
import type { BoardingHouse } from "@/lib/types";
import { BoardingCard } from "@/components/boarding/BoardingCard";
import { FilterChip, PillOptions, RangeInputs } from "@/components/filters/FilterChip";
import { Empty, Notice } from "@/components/kit";
import type { MapPoint } from "@/components/map/ResultsMap";

const ResultsMap = dynamic(() => import("@/components/map/ResultsMap"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-3xl bg-subtle" />,
});

type Filters = { q: string; town: string; room: string; sharing: string; gender: string; min: number; max: number; area: boolean };

function parse(p: URLSearchParams): Filters {
  return {
    q: p.get("q") ?? "",
    town: p.get("town") ?? "Lusaka",
    room: p.get("room") ?? "",
    sharing: ["shared", "private"].includes(p.get("sharing") ?? "") ? p.get("sharing")! : "",
    gender: p.get("gender") ?? "",
    min: Number(p.get("min")) || 0,
    max: Number(p.get("max")) || 0,
    area: p.get("area") === "1",
  };
}

function toUrl(f: Filters) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.town !== "Lusaka") p.set("town", f.town);
  if (f.room) p.set("room", f.room);
  if (f.sharing) p.set("sharing", f.sharing);
  if (f.gender) p.set("gender", f.gender);
  if (f.min) p.set("min", String(f.min));
  if (f.max) p.set("max", String(f.max));
  if (f.area) p.set("area", "1");
  return p.toString();
}

function toApi(f: Filters, bounds: Bounds | null) {
  const p = new URLSearchParams();
  if (f.area && bounds) p.set("bbox", [bounds.west, bounds.south, bounds.east, bounds.north].map((n) => n.toFixed(5)).join(","));
  else p.set("town", f.town);
  if (f.q) p.set("q", f.q);
  if (f.room) p.set("room_type", f.room);
  if (f.sharing) p.set("sharing", f.sharing);
  if (f.gender) p.set("gender", f.gender);
  if (f.min) p.set("min_price", String(f.min));
  if (f.max) p.set("max_price", String(f.max));
  return p.toString();
}

function BoardingSearch() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const filters = useMemo(() => parse(new URLSearchParams(params.toString())), [params]);
  const update = useCallback(
    (patch: Partial<Filters>) => {
      const q = toUrl({ ...filters, ...patch });
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [filters, pathname, router]
  );
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "map">("list");
  const [q, setQ] = useState(filters.q);
  const [state, setState] = useState<{ key: string; houses: BoardingHouse[] | null; error: string }>({ key: "", houses: null, error: "" });

  const key = toApi(filters, bounds);
  useEffect(() => {
    const controller = new AbortController();
    const t = setTimeout(() => {
      api<{ results: BoardingHouse[] }>(`boarding-houses?${key}`, { signal: controller.signal })
        .then((d) => setState({ key, houses: d.results, error: "" }))
        .catch((e) => (e as Error).name !== "AbortError" && setState({ key, houses: null, error: (e as Error).message }));
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [key]);

  const houses = state.houses ?? [];
  const center = useMemo(() => TOWN_CENTRES[filters.town] ?? TOWN_CENTRES.Lusaka, [filters.town]);
  const points: MapPoint[] = houses.flatMap((h) =>
    h.property.latitude == null || h.property.longitude == null
      ? []
      : [
          {
            id: h.id,
            lat: h.property.latitude,
            lng: h.property.longitude,
            label: h.price_from ? kwachaShort(h.price_from) : "",
            title: h.name,
            subtitle: h.near_institution || h.property.neighbourhood,
            price: h.price_from ? `from ${kwacha(h.price_from)} per bed` : "",
            href: `/boarding-houses/${h.id}`,
            image: h.property.images[0]?.url,
          },
        ]
  );
  const spaces = houses.reduce((n, h) => n + h.rooms.reduce((m, r) => m + r.occupancy.available, 0), 0);

  return (
    <div className="flex flex-1 flex-col">
      <div className="scrollbar-none flex items-center gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:overflow-visible lg:px-8">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: q.trim() });
          }}
          className="flex h-11 shrink-0 items-center gap-1 rounded-full border border-line bg-subtle p-1"
        >
          <span className="flex h-full items-center rounded-full bg-surface px-2 shadow-sm">
            <label htmlFor="bh-town" className="sr-only">
              Town
            </label>
            <select id="bh-town" value={filters.town} onChange={(e) => update({ town: e.target.value, area: false })} className="h-full cursor-pointer appearance-none bg-transparent px-1 text-[13px] font-semibold outline-none">
              {TOWNS.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </span>
          <span className="flex h-full items-center gap-2 pr-3 pl-2">
            <Search className="size-4 text-muted-ink" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="University, college, area…" aria-label="Search by university or area" className="w-48 bg-transparent text-sm outline-none" />
          </span>
        </form>
        <FilterChip label="Room" value={filters.room ? ROOM_TYPES[filters.room] : undefined} onClear={() => update({ room: "" })}>
          {(close) => (
            <PillOptions
              value={filters.room}
              options={[{ value: "", label: "Any" }, ...Object.entries(ROOM_TYPES).map(([value, label]) => ({ value, label }))]}
              onChange={(room) => {
                update({ room });
                close();
              }}
            />
          )}
        </FilterChip>
        <FilterChip label="Sharing" value={filters.sharing ? (filters.sharing === "shared" ? "Shared" : "Private") : undefined} onClear={() => update({ sharing: "" })}>
          {(close) => (
            <PillOptions
              value={filters.sharing}
              options={[
                { value: "", label: "Any" },
                { value: "shared", label: "Shared room" },
                { value: "private", label: "Own room" },
              ]}
              onChange={(sharing) => {
                update({ sharing });
                close();
              }}
            />
          )}
        </FilterChip>
        <FilterChip label="Price per bed" value={filters.min || filters.max ? `${filters.min ? kwachaShort(filters.min) : "K0"} – ${filters.max ? kwachaShort(filters.max) : "any"}` : undefined} onClear={() => update({ min: 0, max: 0 })}>
          {(close) => (
            <RangeInputs
              prefix="K"
              min={filters.min}
              max={filters.max}
              onApply={(min, max) => {
                update({ min, max });
                close();
              }}
            />
          )}
        </FilterChip>
        <FilterChip label="Residents" value={filters.gender ? GENDER[filters.gender] : undefined} onClear={() => update({ gender: "" })}>
          {(close) => (
            <PillOptions
              value={filters.gender}
              options={[{ value: "", label: "Any" }, ...Object.entries(GENDER).map(([value, label]) => ({ value, label }))]}
              onChange={(gender) => {
                update({ gender });
                close();
              }}
            />
          )}
        </FilterChip>
      </div>

      <div className="flex flex-1 flex-col gap-5 px-4 pb-6 sm:px-6 lg:h-[calc(100dvh-10.5rem)] lg:flex-none lg:flex-row lg:px-8">
        <div className={cn("lg:block lg:min-h-0 lg:w-[55%] lg:shrink-0", mobileView === "map" ? "block" : "hidden")}>
          <div className="relative h-[62dvh] overflow-hidden rounded-3xl border border-line lg:h-full">
            <ResultsMap
              points={points}
              activeId={activeId}
              onActivate={setActiveId}
              onBoundsChange={setBounds}
              center={center}
              footer={
                <button type="button" onClick={() => update({ area: !filters.area })} className="h-10 rounded-full border border-line bg-surface px-5 text-sm font-semibold whitespace-nowrap shadow-md hover:bg-subtle">
                  {filters.area ? "Clear map boundary" : "Search this map area"}
                </button>
              }
            />
          </div>
        </div>
        <section aria-labelledby="bh-heading" className={cn("lg:block lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1", mobileView === "list" ? "block" : "hidden")}>
          <h1 id="bh-heading" className="text-[22px] font-bold tracking-tight">
            Student boarding houses in {filters.town}
          </h1>
          <p className="mt-1 text-sm text-muted-ink" aria-live="polite">
            {state.houses ? `${houses.length} ${houses.length === 1 ? "house" : "houses"} with ${spaces} free ${spaces === 1 ? "bed" : "beds"}. Full houses are hidden.` : "Searching…"}
          </p>
          {state.error && <Notice tone="red" className="mt-4">{state.error}</Notice>}
          <div className={cn("mt-5 grid gap-4 sm:grid-cols-2", state.key !== key && state.houses && "opacity-60")}>
            {!state.houses && !state.error
              ? Array.from({ length: 4 }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse rounded-2xl bg-subtle" />)
              : houses.map((h) => <BoardingCard key={h.id} house={h} active={activeId === h.id} onHover={setActiveId} />)}
          </div>
          {state.houses && houses.length === 0 && (
            <Empty icon={GraduationCap} title="No free beds match this search">
              Try another town, a different room type or a higher price.
            </Empty>
          )}
        </section>
        <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center lg:hidden">
          <button type="button" onClick={() => setMobileView((v) => (v === "list" ? "map" : "list"))} className="flex h-11 items-center gap-2 rounded-full bg-navy px-5 text-sm font-semibold text-white shadow-lg">
            {mobileView === "list" ? <MapIcon className="size-4" /> : <List className="size-4" />}
            {mobileView === "list" ? "Show map" : "Show list"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BoardingHousesPage() {
  return (
    <Suspense>
      <BoardingSearch />
    </Suspense>
  );
}
