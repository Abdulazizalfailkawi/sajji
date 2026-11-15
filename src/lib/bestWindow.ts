// أفضل وقت للطلعة — the longest run of hours in a period where a small boat is
// fine: wind and gusts "green" by the app's own thresholds (src/config/marine.ts)
// and the pressure not falling fast. Computed only from the hourly forecast; with
// two forecast sources the caller passes the hours where BOTH agree.

import { windLight } from "../config/marine";

const H = 3_600_000;

export interface HourIn {
  /** hour start, ms */
  t: number;
  wind: number | null; // km/h
  gust: number | null; // km/h
  pressure?: number | null; // hPa
}

export interface BestWindow {
  start: number; // ms, hour start
  end: number; // ms, exclusive end (start of the first hour that is no longer fine)
  hours: number;
  meanWindKmh: number;
  maxWindKmh: number;
  /** the whole period is fine */
  allDay: boolean;
}

/** Pressure change over the previous 3 h at hour `t` (hPa), null when unknown. */
function delta3h(byT: Map<number, HourIn>, t: number): number | null {
  const now = byT.get(t)?.pressure;
  const before = byT.get(t - 3 * H)?.pressure;
  return now != null && before != null ? now - before : null;
}

export function isFineHour(h: HourIn, byT: Map<number, HourIn>): boolean {
  if (windLight(h.wind, h.gust) !== "green") return false; // red, yellow, or no wind data at all
  const d = delta3h(byT, h.t);
  return d == null || d > -3; // a fast fall (≥ 3 hPa in 3 h) means the weather is about to change
}

/**
 * Longest consecutive run of fine hours inside [from, to). Ties go to the calmer
 * run. A run needs at least `minHours` hours; otherwise null.
 */
export function bestWindow(hours: HourIn[], from: number, to: number, minHours = 2): BestWindow | null {
  const byT = new Map(hours.map((h) => [h.t, h]));
  const start = Math.ceil(from / H) * H;
  let best: BestWindow | null = null;
  let runStart: number | null = null;
  const winds: number[] = [];

  const close = (endT: number) => {
    if (runStart == null) return;
    const n = Math.round((endT - runStart) / H);
    if (n >= minHours) {
      const cand: BestWindow = {
        start: runStart,
        end: endT,
        hours: n,
        meanWindKmh: winds.reduce((a, b) => a + b, 0) / winds.length,
        maxWindKmh: Math.max(...winds),
        allDay: false,
      };
      if (!best || cand.hours > best.hours || (cand.hours === best.hours && cand.meanWindKmh < best.meanWindKmh)) best = cand;
    }
    runStart = null;
    winds.length = 0;
  };

  let total = 0;
  for (let t = start; t < to; t += H) {
    total++;
    const h = byT.get(t);
    if (h && isFineHour(h, byT)) {
      if (runStart == null) runStart = t;
      winds.push(h.wind ?? 0);
    } else close(t);
  }
  close(start + total * H);
  const res = best as BestWindow | null;
  if (res) res.allDay = res.hours === total;
  return res;
}
