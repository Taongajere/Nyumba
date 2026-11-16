"use client";

import { Building2, ClipboardCheck, Flag, LayoutDashboard, Percent, Store, Users, Wallet } from "lucide-react";
import { useSession } from "@/lib/session";
import { ButtonLink, Empty, Spinner } from "@/components/kit";
import { SideShell, type NavItem } from "@/components/SideShell";

const NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard, exact: true },
  { href: "/admin/applications", label: "Provider applications", icon: ClipboardCheck },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/listings", label: "Listings", icon: Building2 },
  { href: "/admin/reports", label: "Reports", icon: Flag },
  { href: "/admin/finance", label: "Finance", icon: Wallet },
  { href: "/admin/settings", label: "Commission & categories", icon: Percent },
];

export function AdminFrame({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  if (loading || !me) return <Spinner />;
  if (!me.is_admin)
    return (
      <div className="mx-auto max-w-lg p-10">
        <Empty title="Administrators only" action={<ButtonLink href="/">Go to marketplace</ButtonLink>}>
          This area is for Nyumba staff.
        </Empty>
      </div>
    );
  return (
    <SideShell nav={NAV} footer={[{ href: "/", label: "Marketplace", icon: Store, exact: true }]} badge="Admin" context="admin">
      {children}
    </SideShell>
  );
}
