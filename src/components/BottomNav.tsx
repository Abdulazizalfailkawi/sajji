"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CircleUserRound, Map as MapIcon, Sailboat, Users, Waves } from "lucide-react";
import { useCommunityActivity } from "@/lib/community";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { cn } from "./ui";

/** Routes that belong to each of the three primary sections. */
export const SECTION_ROUTES = {
  sea: ["/marine"],
  trips: ["/trips", "/trip", "/catch", "/catches", "/calendar", "/spots", "/spot", "/equipment", "/gallery", "/search", "/quick", "/marks"],
  account: ["/account"],
  community: ["/community"],
  map: ["/map"],
  stats: ["/stats", "/analytics", "/collection", "/species", "/records", "/achievements", "/reports", "/report", "/settings", "/more"],
};

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const { mode } = useStore();
  const activity = useCommunityActivity();
  const items = [
    { href: "/", icon: Waves, label: t("البحر", "Sea"), match: (p: string) => p === "/" || SECTION_ROUTES.sea.some((x) => p.startsWith(x)) },
    { href: "/trips", icon: Sailboat, label: t("رحلاتي وصيدي", "Trips & catches"), match: (p: string) => SECTION_ROUTES.trips.some((x) => p.startsWith(x)) },
    { href: "/community", icon: Users, label: t("المجتمع", "Community"), badge: activity.total, match: (p: string) => SECTION_ROUTES.community.some((x) => p.startsWith(x)) },
    { href: "/map", icon: MapIcon, label: t("الخريطة", "Map"), match: (p: string) => SECTION_ROUTES.map.some((x) => p.startsWith(x)) },
    { href: "/stats", icon: BarChart3, label: t("إحصائياتي", "My stats"), match: (p: string) => SECTION_ROUTES.stats.some((x) => p.startsWith(x)) },
    { href: "/account", icon: CircleUserRound, label: mode === "cloud" ? t("حسابي", "My account") : t("تسجيل دخول", "Sign in"), match: (p: string) => SECTION_ROUTES.account.some((x) => p.startsWith(x)) },
  ];
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-line/50 bg-navy/90 pb-[var(--safe-bottom)] backdrop-blur-xl">
      <ul className="mx-auto flex max-w-3xl items-stretch justify-around px-2">
        {items.map((it) => {
          const on = it.match(path);
          const Icon = it.icon;
          return (
            <li key={it.href} className="flex-1">
              <Link href={it.href} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium", on ? "text-teal" : "text-muted")}>
                <span className={cn("relative grid h-8 w-12 place-items-center rounded-full transition-colors", on && "bg-teal/15")}>
                  <Icon className="size-6" />
                  {"badge" in it && (it.badge ?? 0) > 0 && !on && <span className="absolute end-2 top-0 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold leading-4 text-white">{it.badge}</span>}
                </span>
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
