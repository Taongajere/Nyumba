"use client";

import Link from "next/link";
import { CalendarCheck, Plus } from "lucide-react";
import { useApi } from "@/lib/api";
import { useSession } from "@/lib/session";
import { kwacha, kwachaShort, timeAgo } from "@/lib/format";
import type { Booking } from "@/lib/types";
import { BookingRow } from "@/components/bookings/BookingBits";
import { BarList, ColumnChart } from "@/components/charts";
import { ButtonLink, Empty, Notice, PageTitle, Panel, PanelHeader, Spinner, Stat } from "@/components/kit";
import { BookingDecision } from "@/components/provider/BookingDecision";
import { DashboardFilters } from "@/components/provider/DashboardFilters";
import { monthLabel, useDashboard } from "@/components/provider/useDashboard";

export default function ProviderDashboard() {
  const { me } = useSession();
  const { data: d, error, loading, filters, setFilters, reload } = useDashboard();
  const requests = useApi<Booking[]>("provider/bookings?status=pending");

  if (loading && !d) return <Spinner label="Loading dashboard" />;
  if (error || !d) return <Notice tone="red">{error?.message ?? "Couldn't load the dashboard."}</Notice>;

  const t = d.totals;
  const m = d.money;
  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle
        title={`Welcome back, ${me?.first_name || me?.username}`}
        description={me?.provider?.business_name}
        action={
          <div className="flex gap-2">
            <ButtonLink href="/provider/boarding/new" variant="secondary">
              <Plus className="size-4" /> Boarding house
            </ButtonLink>
            <ButtonLink href="/provider/properties/new">
              <Plus className="size-4" /> Property
            </ButtonLink>
          </div>
        }
      />
      <div className="mb-6">
        <DashboardFilters properties={d.properties} value={filters} onChange={setFilters} />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net revenue" value={kwacha(m.net_revenue)} sub={`${kwacha(m.gross)} gross · ${kwacha(m.commission)} commission`} />
        <Stat label="Occupancy" value={`${t.occupancy_rate}%`} sub={`${t.units_occupied} of ${t.units_total} beds and units filled`} />
        <Stat label="Booking requests" value={t.booking_requests} sub={t.booking_requests ? "Waiting for your answer" : "Nothing waiting"} />
        <Stat label="Pending payments" value={kwacha(m.pending_payments.amount)} sub={`${m.pending_payments.bookings} unpaid bookings · ${kwacha(m.pending_payments.occupant_balances)} occupant balances`} />
        <Stat label="Properties" value={t.properties} sub={`${t.active_listings} live · ${t.pending_review} in review`} />
        <Stat label="Available now" value={t.units_available} sub={`${t.beds_reserved} beds reserved`} />
        <Stat label="Tenants" value={t.tenants} sub="Checked-in occupants and occupied units" />
        <Stat label="Rental income" value={kwacha(m.rental_income)} sub="Rentals and boarding, after commission" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader title="Monthly revenue" description="Your share after commission, by month the booking was paid" />
          <div className="p-5">
            <ColumnChart
              caption="Net revenue per month for the last 12 months"
              format={(n) => kwachaShort(n)}
              data={d.monthly_revenue.map((r) => ({
                label: monthLabel(r.month),
                value: Number(r.net),
                detail: `${r.bookings} ${r.bookings === 1 ? "booking" : "bookings"} · ${kwacha(r.gross)} gross`,
              }))}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Booking performance" />
          <div className="space-y-5 p-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-sm text-muted-ink">Acceptance rate</p>
                <p className="text-xl font-bold">{d.booking_performance.acceptance_rate ?? "—"}{d.booking_performance.acceptance_rate !== null && "%"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-ink">Accepted that paid</p>
                <p className="text-xl font-bold">{d.booking_performance.payment_conversion ?? "—"}{d.booking_performance.payment_conversion !== null && "%"}</p>
              </div>
            </div>
            <BarList
              format={(n) => String(n)}
              data={[
                ["pending", "Waiting for you"],
                ["awaiting_payment", "Awaiting payment"],
                ["confirmed", "Confirmed"],
                ["completed", "Completed"],
                ["rejected", "Declined"],
                ["cancelled", "Cancelled"],
              ].map(([k, label]) => ({ label, value: d.booking_performance.by_status[k] ?? 0 }))}
            />
          </div>
        </Panel>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader title="Booking requests" description="Accept or decline. Guests pay only after you accept." action={<Link href="/provider/bookings" className="text-sm font-semibold text-marker">All bookings</Link>} />
          <div className="p-5">
            {requests.loading && !requests.data ? (
              <Spinner />
            ) : !requests.data?.length ? (
              <Empty icon={CalendarCheck} title="No requests waiting" />
            ) : (
              <ul className="space-y-3">
                {requests.data.slice(0, 5).map((b) => (
                  <BookingRow
                    key={b.id}
                    booking={b}
                    href={`/bookings/${b.id}`}
                    aside={
                      <BookingDecision
                        booking={b}
                        onDone={() => {
                          requests.reload();
                          reload();
                        }}
                      />
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Recent activity" />
          <ul className="divide-y divide-line">
            {d.recent_activity.length === 0 && <li className="p-5 text-sm text-muted-ink">Nothing yet.</li>}
            {d.recent_activity.map((n) => (
              <li key={n.id} className="px-5 py-3">
                <p className="text-sm font-semibold text-ink">{n.title}</p>
                <p className="text-xs text-muted-ink">{timeAgo(n.created_at)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
