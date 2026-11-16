"use client";

import { useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { Badge, Button, Empty, Notice, PageTitle, Spinner, Tabs } from "@/components/kit";

type Report = {
  id: number;
  listing: number | null;
  boarding_house: number | null;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  reporter_username: string;
  target_title: string;
  created_at: string;
};

export default function ReportsPage() {
  const [status, setStatus] = useState<"open" | "all">("open");
  const { data, error, loading, reload } = useApi<Report[]>(`admin/reports?status=${status}`);

  async function close(r: Report, outcome: "resolved" | "dismissed") {
    await api(`admin/reports/${r.id}`, { method: "POST", body: { status: outcome } }).catch(() => null);
    reload();
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageTitle title="Reports" description="Listings people flagged. Open the listing, act on it under Listings, then resolve the report." />
      <Tabs
        value={status}
        onChange={setStatus}
        items={[
          { value: "open", label: "Open" },
          { value: "all", label: "All" },
        ]}
      />
      <div className="mt-5">
        {loading && !data ? (
          <Spinner />
        ) : error ? (
          <Notice tone="red">{error.message}</Notice>
        ) : !data?.length ? (
          <Empty icon={Flag} title="No reports" />
        ) : (
          <ul className="space-y-3">
            {data.map((r) => (
              <li key={r.id} className="rounded-2xl border border-line p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={r.listing ? `/listings/${r.listing}` : `/boarding-houses/${r.boarding_house}`} className="font-semibold hover:underline">
                      {r.target_title}
                    </Link>
                    <p className="text-sm text-muted-ink">
                      {r.reason} · reported by {r.reporter_username} · {timeAgo(r.created_at)}
                    </p>
                  </div>
                  <Badge tone={r.status === "open" ? "amber" : "gray"}>{r.status}</Badge>
                </div>
                {r.details && <p className="mt-2 text-[15px] text-ink-2">{r.details}</p>}
                {r.status === "open" && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" onClick={() => close(r, "resolved")}>
                      Mark resolved
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => close(r, "dismissed")}>
                      Dismiss
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
