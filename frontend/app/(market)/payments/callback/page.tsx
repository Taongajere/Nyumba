"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { kwacha } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { ButtonLink, Spinner } from "@/components/kit";

// Where the gateway sends the payer back. We never trust the query string: the backend
// asks the gateway directly and tells us what really happened.
function Callback() {
  const params = useSearchParams();
  const txRef = params.get("tx_ref") ?? "";
  const transactionId = params.get("transaction_id");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!txRef) return;
    api<Payment>("payments/verify", { method: "POST", body: { tx_ref: txRef, transaction_id: transactionId } })
      .then(setPayment)
      .catch((err) => setError((err as Error).message));
  }, [txRef, transactionId]);

  if (!txRef) return <Result tone="bad" title="Missing payment reference" body="Open the booking and try paying again." />;
  if (error) return <Result tone="bad" title="We couldn't check this payment" body={error} />;
  if (!payment) return <Spinner label="Checking your payment with the provider" />;

  const bookingHref = `/bookings/${payment.booking}`;
  if (payment.status === "successful")
    return (
      <Result tone="ok" title="Payment received" body={`${kwacha(payment.amount, { decimals: true })} for booking ${payment.booking_reference}. Your booking is confirmed.`}>
        <ButtonLink href={bookingHref}>View booking</ButtonLink>
        <ButtonLink href={`/payments/${payment.id}/receipt`} variant="secondary">
          Receipt
        </ButtonLink>
      </Result>
    );
  if (payment.status === "initiated")
    return (
      <Result tone="wait" title="Payment still processing" body="Mobile money can take a minute. We'll confirm the booking as soon as the provider tells us it went through.">
        <ButtonLink href={bookingHref}>Back to booking</ButtonLink>
      </Result>
    );
  return (
    <Result tone="bad" title="Payment didn't go through" body={payment.failure_reason || "Nothing was charged. You can try again while the booking is held."}>
      <ButtonLink href={bookingHref}>Back to booking</ButtonLink>
    </Result>
  );
}

function Result({ tone, title, body, children }: { tone: "ok" | "bad" | "wait"; title: string; body: string; children?: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? XCircle : Clock;
  const color = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : "text-warn";
  return (
    <div className="mx-auto max-w-md text-center">
      <Icon className={`mx-auto size-12 ${color}`} aria-hidden />
      <h1 className="mt-4 text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-[15px] text-muted-ink">{body}</p>
      {children && <div className="mt-6 flex justify-center gap-2">{children}</div>}
    </div>
  );
}

export default function PaymentCallbackPage() {
  return (
    <div className="px-4 py-16">
      <Suspense>
        <Callback />
      </Suspense>
    </div>
  );
}
