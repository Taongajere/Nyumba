"use client";

import Link from "next/link";
import { CreditCard } from "lucide-react";
import { useApi } from "@/lib/api";
import { dateTime, kwacha } from "@/lib/format";
import type { Payment } from "@/lib/types";
import { Badge, Empty, Notice, PageTitle, Spinner } from "@/components/kit";

const TONE: Record<string, "green" | "amber" | "red" | "gray" | "blue"> = {
  successful: "green",
  initiated: "amber",
  failed: "red",
  cancelled: "gray",
  refunded: "blue",
  partially_refunded: "blue",
};
const LABEL: Record<string, string> = {
  successful: "Paid",
  initiated: "Not finished",
  failed: "Failed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

export default function PaymentsPage() {
  const { data, error, loading } = useApi<Payment[]>("payments");
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <PageTitle title="Payments" description="Every payment you've made on Nyumba, with receipts." />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <Notice tone="red">{error.message}</Notice>
      ) : !data?.length ? (
        <Empty icon={CreditCard} title="No payments yet">
          Payments for your bookings show up here.
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-subtle text-left text-muted-ink">
              <tr>
                <th className="px-4 py-3 font-semibold">Date</th>
                <th className="px-4 py-3 font-semibold">Booking</th>
                <th className="px-4 py-3 font-semibold">Method</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 text-right font-semibold">Amount</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 text-ink-2">{dateTime(p.created_at)}</td>
                  <td className="px-4 py-3">
                    <Link href={`/bookings/${p.booking}`} className="font-semibold text-ink hover:underline">
                      {p.booking_reference}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-ink-2">{p.method === "card" ? "Card" : p.method ? "Mobile money" : "—"}</td>
                  <td className="px-4 py-3">
                    <Badge tone={TONE[p.status]}>{LABEL[p.status] ?? p.status}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{kwacha(p.amount, { decimals: true })}</td>
                  <td className="px-4 py-3 text-right">
                    {["successful", "refunded", "partially_refunded"].includes(p.status) && (
                      <Link href={`/payments/${p.id}/receipt`} className="font-semibold text-marker hover:underline">
                        Receipt
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
