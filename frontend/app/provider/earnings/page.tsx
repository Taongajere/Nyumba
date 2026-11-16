"use client";

import { useApi } from "@/lib/api";
import { date, kwacha } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { Badge, Notice, PageTitle, Panel, PanelHeader, Spinner, Stat } from "@/components/kit";
import { DashboardFilters } from "@/components/provider/DashboardFilters";
import { useDashboard } from "@/components/provider/useDashboard";

type Payout = { id: number; amount: string; status: string; reference: string; created_at: string; paid_at: string | null };

export default function EarningsPage() {
  const { data: d, error, loading, filters, setFilters } = useDashboard();
  const bookings = useApi<Booking[]>("provider/bookings");
  const payouts = useApi<Payout[]>("provider/payouts");

  if (loading && !d) return <Spinner />;
  if (error || !d) return <Notice tone="red">{error?.message}</Notice>;
  const paid = (bookings.data ?? []).filter((b) => b.commission && ["earned", "paid_out", "refunded"].includes(b.commission.status) && b.confirmed_at);
  const owed = Number(d.money.net_revenue) - Number(d.money.paid_out);

  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Payments & earnings" description="What guests paid, Nyumba's commission and what comes to you." />
      <div className="mb-6">
        <DashboardFilters properties={d.properties} value={filters} onChange={setFilters} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Guests paid" value={kwacha(d.money.gross)} />
        <Stat label="Nyumba commission" value={kwacha(d.money.commission)} sub={Number(d.money.processing_fees) ? `+ ${kwacha(d.money.processing_fees)} payment fees` : "No payment fees deducted"} />
        <Stat label="Your earnings" value={kwacha(d.money.net_revenue)} />
        <Stat label="Waiting to be paid out" value={kwacha(Math.max(owed, 0))} sub={`${kwacha(d.money.paid_out)} paid out so far`} />
      </div>

      <Panel className="mt-6">
        <PanelHeader title="Paid bookings" description="Each booking's split, calculated by Nyumba when the payment is verified." />
        {bookings.loading && !bookings.data ? (
          <Spinner />
        ) : paid.length === 0 ? (
          <p className="p-5 text-sm text-muted-ink">No paid bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-subtle text-left text-muted-ink">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Booking</th>
                  <th className="px-3 py-2.5 font-semibold">Paid</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Gross</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Commission</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Fees</th>
                  <th className="px-3 py-2.5 text-right font-semibold">You get</th>
                  <th className="px-5 py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {paid.map((b) => (
                  <tr key={b.id}>
                    <td className="px-5 py-3">
                      <p className="font-semibold">{b.target.title}</p>
                      <p className="text-xs text-muted-ink">
                        {b.reference} · {b.guest_name}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-ink-2">{date(b.confirmed_at)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{kwacha(b.commission!.gross_amount, { decimals: true })}</td>
                    <td className="px-3 py-3 text-right text-muted-ink tabular-nums">
                      −{kwacha(b.commission!.amount, { decimals: true })} <span className="text-xs">({(Number(b.commission!.rate) * 100).toFixed(0)}%)</span>
                    </td>
                    <td className="px-3 py-3 text-right text-muted-ink tabular-nums">−{kwacha(b.commission!.processing_fee, { decimals: true })}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{kwacha(b.commission!.provider_net, { decimals: true })}</td>
                    <td className="px-5 py-3">
                      <Badge tone={b.commission!.status === "paid_out" ? "green" : b.commission!.status === "refunded" ? "gray" : "amber"}>
                        {b.commission!.status === "paid_out" ? "Paid out" : b.commission!.status === "refunded" ? "Refunded" : "To be paid out"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-6">
        <PanelHeader title="Payouts" description="Transfers from Nyumba to you, with their bank or mobile-money reference." />
        {!payouts.data?.length ? (
          <p className="p-5 text-sm text-muted-ink">No payouts yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {payouts.data.map((p) => (
              <li key={p.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span>
                  {date(p.paid_at ?? p.created_at)} · <span className="text-muted-ink">Ref {p.reference}</span>
                </span>
                <span className="font-semibold tabular-nums">{kwacha(p.amount, { decimals: true })}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
