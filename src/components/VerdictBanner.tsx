"use client";

import type { Verdict } from "@/lib/verdict";
import { knots } from "@/lib/verdict";
import { compass, fmtWind, type WindUnit } from "@/lib/marine/units";
import type { Light } from "@/config/marine";
import { cn } from "@/components/ui";

const DOT_BG: Record<Light, string> = { green: "bg-emerald-500", yellow: "bg-amber-400", red: "bg-red-500" };
const Dot = ({ l }: { l: Light }) => <span className={cn("me-1.5 inline-block size-3 rounded-full align-middle", DOT_BG[l])} />;
const BOX: Record<Light, string> = {
  green: "border-emerald-500/50 bg-emerald-500/10",
  yellow: "border-amber-400/60 bg-amber-400/10",
  red: "border-red-500/60 bg-red-500/10",
};

export function VerdictBanner({ v, unit, lang, when }: { v: Verdict | null; unit: WindUnit; lang: "ar" | "en"; when: string }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  if (!v) return null;
  const title =
    v.light === "green"
      ? t("✅ البحر زين للطلعة", "✅ Sea looks good to go out")
      : v.light === "yellow"
        ? t("⚠️ انتبه، الجو متوسط", "⚠️ Careful, conditions are moderate")
        : t("⛔ لا تطلع، البحر مو آمن", "⛔ Don't go out");
  const reason: string[] = [];
  if (v.maxWindKmh != null) {
    const gust = v.maxGustKmh != null && v.maxGustKmh > v.maxWindKmh + 5 ? `، ${t("هبات", "gusts")} ${fmtWind(v.maxGustKmh, unit, lang)}` : "";
    reason.push(`${t("ريح", "Wind")} ${fmtWind(v.maxWindKmh, unit, lang)}${v.windDir != null ? " " + compass(v.windDir, lang) : ""}${gust}`);
  }
  if (v.maxWaveM != null) reason.push(`${t("موج", "Waves")} ${v.maxWaveM.toFixed(1)} ${t("م", "m")}`);
  return (
    <section className={cn("mb-3 rounded-2xl border p-4", BOX[v.light])} aria-live="polite">
      <div className="text-lg font-bold leading-snug">{title}</div>
      <div className="mt-1 text-sm text-ink-2">{reason.join(" · ")}</div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {v.wind && (
          <span className="rounded-full bg-black/30 px-2.5 py-1">
            <Dot l={v.wind} />{t("الريح", "Wind")}
            {v.maxWindKmh != null && unit === "kmh" ? ` · ${knots(v.maxWindKmh)} ${t("عقدة", "kn")}` : ""}
          </span>
        )}
        {v.wave && (
          <span className="rounded-full bg-black/30 px-2.5 py-1">
            <Dot l={v.wave} />{t("الموج", "Waves")}
          </span>
        )}
        <span className="text-muted">{when}</span>
      </div>
    </section>
  );
}
