"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n } from "@/lib/i18n";
import { cn } from "./ui";

/** Secondary pages shown as tabs inside a primary section. */
export function SectionTabs({ section }: { section: "trips" | "stats" }) {
  const path = usePathname();
  const { t } = useI18n();
  const tabs =
    section === "trips"
      ? [
          { href: "/catches", l: t("صيدي", "Catches") },
          { href: "/trips", l: t("الرحلات", "Trips") },
          { href: "/calendar", l: t("التقويم", "Calendar") },
          { href: "/spots", l: t("المواقع", "Spots") },
          { href: "/equipment", l: t("المعدات", "Gear") },
          { href: "/gallery", l: t("الصور", "Photos") },
          { href: "/marks", l: t("إحداثياتي", "Marks") },
        ]
      : [
          { href: "/stats", l: t("ملفي", "Profile") },
          { href: "/collection", l: t("الأنواع", "Species") },
          { href: "/analytics", l: t("التحليلات", "Analytics") },
          { href: "/records", l: t("الأرقام", "Records") },
          { href: "/reports", l: t("التقارير", "Reports") },
          { href: "/achievements", l: t("الإنجازات", "Goals") },
          { href: "/settings", l: t("الإعدادات", "Settings") },
        ];
  return (
    <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
      {tabs.map((x) => {
        const on = path === x.href;
        return (
          <Link
            key={x.href}
            href={x.href}
            className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm", on ? "border-teal bg-teal/15 text-teal" : "border-line bg-surface-2 text-ink-2")}
          >
            {x.l}
          </Link>
        );
      })}
    </div>
  );
}
