"use client";

import { FURNISHING, PROPERTY_TYPES } from "@/lib/format";
import { AMENITY_OPTIONS, TOWNS } from "@/lib/listing-filters";
import { cn } from "@/lib/utils";
import { Field } from "@/components/kit";

export type PropertyDraft = {
  title: string;
  description: string;
  property_type: string;
  bedrooms: number;
  bathrooms: number;
  size_sqm: number | null;
  furnishing: string;
  amenities: string[];
  address: string;
  neighbourhood: string;
  town: string;
  latitude: number | null;
  longitude: number | null;
};

export const EMPTY_PROPERTY: PropertyDraft = {
  title: "",
  description: "",
  property_type: "house",
  bedrooms: 2,
  bathrooms: 1,
  size_sqm: null,
  furnishing: "unfurnished",
  amenities: [],
  address: "",
  neighbourhood: "",
  town: "Lusaka",
  latitude: null,
  longitude: null,
};

// The shared set of property fields, used by "add property", "edit property" and "add boarding house".
export function PropertyFields({
  value,
  onChange,
  errors = {},
  hideType,
}: {
  value: PropertyDraft;
  onChange: (v: PropertyDraft) => void;
  errors?: Record<string, string[] | undefined>;
  hideType?: boolean;
}) {
  const set = <K extends keyof PropertyDraft>(k: K, v: PropertyDraft[K]) => onChange({ ...value, [k]: v });
  const num = (s: string) => (s === "" ? null : Number(s));
  const err = (k: string) => errors[k]?.[0];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Title" error={err("title")} className="sm:col-span-2" hint="What guests see first, e.g. 'Two-bedroom flat near Arcades'.">
        <input className="field" required maxLength={120} value={value.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      {!hideType && (
        <Field label="Type">
          <select className="field" value={value.property_type} onChange={(e) => set("property_type", e.target.value)}>
            {Object.entries(PROPERTY_TYPES)
              .filter(([k]) => k !== "boarding_house")
              .map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field label="Furnishing">
        <select className="field" value={value.furnishing} onChange={(e) => set("furnishing", e.target.value)}>
          {Object.entries(FURNISHING).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-3 gap-3 sm:col-span-2">
        <Field label="Bedrooms" error={err("bedrooms")}>
          <input className="field" type="number" min={0} value={value.bedrooms} onChange={(e) => set("bedrooms", Number(e.target.value))} />
        </Field>
        <Field label="Bathrooms" error={err("bathrooms")}>
          <input className="field" type="number" min={0} value={value.bathrooms} onChange={(e) => set("bathrooms", Number(e.target.value))} />
        </Field>
        <Field label="Size (m²)" error={err("size_sqm")}>
          <input className="field" type="number" min={0} value={value.size_sqm ?? ""} onChange={(e) => set("size_sqm", num(e.target.value))} />
        </Field>
      </div>
      <Field label="Street address" error={err("address")} className="sm:col-span-2">
        <input className="field" required value={value.address} onChange={(e) => set("address", e.target.value)} placeholder="Plot 123, Lukasu Road" />
      </Field>
      <Field label="Neighbourhood">
        <input className="field" value={value.neighbourhood} onChange={(e) => set("neighbourhood", e.target.value)} placeholder="Kabulonga" />
      </Field>
      <Field label="Town">
        <input className="field" list="towns" required value={value.town} onChange={(e) => set("town", e.target.value)} />
        <datalist id="towns">
          {TOWNS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Field label="Latitude" error={err("latitude")} hint="Puts the pin on the map. In Google Maps, long-press the spot and copy the numbers.">
        <input className="field" inputMode="decimal" value={value.latitude ?? ""} onChange={(e) => set("latitude", num(e.target.value))} placeholder="-15.4135" />
      </Field>
      <Field label="Longitude" error={err("longitude")}>
        <input className="field" inputMode="decimal" value={value.longitude ?? ""} onChange={(e) => set("longitude", num(e.target.value))} placeholder="28.3305" />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea className="field" rows={4} value={value.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <fieldset className="sm:col-span-2">
        <legend className="label">Amenities</legend>
        <div className="flex flex-wrap gap-1.5">
          {[...AMENITY_OPTIONS, "Study room", "Laundry"].map((a) => {
            const on = value.amenities.includes(a);
            return (
              <button
                key={a}
                type="button"
                aria-pressed={on}
                onClick={() => set("amenities", on ? value.amenities.filter((x) => x !== a) : [...value.amenities, a])}
                className={cn("h-9 rounded-full border px-3.5 text-sm font-semibold", on ? "border-navy bg-navy text-white" : "border-line text-ink-2")}
              >
                {a}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
