"use client";

import {
  BarChart3,
  BedDouble,
  Building2,
  CalendarCheck,
  Compass,
  Heart,
  LayoutDashboard,
  Settings,
  Store,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { useSession } from "@/lib/session";
import { ButtonLink, Empty, Spinner } from "@/components/kit";
import { SideShell, type NavItem } from "@/components/SideShell";

const NAV: NavItem[] = [
  { href: "/provider", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/", label: "Explore properties", icon: Compass, exact: true },
  { href: "/provider/properties", label: "My properties", icon: Building2 },
  { href: "/provider/boarding", label: "Boarding houses", icon: BedDouble },
  { href: "/provider/occupants", label: "Tenants & occupants", icon: Users },
  { href: "/provider/bookings", label: "Bookings & enquiries", icon: CalendarCheck },
  { href: "/provider/earnings", label: "Payments & earnings", icon: Wallet },
  { href: "/provider/analytics", label: "Analytics", icon: BarChart3 },
];

const FOOTER: NavItem[] = [
  { href: "/favourites", label: "Favourites", icon: Heart },
  { href: "/profile", label: "Profile", icon: User },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function ProviderFrame({ children }: { children: React.ReactNode }) {
  const { me, loading, switchMode } = useSession();
  if (loading || !me) return <Spinner />;

  const footer = [...FOOTER];
  return (
    <SideShell nav={NAV} footer={footer} badge="Provider" context="provider">
      {me.can_use_provider_tools ? (
        <>
          {children}
          <div className="mt-10 flex justify-center lg:hidden">
            <button type="button" onClick={() => switchMode("marketplace")} className="inline-flex items-center gap-2 text-sm font-semibold text-muted-ink">
              <Store className="size-4" /> Switch to marketplace
            </button>
          </div>
        </>
      ) : (
        <div className="mx-auto max-w-lg pt-10">
          <Empty
            title={me.provider_status === "suspended" ? "Your provider account is suspended" : "Provider tools need an approved account"}
            action={<ButtonLink href={me.provider_status === "suspended" ? "/" : "/become-provider"}>{me.provider_status === "suspended" ? "Go to marketplace" : "Apply to become a provider"}</ButtonLink>}
          >
            {me.provider_status === "pending"
              ? "Your application is still being reviewed. You'll be notified when it's decided."
              : me.provider_status === "suspended"
                ? me.provider?.suspension_reason || "Contact Nyumba support to be reinstated."
                : "Apply once with your current account. An administrator reviews every application."}
          </Empty>
        </div>
      )}
    </SideShell>
  );
}
