"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Pill filter from the reference: "× Beds: 4–10 ⌄". The × clears it, the pill opens a panel.
export function FilterChip({
  label,
  value,
  onClear,
  children,
  align = "left",
  width = "w-72",
}: {
  label: string;
  value?: string; // shown when the filter is active
  onClear?: () => void;
  children: (close: () => void) => React.ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = Boolean(value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <div
        className={cn(
          "flex h-11 items-center rounded-full border bg-surface text-sm transition-colors",
          active ? "border-line-strong" : "border-line",
          open && "border-marker ring-4 ring-marker-soft"
        )}
      >
        {active && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="grid size-8 place-items-center rounded-full pl-1.5 text-ink-2 hover:text-ink"
            aria-label={`Clear ${label}`}
          >
            <X className="size-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className={cn("flex h-full items-center gap-1.5 pr-3.5", active && onClear ? "pl-1" : "pl-4")}
        >
          <span className={active ? "text-muted-ink" : "font-semibold text-ink"}>
            {label}
            {active && ":"}
          </span>
          {active && <span className="font-semibold text-ink">{value}</span>}
          <ChevronDown className={cn("size-4 text-muted-ink transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      </div>
      {open && (
        <div
          className={cn(
            "absolute top-full z-40 mt-2 rounded-2xl border border-line bg-surface p-4 shadow-xl",
            width,
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// Row of pill options used inside chip panels ("Any", "1+", "2+"...).
export function PillOptions<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            "h-9 rounded-full border px-3.5 text-sm font-semibold transition-colors",
            value === o.value ? "border-navy bg-navy text-white" : "border-line text-ink-2 hover:border-line-strong"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RangeInputs({
  min,
  max,
  onApply,
  prefix,
  suffix,
}: {
  min: number;
  max: number;
  onApply: (min: number, max: number) => void;
  prefix?: string;
  suffix?: string;
}) {
  const [lo, setLo] = useState(min ? String(min) : "");
  const [hi, setHi] = useState(max ? String(max) : "");
  const invalid = Boolean(lo && hi && Number(lo) > Number(hi));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!invalid) onApply(Number(lo) || 0, Number(hi) || 0);
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Minimum", v: lo, set: setLo },
          { label: "Maximum", v: hi, set: setHi },
        ].map((f) => (
          <label key={f.label} className="block">
            <span className="mb-1 block text-xs font-semibold text-muted-ink">{f.label}</span>
            <span className="flex items-center rounded-xl border border-line-strong px-3 focus-within:border-marker">
              {prefix && <span className="text-sm text-muted-ink">{prefix}</span>}
              <input
                inputMode="numeric"
                value={f.v}
                onChange={(e) => f.set(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="Any"
                className="h-10 w-full min-w-0 bg-transparent px-1.5 text-sm outline-none"
              />
              {suffix && <span className="text-sm text-muted-ink">{suffix}</span>}
            </span>
          </label>
        ))}
      </div>
      {invalid && <p className="mt-2 text-[13px] text-bad">Minimum can&apos;t be above maximum.</p>}
      <button type="submit" disabled={invalid} className="mt-3 h-10 w-full rounded-full bg-navy text-sm font-semibold text-white disabled:opacity-50">
        Apply
      </button>
    </form>
  );
}
