"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bath, BedDouble, CalendarDays, Home, Maximize2, Sofa, Zap } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { displayName, useSession } from "@/lib/session";
import { useFavourites } from "@/lib/favourites";
import { FURNISHING, KIND_LABEL, PRICE_SUFFIX, PROPERTY_TYPES, date, kwacha, todayISO } from "@/lib/format";
import type { Booking, Listing } from "@/lib/types";
import { Amenities, EnquiryForm, Gallery, ProviderBox, ReportLink, Reviews, Verification } from "@/components/detail/DetailParts";
import { HeartButton } from "@/components/listings/ListingCard";
import { Badge, Button, Empty, Fact, Field, Notice, Spinner } from "@/components/kit";

type Detail = Listing & {
  is_public: boolean;
  can_manage: boolean;
  reviews: { id: number; rating: number; comment: string; username: string; created_at: string }[];
  unavailable: { check_in: string; check_out: string }[];
};

export default function ListingPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useApi<Detail>(`listings/${id}`);
  const { listingIds, toggle } = useFavourites();

  if (loading && !data) return <Spinner label="Loading listing" />;
  if (error || !data)
    return (
      <div className="p-8">
        <Empty icon={Home} title="This listing isn't available" action={<Link href="/" className="font-semibold text-marker">Back to search</Link>}>
          {error?.message}
        </Empty>
      </div>
    );

  const p = data.property;
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-ink hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Back to search
        </Link>
        <HeartButton saved={listingIds.has(data.id)} onToggle={() => toggle({ listingId: data.id })} label={p.title} className="border border-line" />
      </div>
      {!data.is_public && (
        <Notice tone="amber" className="mb-4">
          Only you and administrators can see this page. It isn&apos;t public ({data.status === "approved" ? "unpublished" : `status: ${data.status}`}).
        </Notice>
      )}

      <Gallery images={p.images} title={p.title} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="blue">{KIND_LABEL[data.kind]}</Badge>
              <Badge>{PROPERTY_TYPES[p.property_type] ?? p.property_type}</Badge>
              {data.booking_mode === "instant" && data.kind !== "sale" && (
                <Badge tone="green">
                  <Zap className="size-3" aria-hidden /> Instant booking
                </Badge>
              )}
            </div>
            <h1 className="mt-3 text-[30px] leading-tight font-bold tracking-tight text-ink">{p.title}</h1>
            <p className="mt-1 text-[15px] text-muted-ink">{p.address}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Fact icon={BedDouble}>
                <b className="font-semibold text-ink">{p.bedrooms}</b> Bed
              </Fact>
              <Fact icon={Bath}>
                <b className="font-semibold text-ink">{p.bathrooms}</b> Bath
              </Fact>
              {p.size_sqm ? (
                <Fact icon={Maximize2}>
                  <b className="font-semibold text-ink">{p.size_sqm}</b> m²
                </Fact>
              ) : null}
              <Fact icon={Sofa}>{FURNISHING[p.furnishing]}</Fact>
              {data.available_from && <Fact icon={CalendarDays}>From {date(data.available_from)}</Fact>}
            </div>
          </div>

          {p.description && (
            <section>
              <h2 className="mb-2 text-lg font-bold">About this place</h2>
              <p className="max-w-[68ch] text-[15px] leading-relaxed whitespace-pre-line text-ink-2">{p.description}</p>
            </section>
          )}
          {p.amenities.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">What&apos;s included</h2>
              <Amenities items={p.amenities} />
            </section>
          )}
          <section>
            <h2 className="mb-3 text-lg font-bold">Verification</h2>
            <Verification owner={p.owner_verified} property={p.property_verified} />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-bold">Listed by</h2>
            <ProviderBox provider={data.provider} />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-bold">Reviews {data.rating.count > 0 && <span className="font-medium text-muted-ink">({data.rating.average} from {data.rating.count})</span>}</h2>
            <Reviews reviews={data.reviews} />
          </section>
          <ReportLink target={{ listing: data.id }} />
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <BookingBox listing={data} />
        </aside>
      </div>
    </div>
  );
}

function BookingBox({ listing }: { listing: Detail }) {
  const router = useRouter();
  const { me } = useSession();
  const [tab, setTab] = useState<"book" | "ask">(listing.kind === "sale" ? "ask" : "book");
  const [form, setForm] = useState({
    check_in: listing.available_from && listing.available_from > todayISO(1) ? listing.available_from : todayISO(1),
    check_out: todayISO(3),
    months: 1,
    guest_name: `${me?.first_name ?? ""} ${me?.last_name ?? ""}`.trim(),
    guest_phone: me?.profile.phone_number ?? "",
    message: "",
  });
  const [state, setState] = useState({ busy: false, error: "" });

  const units = useMemo(() => {
    if (listing.kind === "stay") {
      const n = Math.round((new Date(form.check_out).getTime() - new Date(form.check_in).getTime()) / 86_400_000);
      return n > 0 ? n : 0;
    }
    return form.months;
  }, [form, listing.kind]);
  const estimate = units * Number(listing.price);

  const clash = listing.kind === "stay" && listing.unavailable.some((r) => form.check_in < r.check_out && form.check_out > r.check_in);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "" });
    try {
      const booking = await api<Booking>("bookings", {
        method: "POST",
        body: {
          listing_id: listing.id,
          guest_name: form.guest_name,
          guest_phone: form.guest_phone,
          message: form.message,
          check_in: form.check_in,
          ...(listing.kind === "stay" ? { check_out: form.check_out } : { months: form.months }),
        },
      });
      router.push(`/bookings/${booking.id}`);
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }

  const instant = listing.booking_mode === "instant";
  return (
    <div className="rounded-3xl border border-line p-5 shadow-[0_8px_24px_rgb(16_24_40/0.06)]">
      <p className="text-[28px] font-bold tracking-tight text-ink tabular-nums">
        {kwacha(listing.price)}
        <span className="text-base font-medium text-muted-ink">{PRICE_SUFFIX[listing.kind]}</span>
      </p>
      {listing.kind !== "sale" && (
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-subtle p-1" role="tablist">
          {(["book", "ask"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`h-9 rounded-full text-sm font-semibold ${tab === t ? "bg-surface text-ink shadow-sm" : "text-muted-ink"}`}
            >
              {t === "book" ? (instant ? "Book now" : "Request to book") : "Ask a question"}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5">
        {listing.can_manage ? (
          <Notice>This is your listing. Manage it in provider tools.</Notice>
        ) : tab === "ask" ? (
          <EnquiryForm target={{ listing_id: listing.id }} defaultName={displayName(me)} defaultPhone={me?.profile.phone_number ?? ""} />
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {state.error && <Notice tone="red">{state.error}</Notice>}
            {listing.kind === "stay" ? (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Check-in">
                  <input className="field" type="date" min={todayISO()} required value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
                </Field>
                <Field label="Check-out">
                  <input className="field" type="date" min={form.check_in} required value={form.check_out} onChange={(e) => setForm({ ...form, check_out: e.target.value })} />
                </Field>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Move in">
                  <input className="field" type="date" min={todayISO()} required value={form.check_in} onChange={(e) => setForm({ ...form, check_in: e.target.value })} />
                </Field>
                <Field label="Months to pay now">
                  <select className="field" value={form.months} onChange={(e) => setForm({ ...form, months: Number(e.target.value) })}>
                    {[1, 2, 3, 6, 12].map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            )}
            {clash && <Notice tone="amber">Some of those dates are already booked. Try other dates.</Notice>}
            <Field label="Name for the booking">
              <input className="field" required value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} />
            </Field>
            <Field label="Phone" hint="The provider uses this to reach you.">
              <input className="field" type="tel" required placeholder="0977 123 456" value={form.guest_phone} onChange={(e) => setForm({ ...form, guest_phone: e.target.value })} />
            </Field>
            {!instant && (
              <Field label="Message to the provider (optional)">
                <textarea className="field" rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
              </Field>
            )}
            {units > 0 && (
              <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
                <div className="flex justify-between text-ink-2">
                  <dt>
                    {kwacha(listing.price)} × {units} {listing.kind === "stay" ? (units === 1 ? "night" : "nights") : units === 1 ? "month" : "months"}
                  </dt>
                  <dd className="tabular-nums">{kwacha(estimate)}</dd>
                </div>
                <div className="flex justify-between font-bold text-ink">
                  <dt>Total</dt>
                  <dd className="tabular-nums">{kwacha(estimate)}</dd>
                </div>
              </dl>
            )}
            <Button type="submit" size="lg" busy={state.busy} disabled={units < 1 || clash} className="w-full">
              {instant ? "Book and pay" : "Send booking request"}
            </Button>
            <p className="text-center text-[13px] text-muted-ink">
              {instant
                ? `Your dates are held for 30 minutes while you pay.`
                : "You won't pay anything until the provider accepts."}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
