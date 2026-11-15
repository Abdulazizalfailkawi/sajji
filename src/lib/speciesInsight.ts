// «متى يطلع لك هالسمك؟» — computed only from the user's own catches of one species:
// share of haml / fasad / in-between days, the most common tide movement and the
// most common part of the day. Nothing here is invented: with few catches the
// caller shows how many it is based on.

import type { Cycle } from "./tidecycle";
import type { Tide } from "./types";

export type DayBand = "dawn" | "morning" | "noon" | "afternoon" | "sunset" | "night";
export type Water = "saji" | "thabr" | "waqfa";

export const BAND_LABEL: Record<DayBand, { ar: string; en: string }> = {
  dawn: { ar: "الفجر", en: "Dawn" },
  morning: { ar: "الصبح", en: "Morning" },
  noon: { ar: "الظهر", en: "Noon" },
  afternoon: { ar: "العصر", en: "Afternoon" },
  sunset: { ar: "المغرب", en: "Sunset" },
  night: { ar: "الليل", en: "Night" },
};

export const WATER_LABEL: Record<Water, { ar: string; en: string }> = {
  saji: { ar: "سجي", en: "Saji" },
  thabr: { ar: "ثبر", en: "Thabr" },
  waqfa: { ar: "وقفة", en: "Waqfa" },
};

/** Kuwait-local hour (0–23) of a timestamp. */
export function kuwaitHour(iso: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuwait", hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
}

export function bandOfHour(h: number): DayBand {
  if (h >= 3 && h < 6) return "dawn";
  if (h >= 6 && h < 11) return "morning";
  if (h >= 11 && h < 15) return "noon";
  if (h >= 15 && h < 18) return "afternoon";
  if (h >= 18 && h < 20) return "sunset";
  return "night";
}

export function waterOfTide(t: Tide | null | undefined): Water | null {
  return t === "rising" ? "saji" : t === "falling" ? "thabr" : t === "high" || t === "low" ? "waqfa" : null;
}

export interface InsightInput {
  at: string;
  cycle: Cycle;
  tide: Tide | null;
}

export interface Insight {
  count: number;
  hamal: number; // percent
  fasad: number;
  between: number;
  water: { key: Water; count: number } | null;
  waterKnown: number;
  band: { key: DayBand; count: number } | null;
}

function top<T extends string>(list: T[]): { key: T; count: number } | null {
  const c = new Map<T, number>();
  for (const x of list) c.set(x, (c.get(x) ?? 0) + 1);
  let best: { key: T; count: number } | null = null;
  for (const [key, count] of c) if (!best || count > best.count) best = { key, count };
  return best;
}

export function insightFor(items: InsightInput[]): Insight | null {
  if (!items.length) return null;
  const n = items.length;
  const pct = (k: Cycle) => Math.round((items.filter((i) => i.cycle === k).length / n) * 100);
  const waters = items.map((i) => waterOfTide(i.tide)).filter((w): w is Water => w != null);
  return {
    count: n,
    hamal: pct("hamal"),
    fasad: pct("fasad"),
    between: pct("between"),
    water: top(waters),
    waterKnown: waters.length,
    band: top(items.map((i) => bandOfHour(kuwaitHour(i.at)))),
  };
}
