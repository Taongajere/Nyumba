"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BED_OPTIONS,
  DEFAULT_FILTERS,
  KIND_OPTIONS,
  PRICE_OPTIONS,
  SORT_OPTIONS,
  countActiveFilters,
  type ListingFilters,
} from "@/lib/listing-filters";
import { LUSAKA_NEIGHBOURHOODS } from "@/lib/listings";

type Props = {
  filters: ListingFilters;
  onChange: (patch: Partial<ListingFilters>) => void;
};

// Base UI resolves a selected value's label from `items`, so every Select needs its list up front.
const AREA_ITEMS = [
  { value: "all", label: "All of Lusaka" },
  ...LUSAKA_NEIGHBOURHOODS.map((name) => ({ value: name, label: name })),
];
const BED_ITEMS = BED_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));
const PRICE_ITEMS = PRICE_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }));
const SORT_ITEMS = SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

// Horizontal scroll on phones, one row on desktop. Each control writes straight to the URL via onChange.
export function ListingFilters({ filters, onChange }: Props) {
  const activeCount = countActiveFilters(filters);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Select
        items={AREA_ITEMS}
        value={filters.area || "all"}
        onValueChange={(value) => onChange({ area: value === "all" || !value ? "" : value })}
      >
        <SelectTrigger aria-label="Neighbourhood" className="h-9 min-w-40 shrink-0 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All of Lusaka</SelectItem>
          {LUSAKA_NEIGHBOURHOODS.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ToggleGroup
        aria-label="Listing type"
        variant="outline"
        className="shrink-0"
        value={[filters.kind]}
        onValueChange={(next) => {
          if (next[0]) onChange({ kind: next[0] as ListingFilters["kind"] });
        }}
      >
        {KIND_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="h-9 px-3 text-sm">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <Select
        items={BED_ITEMS}
        value={String(filters.beds)}
        onValueChange={(value) => onChange({ beds: Number(value) })}
      >
        <SelectTrigger aria-label="Bedrooms" className="h-9 shrink-0 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BED_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        items={PRICE_ITEMS}
        value={String(filters.maxPrice)}
        onValueChange={(value) => onChange({ maxPrice: Number(value) })}
      >
        <SelectTrigger aria-label="Maximum price" className="h-9 shrink-0 bg-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PRICE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={String(option.value)}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange({ ...DEFAULT_FILTERS, sort: filters.sort })}
            className="text-muted-foreground"
          >
            <X className="size-3.5" aria-hidden /> Clear ({activeCount})
          </Button>
        )}

        <Select
          items={SORT_ITEMS}
          value={filters.sort}
          onValueChange={(value) => onChange({ sort: value as ListingFilters["sort"] })}
        >
          <SelectTrigger aria-label="Sort by" className="h-9 bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORT_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
