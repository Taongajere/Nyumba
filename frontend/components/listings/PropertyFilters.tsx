"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FURNISHING, PROPERTY_TYPES, kwachaShort } from "@/lib/format";
import { AMENITY_OPTIONS, DEFAULT_FILTERS, TOWNS, type ListingFilters } from "@/lib/listing-filters";
import { FilterChip, PillOptions, RangeInputs } from "@/components/filters/FilterChip";
import { Button, Dialog } from "@/components/kit";

type Props = { filters: ListingFilters; onChange: (patch: Partial<ListingFilters>) => void };

const KIND_OPTIONS = [
  { value: "", label: "Any" },
  { value: "rent", label: "For rent" },
  { value: "sale", label: "For sale" },
  { value: "stay", label: "Short stay" },
] as const;

const TYPE_OPTIONS = Object.entries(PROPERTY_TYPES).filter(([k]) => k !== "boarding_house");

function rangeLabel(min: number, max: number, fmt: (n: number) => string) {
  if (min && max) return `${fmt(min)} – ${fmt(max)}`;
  if (min) return `${fmt(min)}+`;
  if (max) return `up to ${fmt(max)}`;
  return "";
}

// The search row from the reference: location chips + search box, then one pill per filter.
export function PropertyFilters({ filters, onChange }: Props) {
  const [q, setQ] = useState(filters.q);
  const [lastQ, setLastQ] = useState(filters.q);
  const [moreOpen, setMoreOpen] = useState(false);
  if (filters.q !== lastQ) {
    // The URL changed (back button, "clear"): show its search text.
    setLastQ(filters.q);
    setQ(filters.q);
  }

  const moreCount = [filters.furnishing, filters.availableBy, filters.amenities.length, filters.instant, filters.verified, filters.minSize || filters.maxSize].filter(Boolean).length;

  return (
    <div className="scrollbar-none flex items-center gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:overflow-visible lg:px-8">
      {/* Location group */}
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          onChange({ q: q.trim() });
        }}
        className="flex h-11 shrink-0 items-center gap-1 rounded-full border border-line bg-subtle p-1"
      >
        <label className="sr-only" htmlFor="town">
          Town
        </label>
        <span className="relative flex h-full items-center rounded-full bg-surface pr-1 pl-2 shadow-sm">
          <select
            id="town"
            value={filters.town}
            onChange={(e) => onChange({ town: e.target.value, area: false })}
            className="h-full cursor-pointer appearance-none bg-transparent pr-2 pl-1 text-[13px] font-semibold text-ink outline-none"
          >
            {TOWNS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </span>
        {filters.q && (
          <span className="flex h-full items-center gap-1 rounded-full bg-surface pr-3 pl-1 text-[13px] font-semibold text-ink shadow-sm">
            <button type="button" onClick={() => onChange({ q: "" })} aria-label="Clear search" className="grid size-6 place-items-center rounded-full hover:bg-subtle">
              <X className="size-3.5" />
            </button>
            {filters.q}
          </span>
        )}
        <span className="flex h-full items-center gap-2 pr-3 pl-2">
          <Search className="size-4 text-muted-ink" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Neighbourhood, address…"
            aria-label="Search by neighbourhood or address"
            className="w-44 bg-transparent text-sm outline-none placeholder:text-muted-ink/80"
          />
        </span>
      </form>

      <FilterChip
        label="Listing"
        value={KIND_OPTIONS.find((o) => o.value === filters.kind && o.value)?.label}
        onClear={() => onChange({ kind: "" })}
      >
        {(close) => (
          <PillOptions
            value={filters.kind}
            options={[...KIND_OPTIONS]}
            onChange={(v) => {
              onChange({ kind: v });
              close();
            }}
          />
        )}
      </FilterChip>

      <FilterChip label="Type" value={filters.type ? PROPERTY_TYPES[filters.type] : undefined} onClear={() => onChange({ type: "" })}>
        {(close) => (
          <PillOptions
            value={filters.type}
            options={[{ value: "", label: "Any" }, ...TYPE_OPTIONS.map(([value, label]) => ({ value, label }))]}
            onChange={(v) => {
              onChange({ type: v });
              close();
            }}
          />
        )}
      </FilterChip>

      <FilterChip label="Beds" value={filters.beds ? `${filters.beds}+` : undefined} onClear={() => onChange({ beds: 0 })}>
        {(close) => (
          <PillOptions
            value={filters.beds}
            options={[0, 1, 2, 3, 4, 5].map((n) => ({ value: n, label: n ? `${n}+` : "Any" }))}
            onChange={(v) => {
              onChange({ beds: v });
              close();
            }}
          />
        )}
      </FilterChip>

      <FilterChip label="Baths" value={filters.baths ? `${filters.baths}+` : undefined} onClear={() => onChange({ baths: 0 })}>
        {(close) => (
          <PillOptions
            value={filters.baths}
            options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: n ? `${n}+` : "Any" }))}
            onChange={(v) => {
              onChange({ baths: v });
              close();
            }}
          />
        )}
      </FilterChip>

      <FilterChip
        label="Price"
        value={rangeLabel(filters.minPrice, filters.maxPrice, kwachaShort) || undefined}
        onClear={() => onChange({ minPrice: 0, maxPrice: 0 })}
      >
        {(close) => (
          <RangeInputs
            prefix="K"
            min={filters.minPrice}
            max={filters.maxPrice}
            onApply={(minPrice, maxPrice) => {
              onChange({ minPrice, maxPrice });
              close();
            }}
          />
        )}
      </FilterChip>

      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        className="flex h-11 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-semibold text-ink hover:bg-subtle"
      >
        <SlidersHorizontal className="size-4" aria-hidden /> More filters
        {moreCount > 0 && <span className="grid size-5 place-items-center rounded-full bg-marker text-[11px] text-white">{moreCount}</span>}
      </button>

      <MoreFilters open={moreOpen} onClose={() => setMoreOpen(false)} filters={filters} onChange={onChange} />
    </div>
  );
}

function MoreFilters({ open, onClose, filters, onChange }: Props & { open: boolean; onClose: () => void }) {
  const [draft, setDraft] = useState(filters);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    // Start each opening from the filters currently applied.
    setWasOpen(open);
    if (open) setDraft(filters);
  }
  const set = (patch: Partial<ListingFilters>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <Dialog open={open} onClose={onClose} title="More filters" wide>
      <div className="space-y-6">
        <section>
          <h3 className="label">Furnishing</h3>
          <PillOptions
            value={draft.furnishing}
            options={[{ value: "", label: "Any" }, ...Object.entries(FURNISHING).map(([value, label]) => ({ value, label }))]}
            onChange={(furnishing) => set({ furnishing })}
          />
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Size from (m²)</span>
            <input className="field" inputMode="numeric" value={draft.minSize || ""} onChange={(e) => set({ minSize: Number(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="Any" />
          </label>
          <label className="block">
            <span className="label">Size up to (m²)</span>
            <input className="field" inputMode="numeric" value={draft.maxSize || ""} onChange={(e) => set({ maxSize: Number(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="Any" />
          </label>
        </section>
        <section>
          <label className="block sm:w-1/2">
            <span className="label">Available to move in by</span>
            <input className="field" type="date" value={draft.availableBy} onChange={(e) => set({ availableBy: e.target.value })} />
          </label>
        </section>
        <section>
          <h3 className="label">Amenities</h3>
          <div className="flex flex-wrap gap-1.5">
            {AMENITY_OPTIONS.map((a) => {
              const on = draft.amenities.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ amenities: on ? draft.amenities.filter((x) => x !== a) : [...draft.amenities, a] })}
                  className={cn(
                    "h-9 rounded-full border px-3.5 text-sm font-semibold",
                    on ? "border-navy bg-navy text-white" : "border-line text-ink-2 hover:border-line-strong"
                  )}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </section>
        <section className="space-y-3">
          {[
            { key: "instant" as const, label: "Instant booking only", hint: "Book and pay without waiting for the provider." },
            { key: "verified" as const, label: "Verified places only", hint: "Owner identity and ownership documents checked by Nyumba." },
          ].map((opt) => (
            <label key={opt.key} className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" checked={draft[opt.key]} onChange={(e) => set({ [opt.key]: e.target.checked })} className="mt-1 size-4 accent-[var(--navy)]" />
              <span>
                <span className="block text-sm font-semibold text-ink">{opt.label}</span>
                <span className="text-[13px] text-muted-ink">{opt.hint}</span>
              </span>
            </label>
          ))}
        </section>
        <div className="flex justify-between gap-3 border-t border-line pt-5">
          <Button
            variant="ghost"
            onClick={() =>
              set({
                furnishing: "",
                minSize: 0,
                maxSize: 0,
                availableBy: "",
                amenities: [],
                instant: DEFAULT_FILTERS.instant,
                verified: DEFAULT_FILTERS.verified,
              })
            }
          >
            Clear these
          </Button>
          <Button
            onClick={() => {
              onChange({
                furnishing: draft.furnishing,
                minSize: draft.minSize,
                maxSize: draft.maxSize,
                availableBy: draft.availableBy,
                amenities: draft.amenities,
                instant: draft.instant,
                verified: draft.verified,
              });
              onClose();
            }}
          >
            Show results
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
