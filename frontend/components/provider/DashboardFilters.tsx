"use client";

import { X } from "lucide-react";

// One row of filters above the charts: property and date range.
export function DashboardFilters({
  properties,
  value,
  onChange,
}: {
  properties: { id: number; title: string }[];
  value: { from: string; to: string; property: string };
  onChange: (v: { from: string; to: string; property: string }) => void;
}) {
  const active = value.from || value.to || value.property;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted-ink">Property</span>
        <select className="field h-10 w-56" value={value.property} onChange={(e) => onChange({ ...value, property: e.target.value })}>
          <option value="">All properties</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted-ink">From</span>
        <input type="date" className="field h-10 w-40" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} />
      </label>
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-muted-ink">To</span>
        <input type="date" className="field h-10 w-40" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} />
      </label>
      {active && (
        <button type="button" onClick={() => onChange({ from: "", to: "", property: "" })} className="inline-flex h-10 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted-ink hover:bg-subtle">
          <X className="size-4" /> Clear
        </button>
      )}
    </div>
  );
}
