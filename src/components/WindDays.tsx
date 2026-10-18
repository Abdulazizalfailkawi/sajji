"use client";

// Wind & waves for today, tomorrow and the day after: strongest wind (km/h),
// gusts, direction (name + degrees + arrow) and wave height, with the same
// traffic light as the verdict. Daytime window 05:00–19:00 Kuwait time.

import type { Conditions } from "@/lib/marine/types";
import { kuwaitMidnight } from "@/lib/marine/client";
import { compass, fmtWind, type WindUnit } from "@/lib/marine/units";
import { verdictFor } from "@/lib/verdict";
import { cn } from "@/components/ui";

const H = 3_600_000;
const BG = { green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500" } as const;

export function WindDays({ c, now, unit, lang }: { c: Conditions; now: number; unit: WindUnit; lang: "ar" | "en" }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const day0 = kuwaitMidnight(now);
  const names = [t("اليوم", "Today"), t("باجر", "Tomorrow"), t("بعد باجر", "Day after")];
  const rows = [0, 1, 2].map((d) => {
    const from = day0 + d * 24 * H + 5 * H;
    return { name: names[d], v: verdictFor(c, d === 0 ? Math.max(from, now) : from, day0 + d * 24 * H + 19 * H) };
  });
  return (
    <div className="space-y-1.5">
      {rows.map(({ name, v }) => (
        <div key={name} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm">
          <span className={cn("size-3 shrink-0 rounded-full", v ? BG[v.light] : "bg-line")} />
          <span className="w-16 shrink-0 font-semibold">{name}</span>
          {v && v.maxWindKmh != null ? (
            <span className="min-w-0 flex-1 text-xs leading-snug text-ink-2">
              <span className="font-bold text-white">{fmtWind(v.maxWindKmh, unit, lang)}</span>
              {v.maxGustKmh != null && v.maxGustKmh > v.maxWindKmh + 3 ? ` · ${t("هبات", "gusts")} ${fmtWind(v.maxGustKmh, unit, lang)}` : ""}
              {v.windDir != null && (
                <>
                  {" · "}
                  <span className="inline-block" style={{ transform: `rotate(${(v.windDir + 180) % 360}deg)` }} aria-hidden>
                    ↑
                  </span>{" "}
                  {compass(v.windDir, lang)} {Math.round(v.windDir)}°
                </>
              )}
              {v.maxWaveM != null ? ` · ${t("موج", "waves")} ${v.maxWaveM.toFixed(1)} ${t("م", "m")}` : ""}
            </span>
          ) : (
            <span className="text-xs text-muted">{t("ما فيه بيانات", "No data")}</span>
          )}
        </div>
      ))}
    </div>
  );
}
