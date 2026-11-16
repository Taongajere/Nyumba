"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { useApi } from "@/lib/api";
import type { Tenancy } from "@/lib/types";
import { Empty, Notice, PageTitle, Panel, Spinner, Tabs } from "@/components/kit";
import { OccupantTable } from "@/components/provider/OccupantTable";

export default function OccupantsPage() {
  const [tab, setTab] = useState<"current" | "checked_out">("current");
  const { data, error, loading, reload } = useApi<Tenancy[]>(tab === "current" ? "provider/occupants" : "provider/occupants?status=checked_out");
  return (
    <div className="mx-auto max-w-6xl">
      <PageTitle title="Tenants & occupants" description="Everyone in your boarding houses. Unit tenants are on each property's page." />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "current", label: "Current" },
          { value: "checked_out", label: "Checked out" },
        ]}
      />
      <div className="mt-5">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <Notice tone="red">{error.message}</Notice>
        ) : !data?.length ? (
          <Empty icon={Users} title={tab === "current" ? "No occupants yet" : "Nobody has checked out yet"}>
            Occupants appear here when you register them or when a student&apos;s paid booking reserves a bed.
          </Empty>
        ) : (
          <Panel>
            <OccupantTable tenancies={data} onChange={reload} showHouse />
          </Panel>
        )}
      </div>
    </div>
  );
}
