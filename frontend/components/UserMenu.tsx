"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Briefcase,
  CalendarCheck,
  ChevronDown,
  CreditCard,
  Heart,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  Store,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { displayName, useSession } from "@/lib/session";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden
      className={cn("grid size-8 shrink-0 place-items-center rounded-full bg-marker text-[13px] font-bold text-white", className)}
    >
      {initials || "?"}
    </span>
  );
}

// "Hi, Name" pill with a menu, as in the reference header. Items adapt to what the account can do.
export function UserMenu({ context }: { context: "marketplace" | "provider" | "admin" }) {
  const { me, switchMode, logout } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!me) return <span className="h-11 w-36 animate-pulse rounded-full bg-subtle" />;
  const name = displayName(me);
  const full = `${me.first_name} ${me.last_name}`.trim() || me.username;

  const item = "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-2 hover:bg-subtle hover:text-ink";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-11 items-center gap-2 rounded-full border border-line bg-surface py-1 pr-3 pl-4 text-sm hover:bg-subtle"
      >
        <span className="hidden text-muted-ink sm:inline">Hi,</span>
        <span className="hidden max-w-32 truncate font-semibold text-ink sm:inline">{name}</span>
        <Avatar name={full} />
        <ChevronDown className="size-4 text-muted-ink" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-line bg-surface p-2 shadow-xl" onClick={() => setOpen(false)}>
          <div className="px-3 pt-2 pb-3">
            <p className="font-semibold text-ink">{full}</p>
            <p className="truncate text-[13px] text-muted-ink">{me.email}</p>
          </div>
          <div className="border-t border-line pt-2">
            {context !== "marketplace" && (
              <Link href="/" className={item} role="menuitem">
                <Store className="size-4" /> Marketplace
              </Link>
            )}
            <Link href="/bookings" className={item} role="menuitem">
              <CalendarCheck className="size-4" /> My bookings
            </Link>
            <Link href="/payments" className={item} role="menuitem">
              <CreditCard className="size-4" /> Payments
            </Link>
            <Link href="/favourites" className={item} role="menuitem">
              <Heart className="size-4" /> Favourites
            </Link>
            <Link href="/notifications" className={item} role="menuitem">
              <Bell className="size-4" /> Notifications
            </Link>
            <Link href="/profile" className={item} role="menuitem">
              <User className="size-4" /> Profile
            </Link>
            <Link href="/settings" className={item} role="menuitem">
              <Settings className="size-4" /> Settings
            </Link>
          </div>
          <div className="mt-2 border-t border-line pt-2">
            {me.can_use_provider_tools ? (
              context === "provider" ? (
                <button type="button" className={item} onClick={() => switchMode("marketplace")} role="menuitem">
                  <Store className="size-4" /> Switch to marketplace
                </button>
              ) : (
                <button type="button" className={item} onClick={() => switchMode("provider")} role="menuitem">
                  <LayoutDashboard className="size-4" /> Switch to provider tools
                </button>
              )
            ) : (
              <Link href="/become-provider" className={item} role="menuitem">
                <Briefcase className="size-4" />
                {me.provider_status === "pending"
                  ? "Provider application: in review"
                  : me.provider_status === "suspended"
                    ? "Provider account suspended"
                    : "Apply to become a provider"}
              </Link>
            )}
            {me.is_admin && context !== "admin" && (
              <Link href="/admin" className={item} role="menuitem">
                <Shield className="size-4" /> Admin dashboard
              </Link>
            )}
            <button type="button" className={cn(item, "text-bad hover:text-bad")} onClick={logout} role="menuitem">
              <LogOut className="size-4" /> Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
