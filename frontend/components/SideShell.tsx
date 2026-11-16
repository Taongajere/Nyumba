"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { Logo } from "@/components/kit";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";

export type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
};

// Sidebar frame used by provider tools and the admin dashboard.
export function SideShell({
  nav,
  footer,
  badge,
  context,
  children,
}: {
  nav: NavItem[];
  footer?: NavItem[];
  badge: string;
  context: "provider" | "admin";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { logout } = useSession();
  const [open, setOpen] = useState(false);

  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`));

  const links = (items: NavItem[]) =>
    items.map((item) => (
      <Link
        key={item.href + item.label}
        href={item.href}
        onClick={() => setOpen(false)}
        aria-current={isActive(item) ? "page" : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
          isActive(item) ? "bg-navy text-white" : "text-ink-2 hover:bg-subtle hover:text-ink"
        )}
      >
        <item.icon className="size-[18px] shrink-0" />
        {item.label}
      </Link>
    ));

  const sidebar = (
    <nav aria-label={badge} className="flex h-full flex-col gap-1 p-4">
      <div className="mb-5 flex items-center gap-2 px-2">
        <Logo />
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-2 italic">{badge}</span>
      </div>
      {links(nav)}
      <div className="mt-auto space-y-1 border-t border-line pt-4">
        {footer && links(footer)}
        <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-bad hover:bg-bad-soft">
          <LogOut className="size-[18px]" /> Log out
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh sm:p-4 lg:p-5">
      <div className="canvas flex min-h-dvh sm:min-h-[calc(100dvh-2rem)] lg:min-h-[calc(100dvh-2.5rem)]">
        <aside className="hidden w-64 shrink-0 border-r border-line lg:block">
          <div className="sticky top-0 max-h-dvh overflow-y-auto">{sidebar}</div>
        </aside>
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button type="button" aria-label="Close menu" className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
            <aside className="absolute inset-y-0 left-0 w-72 overflow-y-auto bg-surface">{sidebar}</aside>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-6">
            <button type="button" onClick={() => setOpen(true)} className="grid size-11 place-items-center rounded-full border border-line lg:hidden" aria-label="Open menu">
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <NotificationBell href={context === "provider" ? "/provider/notifications" : "/notifications"} />
              <UserMenu context={context} />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
