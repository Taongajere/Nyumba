"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, FlaskConical, Smartphone } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { kwacha } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { Button, Notice, Spinner } from "@/components/kit";

// Local stand-in for the payment provider's hosted checkout. Only reachable when the
// backend runs with PAYMENT_GATEWAY=sandbox; the result is still verified server-side.
function SandboxCheckout() {
  const router = useRouter();
  const txRef = useSearchParams().get("tx_ref") ?? "";
  const { data: payments, loading } = useApi<Payment[]>("payments");
  const payment = payments?.find((p) => p.tx_ref === txRef);
  const [method, setMethod] = useState<"mobilemoneyzambia" | "card">("mobilemoneyzambia");
  const [busy, setBusy] = useState<"" | "successful" | "failed">("");
  const [error, setError] = useState("");

  async function complete(outcome: "successful" | "failed") {
    setBusy(outcome);
    setError("");
    try {
      const result = await api<Payment>("payments/sandbox/complete", { method: "POST", body: { tx_ref: txRef, outcome, method } });
      router.replace(`/payments/callback?tx_ref=${encodeURIComponent(txRef)}&status=${result.status}&booking=${result.booking}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy("");
    }
  }

  if (loading) return <Spinner label="Opening checkout" />;
  if (!payment) return <Notice tone="red">This payment link isn&apos;t valid.</Notice>;

  return (
    <div className="mx-auto w-full max-w-md">
      <Notice tone="amber" className="mb-6 flex items-start gap-2">
        <FlaskConical className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>Test checkout. No real money moves. With live Flutterwave keys, payers see Flutterwave&apos;s page here instead.</span>
      </Notice>
      <div className="rounded-3xl border border-line p-6">
        <p className="text-sm text-muted-ink">Paying Nyumba for booking {payment.booking_reference}</p>
        <p className="mt-1 text-[32px] font-bold tracking-tight tabular-nums">{kwacha(payment.amount, { decimals: true })}</p>
        <fieldset className="mt-6">
          <legend className="label">Pay with</legend>
          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "mobilemoneyzambia" as const, label: "Mobile money", sub: "MTN, Airtel, Zamtel", icon: Smartphone },
              { v: "card" as const, label: "Card", sub: "Visa, Mastercard", icon: CreditCard },
            ].map((o) => (
              <label key={o.v} className={cn("cursor-pointer rounded-2xl border p-4", method === o.v ? "border-navy ring-2 ring-navy" : "border-line")}>
                <input type="radio" name="method" className="sr-only" checked={method === o.v} onChange={() => setMethod(o.v)} />
                <o.icon className="size-5 text-ink-2" aria-hidden />
                <span className="mt-2 block text-sm font-semibold">{o.label}</span>
                <span className="text-xs text-muted-ink">{o.sub}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && <Notice tone="red" className="mt-4">{error}</Notice>}
        <Button size="lg" className="mt-6 w-full" busy={busy === "successful"} disabled={Boolean(busy)} onClick={() => complete("successful")}>
          Pay {kwacha(payment.amount)}
        </Button>
        <Button variant="ghost" className="mt-2 w-full" busy={busy === "failed"} disabled={Boolean(busy)} onClick={() => complete("failed")}>
          Simulate a declined payment
        </Button>
      </div>
    </div>
  );
}

export default function SandboxPage() {
  return (
    <div className="px-4 py-10">
      <Suspense>
        <SandboxCheckout />
      </Suspense>
    </div>
  );
}
