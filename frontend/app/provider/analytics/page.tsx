"use client";

import { useApi } from "@/lib/api";
import { kwacha, kwachaShort } from "@/lib/format";
import type { BoardingHouse } from "@/lib/types";
import { BarList, ColumnChart } from "@/components/charts";
import { Notice, PageTitle, Panel, PanelHeader, Spinner, Stat } from "@/components/kit";
import { DashboardFilters } from "@/components/provider/DashboardFilters";
import { monthLabel, useDashboard } from "@/components/provider/useDashboard";

const CATEGORY = { stay: "Short stays", rent: "Rentals", boarding: "Boarding houses" } as const;

export default function AnalyticsPage() {
  const { data: d, error, loading, filters, setFilters } = useDashboard();
  const houses = useApi<BoardingHouse[]>("provider/boarding-houses");
  if (loading && !d) return <Spinner />;
  if (error || !d) return <Notice tone="red">{error?.message}</Notice>;

  const bp = d.booking_performance;
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Analytics" description="Revenue, occupancy and how bookings convert." />
      <div className="mb-6">
        <DashboardFilters properties={d.properties} value={filters} onChange={setFilters} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bookings in period" value={bp.total} />
        <Stat label="Acceptance rate" value={bp.acceptance_rate === null ? "—" : `${bp.acceptance_rate}%`} sub="Requests you accepted" />
        <Stat label="Payment conversion" value={bp.payment_conversion === null ? "—" : `${bp.payment_conversion}%`} sub="Accepted bookings that paid" />
        <Stat label="Occupancy" value={`${d.totals.occupancy_rate}%`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Gross booking value by month" description="What guests paid, before commission" />
          <div className="p-5">
            <ColumnChart
              caption="Gross booking value per month"
              format={kwachaShort}
              data={d.monthly_revenue.map((r) => ({ label: monthLabel(r.month), value: Number(r.gross), detail: `${r.bookings} paid` }))}
            />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Paid bookings by month" />
          <div className="p-5">
            <ColumnChart caption="Number of paid bookings per month" format={(n) => String(Math.round(n))} data={d.monthly_revenue.map((r) => ({ label: monthLabel(r.month), value: r.bookings }))} />
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Earnings by type" description="Your share after commission" />
          <div className="p-5">
            {Object.keys(d.money.by_category).length === 0 ? (
              <p className="text-sm text-muted-ink">No paid bookings in this period.</p>
            ) : (
              <BarList format={(n) => kwacha(n)} data={Object.entries(d.money.by_category).map(([k, v]) => ({ label: CATEGORY[k as keyof typeof CATEGORY] ?? k, value: Number(v) }))} />
            )}
          </div>
        </Panel>
        <Panel>
          <PanelHeader title="Occupancy by boarding house" description="Checked-in beds as a share of all beds" />
          <div className="p-5">
            {!houses.data?.length ? (
              <p className="text-sm text-muted-ink">No boarding houses.</p>
            ) : (
              <BarList
                max={100}
                format={(n) => `${n}%`}
                data={houses.data.map((h) => ({ label: h.name, value: h.totals.occupancy_rate, detail: `${h.totals.occupied}/${h.totals.capacity}` }))}
              />
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}
