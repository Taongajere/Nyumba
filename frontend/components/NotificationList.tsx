"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { Button, Empty, Notice, PageTitle, Spinner } from "@/components/kit";

type Page = { count: number; unread: number; results: Notification[] };

export function NotificationList() {
  const { data, error, loading, reload } = useApi<Page>("notifications?page_size=50");

  async function markAll() {
    await api("notifications/read", { method: "POST", body: {} });
    reload();
  }
  async function open(n: Notification) {
    if (!n.is_read) api("notifications/read", { method: "POST", body: { ids: [n.id] } }).catch(() => null);
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <PageTitle
        title="Notifications"
        description={data ? (data.unread ? `${data.unread} unread` : "You're all caught up.") : undefined}
        action={data?.unread ? <Button variant="secondary" size="sm" onClick={markAll}>Mark all as read</Button> : undefined}
      />
      {loading && !data ? (
        <Spinner />
      ) : error ? (
        <Notice tone="red">{error.message}</Notice>
      ) : !data?.results.length ? (
        <Empty icon={Bell} title="No notifications yet">
          Booking updates, payments and messages about your account appear here.
        </Empty>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line">
          {data.results.map((n) => {
            const body = (
              <div className="flex gap-3 px-4 py-3.5">
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.is_read ? "bg-transparent" : "bg-marker")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[15px]", n.is_read ? "text-ink-2" : "font-semibold text-ink")}>{n.title}</p>
                  {n.body && <p className="mt-0.5 text-sm text-muted-ink">{n.body}</p>}
                </div>
                <time className="shrink-0 text-xs text-muted-ink" dateTime={n.created_at}>
                  {timeAgo(n.created_at)}
                </time>
              </div>
            );
            return (
              <li key={n.id} className={n.is_read ? "" : "bg-info-soft/40"}>
                {n.link ? (
                  <Link href={n.link} onClick={() => open(n)} className="block hover:bg-subtle">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
