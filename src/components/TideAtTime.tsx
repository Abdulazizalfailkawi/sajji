"use client";

// One line under the catch time: what the tide is doing at that moment
// (ثبر / سجي / وقفة الجزر / وقفة المد) and when the next turn is.

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getConditions, kuwaitMidnight, turnsOf } from "@/lib/marine/client";
import { tideState } from "@/lib/marine/waqfa";
import { fmtTime } from "@/lib/time";

const H = 3_600_000;

export function TideAtTime({ lat, lng, at }: { lat: number | null; lng: number | null; at: string | null }) {
  const { t, lang } = useI18n();
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    setLine(null);
    if (lat == null || lng == null || !at) return;
    const ms = Date.parse(at);
    if (!Number.isFinite(ms) || Math.abs(ms - Date.now()) > 7 * 24 * H) return;
    let dead = false;
    const from = Math.min(ms - 14 * H, kuwaitMidnight(ms) - 6 * H);
    getConditions(lat, lng, new Date(from), new Date(ms + 30 * H)).then((r) => {
      if (dead || !r.data) return;
      const { pts, turns } = turnsOf(r.data);
      if (!pts.length) return;
      const st = tideState(pts, turns, ms);
      const next = st.turn && st.direction === "waqfa" ? st.turn : (st.nextHigh && st.nextLow ? (st.nextHigh.t < st.nextLow.t ? st.nextHigh : st.nextLow) : st.nextHigh ?? st.nextLow);
      const what =
        st.direction === "waqfa"
          ? st.turn?.type === "low"
            ? t("وقفة الجزر", "Low-tide slack")
            : t("وقفة المد", "High-tide slack")
          : st.direction === "rising"
            ? t("سجي (الماء يرتفع)", "Rising (saji)")
            : st.direction === "falling"
              ? t("ثبر (الماء ينزل)", "Falling (thabr)")
              : null;
      if (!what) return;
      const tail = next && st.direction !== "waqfa" ? ` · ${next.type === "high" ? t("المد", "high") : t("الجزر", "low")} ${fmtTime(next.t, lang)}` : "";
      setLine(`${what}${tail}`);
    });
    return () => {
      dead = true;
    };
  }, [lat, lng, at, t, lang]);

  if (!line) return null;
  return <div className="rounded-xl bg-ocean/10 px-3 py-2 text-sm font-semibold text-white">🌊 {t("وقتها:", "Then:")} {line}</div>;
}
