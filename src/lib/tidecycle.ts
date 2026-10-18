// الحمل والفساد — the traditional Gulf tide cycle counted by the Hijri day.
//
// الحمل (Haml): days of strong tides (spring tides) around the new and full moon.
// الفساد (Fasad): days of weak tides (neap tides) around the first and last quarter.
// Days outside both ranges are transitional.
//
// Local conventions differ between fishermen, so the day ranges are editable
// in Settings. The Hijri day used is the app's Hijri date (Umm al-Qura plus the
// user's global offset), so a moon-sighting correction also shifts the cycle.

import { addDays } from "./time";
import { hijriForDateKey } from "./hijri";

export type Cycle = "hamal" | "fasad" | "between";
export type DayRange = [number, number]; // inclusive Hijri days; may wrap (e.g. 28–3)

export interface CycleConfig {
  hamal: DayRange[];
  fasad: DayRange[];
}

/**
 * Default, taken from the Kuwait tide bulletin kept in reference/tides/: haml runs
 * from the 27th to the 4th of the Hijri month ("نهاية الحمل" on the 4th, "بداية
 * الفساد الصغير" on the 5th, 18 Oct 2026 = 7th = 3rd day of fasad). The second
 * half of the month mirrors it around the full moon (12–19 haml, 20–26 fasad);
 * that half is inferred by symmetry, not read from the bulletin.
 */
export const DEFAULT_CYCLE: CycleConfig = {
  hamal: [
    [12, 19],
    [27, 4],
  ],
  fasad: [
    [5, 11],
    [20, 26],
  ],
};

export function inRange(day: number, [a, b]: DayRange): boolean {
  return a <= b ? day >= a && day <= b : day >= a || day <= b;
}

export function cycleForHijriDay(day: number, cfg: CycleConfig = DEFAULT_CYCLE): Cycle {
  if (cfg.hamal.some((r) => inRange(day, r))) return "hamal";
  if (cfg.fasad.some((r) => inRange(day, r))) return "fasad";
  return "between";
}

export function cycleOnDate(key: string, offset = 0, cfg: CycleConfig = DEFAULT_CYCLE): Cycle {
  return cycleForHijriDay(hijriForDateKey(key, offset).day, cfg);
}

/** Cycle plus "day N" within the current run of that cycle (counted on real calendar days). */
export function cycleInfo(key: string, offset = 0, cfg: CycleConfig = DEFAULT_CYCLE): { cycle: Cycle; day: number } {
  const cycle = cycleOnDate(key, offset, cfg);
  let day = 1;
  let k = key;
  for (let i = 0; i < 20; i++) {
    k = addDays(k, -1);
    if (cycleOnDate(k, offset, cfg) !== cycle) break;
    day++;
  }
  return { cycle, day };
}

/** Parse "13-18, 28-3" → [[13,18],[28,3]]; null when invalid. */
export function parseRanges(s: string): DayRange[] | null {
  const parts = s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .split(/[,،]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!parts.length) return [];
  const out: DayRange[] = [];
  for (const p of parts) {
    const m = /^(\d{1,2})\s*[-–]\s*(\d{1,2})$/.exec(p);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a < 1 || a > 30 || b < 1 || b > 30) return null;
    out.push([a, b]);
  }
  return out;
}

export function formatRanges(r: DayRange[]): string {
  return r.map(([a, b]) => `${a}-${b}`).join(", ");
}

/** True when a day would belong to both cycles (configuration error). */
export function overlaps(cfg: CycleConfig): boolean {
  for (let d = 1; d <= 30; d++) if (cfg.hamal.some((r) => inRange(d, r)) && cfg.fasad.some((r) => inRange(d, r))) return true;
  return false;
}

const KEY = "ft.tideCycle";
export function readCycleConfig(): CycleConfig {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw) as CycleConfig;
      if (Array.isArray(c.hamal) && Array.isArray(c.fasad)) return c;
    }
  } catch {}
  return DEFAULT_CYCLE;
}
export function saveCycleConfig(c: CycleConfig | null) {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {}
}

export const CYCLE_LABEL: Record<Cycle, { ar: string; en: string }> = {
  hamal: { ar: "حمل", en: "Haml (spring tides)" },
  fasad: { ar: "فساد", en: "Fasad (neap tides)" },
  between: { ar: "بين الحمل والفساد", en: "Transition" },
};

