"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Bath, GraduationCap, Users, Zap } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { displayName, useSession } from "@/lib/session";
import { useFavourites } from "@/lib/favourites";
import { GENDER, ROOM_TYPES, kwacha, todayISO } from "@/lib/format";
import type { BoardingHouse, Booking, Room } from "@/lib/types";
import { Amenities, EnquiryForm, Gallery, ProviderBox, ReportLink, Reviews, Verification } from "@/components/detail/DetailParts";
import { HeartButton } from "@/components/listings/ListingCard";
import { BedDots } from "@/components/boarding/BedDots";
import { Badge, Button, Dialog, Empty, Field, Notice, Spinner } from "@/components/kit";

type Detail = BoardingHouse & {
  is_public: boolean;
  can_manage: boolean;
  reviews: { id: number; rating: number; comment: string; username: string; created_at: string }[];
};

export default function BoardingHousePage() {
  const { id } = useParams<{ id: string }>();
  const { data: h, error, loading } = useApi<Detail>(`boarding-houses/${id}`);
  const { houseIds, toggle } = useFavourites();
  const { me } = useSession();
  const [booking, setBooking] = useState<Room | null>(null);

  if (loading && !h) return <Spinner label="Loading boarding house" />;
  if (error || !h)
    return (
      <div className="p-8">
        <Empty icon={GraduationCap} title="This boarding house isn't available" action={<Link href="/boarding-houses" className="font-semibold text-marker">Back to boarding houses</Link>}>
          {error?.message}
        </Empty>
      </div>
    );

  const free = h.rooms.reduce((n, r) => n + r.occupancy.available, 0);
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/boarding-houses" className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-ink hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Boarding houses
        </Link>
        <HeartButton saved={houseIds.has(h.id)} onToggle={() => toggle({ houseId: h.id })} label={h.name} className="border border-line" />
      </div>
      {!h.is_public && <Notice tone="amber" className="mb-4">Only you and administrators can see this page right now.</Notice>}
      <Gallery images={h.property.images} title={h.name} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-8">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="blue">Boarding house</Badge>
              <Badge>{GENDER[h.gender_policy]}</Badge>
              {h.booking_mode === "instant" && (
                <Badge tone="green">
                  <Zap className="size-3" aria-hidden /> Instant booking
                </Badge>
              )}
            </div>
            <h1 className="mt-3 text-[30px] leading-tight font-bold tracking-tight">{h.name}</h1>
            <p className="mt-1 text-[15px] text-muted-ink">{h.property.address}</p>
            {h.near_institution && (
              <p className="mt-2 flex items-center gap-1.5 text-[15px] font-semibold text-ink-2">
                <GraduationCap className="size-4" aria-hidden /> Near {h.near_institution}
              </p>
            )}
          </div>

          <section aria-labelledby="rooms">
            <div className="mb-3 flex items-end justify-between">
              <h2 id="rooms" className="text-lg font-bold">
                Rooms
              </h2>
              <p className="text-sm text-muted-ink">
                {free} of {h.totals.capacity} beds free
              </p>
            </div>
            {h.rooms.length === 0 ? (
              <Empty title="No rooms listed yet" />
            ) : (
              <ul className="divide-y divide-line rounded-2xl border border-line">
                {h.rooms.map((room) => (
                  <li key={room.id} className="flex flex-wrap items-center gap-4 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-ink">
                        {room.name} <span className="font-medium text-muted-ink">· {ROOM_TYPES[room.room_type]}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-3 text-[13px] text-muted-ink">
                        <span className="inline-flex items-center gap-1">
                          <Users className="size-3.5" aria-hidden /> Sleeps {room.capacity}
                        </span>
                        {room.has_private_bathroom && (
                          <span className="inline-flex items-center gap-1">
                            <Bath className="size-3.5" aria-hidden /> Own bathroom
                          </span>
                        )}
                        <BedDots room={room} />
                      </p>
                    </div>
                    <p className="text-right">
                      <span className="block text-lg font-bold tabular-nums">{kwacha(room.price_per_bed)}</span>
                      <span className="text-xs text-muted-ink">per bed · month</span>
                    </p>
                    {h.can_manage ? null : room.occupancy.available > 0 ? (
                      <Button size="sm" onClick={() => setBooking(room)}>
                        {h.booking_mode === "instant" ? "Book a bed" : "Request a bed"}
                      </Button>
                    ) : (
                      <Badge>Full</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {h.description && (
            <section>
              <h2 className="mb-2 text-lg font-bold">About</h2>
              <p className="max-w-[68ch] text-[15px] leading-relaxed text-ink-2">{h.description}</p>
            </section>
          )}
          {h.amenities.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">Amenities</h2>
              <Amenities items={h.amenities} />
            </section>
          )}
          {h.rules && (
            <section>
              <h2 className="mb-2 text-lg font-bold">House rules</h2>
              <p className="max-w-[68ch] text-[15px] whitespace-pre-line text-ink-2">{h.rules}</p>
            </section>
          )}
          <section>
            <h2 className="mb-3 text-lg font-bold">Verification</h2>
            <Verification owner={h.property.owner_verified} property={h.property.property_verified} />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-bold">Reviews</h2>
            <Reviews reviews={h.reviews} />
          </section>
          <ReportLink target={{ boarding_house: h.id }} />
        </div>
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <ProviderBox provider={h.provider} />
          <div className="rounded-3xl border border-line p-5">
            <h2 className="mb-3 font-bold">Ask the provider</h2>
            {h.can_manage ? <Notice>This is your boarding house.</Notice> : <EnquiryForm target={{ boarding_house_id: h.id }} defaultName={displayName(me)} defaultPhone={me?.profile.phone_number ?? ""} />}
          </div>
        </aside>
      </div>

      <RoomBookingDialog house={h} room={booking} onClose={() => setBooking(null)} />
    </div>
  );
}

function RoomBookingDialog({ house, room, onClose }: { house: Detail; room: Room | null; onClose: () => void }) {
  const router = useRouter();
  const { me } = useSession();
  const [form, setForm] = useState({
    check_in: todayISO(7),
    months: 4,
    guest_name: me ? `${me.first_name} ${me.last_name}`.trim() : "",
    guest_phone: me?.profile.phone_number ?? "",
    institution: me?.profile.institution || house.near_institution.split(" (")[0],
    student_id: me?.profile.student_id ?? "",
    emergency_contact_name: me?.profile.emergency_contact_name ?? "",
    emergency_contact_phone: me?.profile.emergency_contact_phone ?? "",
    message: "",
  });
  const [state, setState] = useState({ busy: false, error: "" });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: k === "months" ? Number(e.target.value) : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!room) return;
    setState({ busy: true, error: "" });
    try {
      const b = await api<Booking>("bookings", { method: "POST", body: { room_id: room.id, ...form } });
      router.push(`/bookings/${b.id}`);
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }

  const instant = house.booking_mode === "instant";
  return (
    <Dialog open={Boolean(room)} onClose={onClose} title={room ? `${instant ? "Book" : "Request"} a bed in ${room.name}` : ""} wide>
      {room && (
        <form onSubmit={submit} className="space-y-4">
          {state.error && <Notice tone="red">{state.error}</Notice>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Move-in date">
              <input className="field" type="date" min={todayISO()} required value={form.check_in} onChange={set("check_in")} />
            </Field>
            <Field label="Months to pay now">
              <select className="field" value={form.months} onChange={set("months")}>
                {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => (
                  <option key={m} value={m}>
                    {m} {m === 1 ? "month" : "months"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Your name">
              <input className="field" required value={form.guest_name} onChange={set("guest_name")} />
            </Field>
            <Field label="Phone">
              <input className="field" type="tel" required placeholder="0977 123 456" value={form.guest_phone} onChange={set("guest_phone")} />
            </Field>
            <Field label="School or university">
              <input className="field" value={form.institution} onChange={set("institution")} />
            </Field>
            <Field label="Student number (optional)">
              <input className="field" value={form.student_id} onChange={set("student_id")} />
            </Field>
            <Field label="Emergency contact name">
              <input className="field" value={form.emergency_contact_name} onChange={set("emergency_contact_name")} />
            </Field>
            <Field label="Emergency contact phone">
              <input className="field" type="tel" value={form.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-2xl bg-subtle px-4 py-3">
            <span className="text-sm text-ink-2">
              {kwacha(room.price_per_bed)} × {form.months} {form.months === 1 ? "month" : "months"}
            </span>
            <span className="text-lg font-bold tabular-nums">{kwacha(Number(room.price_per_bed) * form.months)}</span>
          </div>
          <p className="text-[13px] text-muted-ink">
            {instant ? "The bed is held for 30 minutes while you pay online." : "The provider accepts or declines first. You pay online only after they accept."}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" busy={state.busy}>
              {instant ? "Book and pay" : "Send request"}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
