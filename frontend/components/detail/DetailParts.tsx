"use client";

import { useState } from "react";
import { Check, Flag, ShieldCheck, ShieldQuestion, Star } from "lucide-react";
import { api } from "@/lib/api";
import { PROVIDER_TYPES } from "@/lib/format";
import type { PropertyImage, ProviderCard } from "@/lib/types";
import { CoverImage } from "@/components/listings/ListingCard";
import { Avatar } from "@/components/UserMenu";
import { Button, Dialog, Field, Notice } from "@/components/kit";

export function Gallery({ images, title }: { images: PropertyImage[]; title: string }) {
  const [index, setIndex] = useState(0);
  const main = images[index];
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
      <CoverImage src={main?.url} alt={main?.caption || title} className="aspect-[16/10] max-h-[440px] w-full rounded-3xl" />
      {images.length > 1 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto sm:flex-col sm:overflow-visible">
          {images.slice(0, 4).map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Show photo ${i + 1}`}
              aria-current={i === index}
              className={`shrink-0 overflow-hidden rounded-2xl border-2 ${i === index ? "border-marker" : "border-transparent"}`}
            >
              <CoverImage src={img.url} alt="" className="aspect-[4/3] w-28 sm:w-full" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Amenities({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
      {items.map((a) => (
        <li key={a} className="flex items-center gap-2 text-[15px] text-ink-2">
          <Check className="size-4 text-ok" aria-hidden /> {a}
        </li>
      ))}
    </ul>
  );
}

export function Verification({ owner, property }: { owner: boolean; property: boolean }) {
  const row = (ok: boolean, yes: string, no: string) => (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <ShieldCheck className="size-4 text-ok" aria-hidden /> : <ShieldQuestion className="size-4 text-muted-ink" aria-hidden />}
      <span className={ok ? "text-ink" : "text-muted-ink"}>{ok ? yes : no}</span>
    </li>
  );
  return (
    <ul className="space-y-1.5">
      {row(owner, "Owner identity checked by Nyumba", "Owner identity not checked yet")}
      {row(property, "Ownership documents checked", "Ownership documents not checked yet")}
    </ul>
  );
}

export function ProviderBox({ provider, children }: { provider: ProviderCard; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line p-4">
      <Avatar name={provider.name} className="size-12 text-base" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink">{provider.name}</p>
        <p className="text-[13px] text-muted-ink">
          {PROVIDER_TYPES[provider.provider_type] ?? "Provider"} · on Nyumba since {provider.member_since}
        </p>
      </div>
      {children}
    </div>
  );
}

export function Reviews({ reviews }: { reviews: { id: number; rating: number; comment: string; username: string; created_at: string }[] }) {
  if (!reviews.length) return <p className="text-sm text-muted-ink">No reviews yet. Guests can review after a completed stay.</p>;
  return (
    <ul className="space-y-4">
      {reviews.map((r) => (
        <li key={r.id} className="rounded-2xl border border-line p-4">
          <p className="flex items-center gap-1 text-sm font-semibold text-ink">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={`size-3.5 ${i < r.rating ? "fill-star text-star" : "text-line-strong"}`} aria-hidden />
            ))}
            <span className="sr-only">{r.rating} out of 5</span>
            <span className="ml-2">{r.username}</span>
          </p>
          {r.comment && <p className="mt-1.5 text-[15px] text-ink-2">{r.comment}</p>}
        </li>
      ))}
    </ul>
  );
}

export function EnquiryForm({ target, defaultName, defaultPhone }: { target: { listing_id?: number; boarding_house_id?: number }; defaultName: string; defaultPhone: string }) {
  const [form, setForm] = useState({ name: defaultName, phone: defaultPhone, message: "" });
  const [state, setState] = useState<{ busy: boolean; error: string; done: string }>({ busy: false, error: "", done: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "", done: "" });
    try {
      const res = await api<{ message: string }>("enquiries", { method: "POST", body: { ...target, ...form } });
      setState({ busy: false, error: "", done: res.message });
    } catch (err) {
      setState({ busy: false, error: (err as Error).message, done: "" });
    }
  }
  if (state.done) return <Notice tone="green">{state.done}</Notice>;
  return (
    <form onSubmit={submit} className="space-y-3">
      {state.error && <Notice tone="red">{state.error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name">
          <input className="field" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Phone">
          <input className="field" type="tel" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
      </div>
      <Field label="Message">
        <textarea className="field" rows={3} required placeholder="When can I view it?" value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
      </Field>
      <Button type="submit" variant="secondary" busy={state.busy}>
        Send enquiry
      </Button>
    </form>
  );
}

const REPORT_REASONS = ["Wrong or misleading details", "Looks like a scam", "Already taken", "Offensive content", "Other"];

export function ReportLink({ target }: { target: { listing?: number; boarding_house?: number } }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REPORT_REASONS[0]);
  const [details, setDetails] = useState("");
  const [state, setState] = useState({ busy: false, error: "", done: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "", done: "" });
    try {
      const res = await api<{ message: string }>("reports", { method: "POST", body: { ...target, reason, details } });
      setState({ busy: false, error: "", done: res.message });
    } catch (err) {
      setState({ busy: false, error: (err as Error).message, done: "" });
    }
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-ink hover:text-ink">
        <Flag className="size-4" aria-hidden /> Report this listing
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Report this listing">
        {state.done ? (
          <Notice tone="green">{state.done}</Notice>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {state.error && <Notice tone="red">{state.error}</Notice>}
            <Field label="What's wrong?">
              <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
                {REPORT_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            <Field label="Details (optional)">
              <textarea className="field" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} />
            </Field>
            <Button type="submit" busy={state.busy} className="w-full">
              Send report
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}
