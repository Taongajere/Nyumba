"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Receipt, Star } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { date, dateTime, kwacha } from "@/lib/format";
import type { Booking, Payment } from "@/lib/types";
import { StatusBadge, periodLabel } from "@/components/bookings/BookingBits";
import { ProviderBox } from "@/components/detail/DetailParts";
import { Button, ButtonLink, Dialog, Field, Notice, Panel, Spinner } from "@/components/kit";

const STEPS_REQUEST = ["Requested", "Accepted", "Paid", "Stay"];
const STEPS_INSTANT = ["Booked", "Paid", "Stay"];

function stepIndex(b: Booking) {
  const instant = b.booking_mode === "instant";
  const map: Record<string, number> = instant
    ? { awaiting_payment: 0, confirmed: 1, completed: 2 }
    : { pending: 0, accepted: 1, awaiting_payment: 1, confirmed: 2, completed: 3 };
  return map[b.status] ?? -1;
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: b, error, loading, reload } = useApi<Booking>(`bookings/${id}`);
  const [busy, setBusy] = useState<"" | "pay" | "cancel">("");
  const [message, setMessage] = useState<{ tone: "red" | "green"; text: string } | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (loading && !b) return <Spinner label="Loading booking" />;
  if (error || !b) return <div className="p-8"><Notice tone="red">{error?.message ?? "Booking not found."}</Notice></div>;

  async function pay() {
    setBusy("pay");
    setMessage(null);
    try {
      const payment = await api<Payment>(`bookings/${id}/pay`, { method: "POST" });
      window.location.href = payment.checkout_url;
    } catch (err) {
      setMessage({ tone: "red", text: (err as Error).message });
      setBusy("");
    }
  }

  async function cancel() {
    setBusy("cancel");
    try {
      const res = await api<{ message: string }>(`bookings/${id}/cancel`, { method: "POST" });
      setMessage({ tone: "green", text: res.message });
      setConfirmCancel(false);
      reload();
    } catch (err) {
      setMessage({ tone: "red", text: (err as Error).message });
    } finally {
      setBusy("");
    }
  }

  const steps = b.booking_mode === "instant" ? STEPS_INSTANT : STEPS_REQUEST;
  const current = stepIndex(b);
  const paid = b.payments.find((p) => ["successful", "refunded", "partially_refunded"].includes(p.status));
  const ended = ["cancelled", "rejected"].includes(b.status);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/bookings" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-ink hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden /> My bookings
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-muted-ink">Booking {b.reference}</p>
          <h1 className="mt-1 text-[26px] font-bold tracking-tight">{b.target.title}</h1>
          <p className="mt-1 text-[15px] text-muted-ink">{periodLabel(b)}</p>
        </div>
        <StatusBadge status={b.status} />
      </div>

      {!ended && (
        <ol className="mt-6 grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }} aria-label="Booking progress">
          {steps.map((label, i) => (
            <li key={label} aria-current={i === current ? "step" : undefined}>
              <span className={cn("block h-1.5 rounded-full", i <= current ? "bg-marker" : "bg-line")} />
              <span className={cn("mt-2 flex items-center gap-1 text-[13px] font-semibold", i <= current ? "text-ink" : "text-muted-ink")}>
                {i < current && <Check className="size-3.5 text-marker" aria-hidden />} {label}
              </span>
            </li>
          ))}
        </ol>
      )}

      {message && <Notice tone={message.tone} className="mt-6">{message.text}</Notice>}

      {b.status === "pending" && (
        <Notice tone="amber" className="mt-6">
          Waiting for {b.target.provider.name} to accept. You won&apos;t pay anything until they do. We&apos;ll notify you.
        </Notice>
      )}
      {b.can_pay && (
        <Panel className="mt-6 flex flex-wrap items-center justify-between gap-4 border-marker/30 bg-info-soft/60 p-5">
          <div>
            <p className="font-semibold text-ink">Pay {kwacha(b.total_amount, { decimals: true })} to confirm</p>
            {b.payment_due_at && <p className="text-sm text-ink-2">The booking is held until {dateTime(b.payment_due_at)}. Mobile money or card.</p>}
          </div>
          <Button size="lg" busy={busy === "pay"} onClick={pay}>
            Pay now
          </Button>
        </Panel>
      )}
      {b.decision_note && (
        <Notice tone={b.status === "rejected" || b.status === "cancelled" ? "gray" : "blue"} className="mt-4">
          {b.status === "cancelled" && b.cancelled_by === "system" ? "" : "Note from the provider: "}
          {b.decision_note}
        </Notice>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Panel className="p-5">
            <h2 className="mb-3 font-bold">Details</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Row label={b.category === "stay" ? "Check-in" : "Move in"} value={date(b.check_in)} />
              <Row label={b.category === "stay" ? "Check-out" : "Paid until"} value={date(b.check_out)} />
              <Row label="Guest" value={b.guest_name} />
              <Row label="Phone" value={b.guest_phone} />
              <Row label="Booked" value={dateTime(b.created_at)} />
              <Row label="Type" value={b.booking_mode === "instant" ? "Instant booking" : "Request to book"} />
            </dl>
          </Panel>
          <ProviderBox provider={b.target.provider} />
          {b.can_review && <ReviewForm bookingId={b.id} onDone={reload} />}
        </div>
        <div className="space-y-4">
          <Panel className="p-5">
            <h2 className="mb-3 font-bold">Price</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between text-ink-2">
                <dt>
                  {kwacha(b.unit_price)} × {b.periods}
                </dt>
                <dd className="tabular-nums">{kwacha(b.total_amount, { decimals: true })}</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 font-bold">
                <dt>Total</dt>
                <dd className="tabular-nums">{kwacha(b.total_amount, { decimals: true })}</dd>
              </div>
            </dl>
            {paid && (
              <ButtonLink href={`/payments/${paid.id}/receipt`} variant="secondary" size="sm" className="mt-4 w-full">
                <Receipt className="size-4" /> View receipt
              </ButtonLink>
            )}
          </Panel>
          {b.can_cancel && (
            <Button variant="ghost" className="w-full text-bad" onClick={() => setConfirmCancel(true)}>
              Cancel booking
            </Button>
          )}
        </div>
      </div>

      <Dialog open={confirmCancel} onClose={() => setConfirmCancel(false)} title="Cancel this booking?">
        <p className="text-[15px] text-ink-2">
          {b.status === "confirmed"
            ? "You get a full refund if you cancel at least 48 hours before check-in. Closer to the date, the payment isn't refunded automatically."
            : "Nothing has been paid yet, so there's nothing to refund."}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmCancel(false)}>
            Keep booking
          </Button>
          <Button variant="danger" busy={busy === "cancel"} onClick={cancel}>
            Cancel booking
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-ink">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}

function ReviewForm({ bookingId, onDone }: { bookingId: number; onDone: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [state, setState] = useState({ busy: false, error: "" });
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true, error: "" });
    try {
      await api(`bookings/${bookingId}/review`, { method: "POST", body: { rating, comment } });
      onDone();
    } catch (err) {
      setState({ busy: false, error: (err as Error).message });
    }
  }
  return (
    <Panel className="p-5">
      <h2 className="font-bold">How was it?</h2>
      <form onSubmit={submit} className="mt-3 space-y-3">
        {state.error && <Notice tone="red">{state.error}</Notice>}
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} stars`} onClick={() => setRating(n)}>
              <Star className={cn("size-7", n <= rating ? "fill-star text-star" : "text-line-strong")} />
            </button>
          ))}
        </div>
        <Field label="Comment (optional)">
          <textarea className="field" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <Button type="submit" busy={state.busy}>
          Post review
        </Button>
      </form>
    </Panel>
  );
}
