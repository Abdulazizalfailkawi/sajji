"use client";

// فترات القمر (سولونار) — extra information next to the best-times windows.
// Not part of the score: it only shows when the moon periods fall, and which of
// them overlap a good tide window of the day.

import { useMemo } from "react";
import { Moon } from "lucide-react";
import { MOON_EMOJI, moonAt } from "@/lib/astro";
import { MOON_LABEL, useI18n } from "@/lib/i18n";
import { overlaps, solunarDay } from "@/lib/solunar";
import { fmtTime } from "@/lib/time";
import { Card, cn } from "./ui";

export function SolunarCard({ dayStart, lat, lng, windows }: { dayStart: number; lat: number; lng: number; windows: { from: number; to: number }[] }) {
  const { t, lang } = useI18n();
  const periods = useMemo(() => solunarDay(dayStart, lat, lng), [dayStart, lat, lng]);
  const moon = useMemo(() => moonAt(new Date(dayStart + 12 * 3_600_000)), [dayStart]);

  const label = (e: string) =>
    e === "transit" ? t("القمر فوق رأسك", "Moon overhead") : e === "antitransit" ? t("القمر تحت قدمك", "Moon underfoot") : e === "rise" ? t("شروق القمر", "Moonrise") : t("غروب القمر", "Moonset");

  return (
    <Card className="mt-3 space-y-2 p-3.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Moon className="size-4 text-ocean" /> {t("فترات القمر (سولونار)", "Moon periods (solunar)")}
        </div>
        <span className="text-xs text-ink-2">
          {MOON_EMOJI[moon.phase]} {MOON_LABEL[moon.phase][lang]} <bdi>{Math.round(moon.illumination * 100)}%</bdi>
        </span>
      </div>
      <div className="space-y-1.5">
        {periods.map((p) => {
          const good = windows.some((w) => overlaps(p, { start: w.from, end: w.to }));
          return (
            <div key={`${p.event}-${p.at}`} className={cn("flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm", p.kind === "major" ? "bg-ocean/15" : "bg-surface-2")}>
              <span className="min-w-0">
                <span className="block font-semibold">
                  {p.kind === "major" ? t("رئيسية", "Major") : t("ثانوية", "Minor")} · {label(p.event)}
                </span>
                {good && <span className="block text-[11px] text-good">✓ {t("تتقاطع مع نافذة مد حلوة", "overlaps a good tide window")}</span>}
              </span>
              <span className="ltr shrink-0 whitespace-nowrap text-xs font-bold">
                {fmtTime(p.start, lang)} – {fmtTime(p.end, lang)}
              </span>
            </div>
          );
        })}
        {!periods.length && <div className="text-xs text-muted">—</div>}
      </div>
      <p className="text-[11px] leading-relaxed text-muted">
        {t(
          "نظرية تقليدية (جون ألدن نايت، 1926): الرئيسية ساعتين حول عبور القمر، والثانوية ساعة حول شروقه وغروبه. معلومة إضافية فقط، ما تدخل في التقييم فوق.",
          "A traditional theory (John Alden Knight, 1926): major = 2 h around the moon's transit, minor = 1 h around moonrise/moonset. Extra information only — it is not part of the score above.",
        )}
      </p>
    </Card>
  );
}
