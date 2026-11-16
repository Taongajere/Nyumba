"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { api } from "@/lib/api";

// Bell with a red dot when something is unread. Rechecks on navigation and every minute.
export function NotificationBell({ href = "/notifications" }: { href?: string }) {
  const pathname = usePathname();
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ unread: number }>("notifications?unread=1&page_size=1")
        .then((d) => alive && setUnread(d.unread))
        .catch(() => null);
    load();
    const timer = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pathname]);

  return (
    <Link
      href={href}
      className="relative grid size-11 place-items-center rounded-full border border-line bg-surface text-ink-2 hover:bg-subtle"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <Bell className="size-[18px]" />
      {unread > 0 && <span className="absolute top-2.5 right-3 size-2 rounded-full bg-heart ring-2 ring-surface" />}
    </Link>
  );
}
