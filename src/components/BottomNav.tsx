"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Camera, CircleUserRound, Fish, Waves } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { cn } from "./ui";

/** Routes that belong to each section (design v3: البحر · صيدي · [كاميرا] · حسابي). */
export const SECTION_ROUTES = {
  sea: ["/marine", "/best-times"],
  trips: ["/trips", "/trip", "/catch", "/catches", "/calendar", "/spots", "/spot", "/equipment", "/gallery", "/search", "/quick", "/marks"],
  account: ["/account", "/community", "/map", "/stats", "/analytics", "/collection", "/species", "/records", "/achievements", "/reports", "/report", "/settings", "/more", "/admin"],
};

/** Opens the quick-catch sheet from anywhere (bottom bar, sea screen). */
export function openQuickCatch() {
  window.dispatchEvent(new Event("sj:quick-catch"));
}

export function BottomNav() {
  const path = usePathname();
  const { t } = useI18n();
  const { mode } = useStore();
  const items = [
    { href: "/", icon: Waves, label: t("البحر", "Sea"), match: (p: string) => p === "/" || SECTION_ROUTES.sea.some((x) => p.startsWith(x)) },
    { href: "/trips", icon: Fish, label: t("صيدي", "My catches"), match: (p: string) => SECTION_ROUTES.trips.some((x) => p.startsWith(x)) },
    null,
    { href: "/account", icon: CircleUserRound, label: mode === "cloud" ? t("حسابي", "Account") : t("تسجيل دخول", "Sign in"), match: (p: string) => SECTION_ROUTES.account.some((x) => p.startsWith(x)) },
  ];
  return (
    <nav className="no-print fixed inset-x-3 bottom-[calc(var(--safe-bottom)+0.75rem)] z-40 mx-auto max-w-md">
      <ul className="glass grid h-[68px] grid-cols-[1fr_1fr_88px_1fr] items-stretch rounded-[26px] shadow-[0_12px_30px_rgb(0_0_0/0.4)]">
        {items.map((it, i) => {
          if (!it)
            return (
              <li key="cam" className="relative">
                <button
                  type="button"
                  onClick={openQuickCatch}
                  aria-label={t("سجّل صيدة", "Log a catch")}
                  className="absolute start-1/2 -top-5 grid size-16 place-items-center rounded-[22px] bg-gradient-to-br from-ocean to-mint text-abyss shadow-[0_10px_24px_rgb(95_211_168/0.35)] transition-transform active:scale-95 rtl:translate-x-1/2 ltr:-translate-x-1/2"
                >
                  <Camera className="size-7" strokeWidth={2.2} />
                </button>
                <span className="absolute inset-x-0 bottom-2 text-center text-xs font-bold text-ocean">{t("سجّل", "Log")}</span>
              </li>
            );
          const on = it.match(path);
          const Icon = it.icon;
          return (
            <li key={it.href + i}>
              <Link href={it.href} className={cn("flex h-full flex-col items-center justify-center gap-0.5 text-xs font-bold transition-colors", on ? "text-ocean" : "text-muted")}>
                <Icon className="size-6" />
                <span>{it.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
