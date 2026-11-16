"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFavourites } from "@/lib/favourites";
import { useSession } from "@/lib/session";
import { Logo } from "@/components/kit";
import { NotificationBell } from "@/components/NotificationBell";
import { UserMenu } from "@/components/UserMenu";

const NAV = [
  { href: "/", label: "Explore", match: (p: string) => p === "/" },
  { href: "/properties", label: "Properties", match: (p: string) => p.startsWith("/properties") || p.startsWith("/listings") },
  { href: "/boarding-houses", label: "Boarding houses", match: (p: string) => p.startsWith("/boarding-houses") },
];

export function MarketHeader() {
  const pathname = usePathname();
  const { count } = useFavourites();
  const { me } = useSession();

  return (
    <header className="border-b border-line">
      <div className="flex items-center gap-4 px-4 py-3.5 sm:px-6 lg:px-8">
        <Link href="/" aria-label="Nyumba home" className="shrink-0">
          <Logo />
        </Link>
        {me?.provider_status === "approved" && (
          <span className="hidden rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-ink-2 italic sm:inline">
            Provider
          </span>
        )}
        <nav aria-label="Marketplace" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.match(pathname) ? "page" : undefined}
              className={cn(
                "rounded-full px-3.5 py-2 text-sm font-semibold transition-colors",
                item.match(pathname) ? "bg-subtle text-ink" : "text-muted-ink hover:text-ink"
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          <Link
            href="/favourites"
            aria-label={`Favourites, ${count} saved`}
            className="flex h-11 items-center gap-1.5 rounded-full bg-heart-soft px-3.5 text-sm font-bold text-ink hover:bg-heart-soft/70"
          >
            <Heart className="size-[18px] fill-heart text-heart" aria-hidden />
            <span className="tabular-nums">{count}</span>
          </Link>
          <NotificationBell />
          <UserMenu context="marketplace" />
        </div>
      </div>
      <nav aria-label="Marketplace" className="scrollbar-none flex gap-1 overflow-x-auto px-4 pb-3 md:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={item.match(pathname) ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold",
              item.match(pathname) ? "bg-navy text-white" : "bg-subtle text-ink-2"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
