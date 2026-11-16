"use client";

import Link from "next/link";
import { useApi } from "@/lib/api";
import { kwacha, kwachaShort, timeAgo } from "@/lib/format";
import { ColumnChart } from "@/components/charts";
import { Notice, PageTitle, Panel, PanelHeader, Spinner, Stat } from "@/components/kit";
import { monthLabel } from "@/components/provider/useDashboard";

type Overview = {
  users: { total: number; active: number; new_last_30_days: number };
  providers: { approved: number; suspended: number; pending_applications: number };
  listings: { total: number; live: number; pending_review: number; boarding_houses: number; boarding_pending_review: number; open_reports: number };
  bookings: { active: number; confirmed: number; total: number };
  revenue: { gross_booking_value: string; platform_commission: string; commission_this_month: string; pending_refunds: number };
  monthly: { month: string; gross: string; commission: string }[];
  recent_activity: { at: string; kind: string; text: string }[];
};

export default function AdminOverview() {
  const { data: d, error, loading } = useApi<Overview>("admin/overview");
  if (loading && !d) return <Spinner />;
  if (error || !d) return <Notice tone="red">{error?.message}</Notice>;

  const todo = [
    { n: d.providers.pending_applications, label: "provider applications to review", href: "/admin/applications" },
    { n: d.listings.pending_review + d.listings.boarding_pending_review, label: "listings to review", href: "/admin/listings" },
    { n: d.listings.open_reports, label: "open reports", href: "/admin/reports" },
    { n: d.revenue.pending_refunds, label: "refunds waiting on the gateway", href: "/admin/finance" },
  ].filter((t) => t.n > 0);

  return (
    <div className="mx-auto max-w-7xl">
      <PageTitle title="Platform overview" />
      {todo.length > 0 && (
        <Panel className="mb-6 p-5">
          <h2 className="mb-3 font-bold">Needs your attention</h2>
          <ul className="flex flex-wrap gap-2">
            {todo.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:bg-subtle">
                  <span className="grid min-w-6 place-items-center rounded-full bg-warn-soft px-1.5 text-warn">{t.n}</span>
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Registered users" value={d.users.total} sub={`${d.users.new_last_30_days} joined in the last 30 days`} />
        <Stat label="Approved providers" value={d.providers.approved} sub={`${d.providers.pending_applications} pending · ${d.providers.suspended} suspended`} />
        <Stat label="Live listings" value={d.listings.live} sub={`${d.listings.total} total · ${d.listings.boarding_houses} boarding houses`} />
        <Stat label="Active bookings" value={d.bookings.active} sub={`${d.bookings.confirmed} confirmed`} />
        <Stat label="Gross booking value" value={kwacha(d.revenue.gross_booking_value)} />
        <Stat label="Platform commission" value={kwacha(d.revenue.platform_commission)} sub={`${kwacha(d.revenue.commission_this_month)} this month`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader title="Commission by month" />
          <div className="p-5">
            <ColumnChart
              caption="Platform commission per month"
              format={kwachaShort}
              data={d.monthly.map((m) => ({ label: monthLabel(m.month), value: Number(m.commission), detail: `${kwacha(m.gross)} booked` }))}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Recent activity" />
          <ul className="divide-y divide-line">
            {d.recent_activity.map((a, i) => (
              <li key={i} className="px-5 py-3">
                <p className="text-sm text-ink">{a.text}</p>
                <p className="text-xs text-muted-ink">{timeAgo(a.at)}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
