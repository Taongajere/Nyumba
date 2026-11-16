"use client";

import { useParams } from "next/navigation";
import { Printer } from "lucide-react";
import { useApi } from "@/lib/api";
import { date, dateTime, kwacha } from "@/lib/format";
import { Button, Logo, Notice, Spinner } from "@/components/kit";

type Receipt = {
  receipt_number: string;
  issued_at: string;
  payer: string;
  payer_email: string;
  booking_reference: string;
  description: string;
  period: { from: string; to: string; units: number; category: string };
  unit_price: string;
  amount: string;
  currency: string;
  method: string;
  gateway: string;
  tx_ref: string;
  gateway_transaction_id: string | null;
  refunded_amount: string;
  status: string;
};

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r, error, loading } = useApi<Receipt>(`payments/${id}/receipt`);
  if (loading && !r) return <Spinner label="Loading receipt" />;
  if (error || !r) return <div className="p-8"><Notice tone="red">{error?.message ?? "Receipt not found."}</Notice></div>;
  const unit = r.period.category === "stay" ? "night" : "month";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <Button variant="secondary" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" /> Print or save as PDF
        </Button>
      </div>
      <article className="rounded-3xl border border-line p-8 print:border-0">
        <div className="flex items-start justify-between gap-4">
          <Logo />
          <div className="text-right">
            <p className="text-lg font-bold">Receipt</p>
            <p className="text-sm text-muted-ink">{r.receipt_number}</p>
          </div>
        </div>
        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-ink">Paid by</dt>
            <dd className="font-semibold">{r.payer}</dd>
            <dd className="text-muted-ink">{r.payer_email}</dd>
          </div>
          <div className="text-right">
            <dt className="text-muted-ink">Date</dt>
            <dd className="font-semibold">{dateTime(r.issued_at)}</dd>
          </div>
        </dl>
        <table className="mt-8 w-full text-sm">
          <thead className="border-b border-line text-left text-muted-ink">
            <tr>
              <th className="pb-2 font-semibold">Description</th>
              <th className="pb-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line">
              <td className="py-3">
                <p className="font-semibold">{r.description}</p>
                <p className="text-muted-ink">
                  Booking {r.booking_reference} · {date(r.period.from)} – {date(r.period.to)} · {kwacha(r.unit_price)} × {r.period.units} {unit}
                  {r.period.units === 1 ? "" : "s"}
                </p>
              </td>
              <td className="py-3 text-right font-semibold tabular-nums">{kwacha(r.amount, { decimals: true })}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="pt-3 font-bold">Total paid ({r.currency})</td>
              <td className="pt-3 text-right text-lg font-bold tabular-nums">{kwacha(r.amount, { decimals: true })}</td>
            </tr>
            {Number(r.refunded_amount) > 0 && (
              <tr>
                <td className="pt-1 text-bad">Refunded</td>
                <td className="pt-1 text-right text-bad tabular-nums">−{kwacha(r.refunded_amount, { decimals: true })}</td>
              </tr>
            )}
          </tfoot>
        </table>
        <dl className="mt-8 grid grid-cols-2 gap-3 border-t border-line pt-5 text-[13px] text-muted-ink">
          <div>
            <dt>Method</dt>
            <dd className="text-ink">{r.method === "card" ? "Card" : "Mobile money"} via {r.gateway === "sandbox" ? "test checkout" : "Flutterwave"}</dd>
          </div>
          <div>
            <dt>Transaction</dt>
            <dd className="break-all text-ink">{r.gateway_transaction_id ?? r.tx_ref}</dd>
          </div>
        </dl>
      </article>
    </div>
  );
}
