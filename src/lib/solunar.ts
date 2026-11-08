// Solunar periods (J. A. Knight, 1926) — CALCULATED from the moon's position.
//
//   MAJOR: the moon overhead (transit) and underfoot (antitransit), ±1 h  → 2 h wide
//   MINOR: moonrise and moonset, ±30 min                                  → 1 h wide
//
// This is the window convention used by open-source solunar engines and by
// tides4fishing. The theory is traditional; scientific support is limited, so the
// app shows it as extra information and does NOT mix it into the best-times score.

import * as SunCalc from "suncalc";

const MIN = 60_000;
const H = 60 * MIN;
const RAD = Math.PI / 180;
const MOON_HORIZON = 0.133 * RAD; // the threshold SunCalc itself uses for moonrise/moonset

export interface MoonEvents {
  rise: number[];
  set: number[];
  transit: number[]; // moon highest (overhead)
  antitransit: number[]; // moon lowest (underfoot)
}

export interface SolunarPeriod {
  kind: "major" | "minor";
  /** what the window is centred on */
  event: "transit" | "antitransit" | "rise" | "set";
  at: number;
  start: number;
  end: number;
}

const alt = (t: number, lat: number, lng: number) => SunCalc.getMoonPosition(new Date(t), lat, lng).altitude;

/** Moonrise, moonset, transit and antitransit inside [from, to). */
export function moonEvents(from: number, to: number, lat: number, lng: number): MoonEvents {
  const step = 5 * MIN;
  const ev: MoonEvents = { rise: [], set: [], transit: [], antitransit: [] };
  const ts: number[] = [];
  const as: number[] = [];
  for (let t = from - 2 * H; t <= to + 2 * H; t += step) {
    ts.push(t);
    as.push(alt(t, lat, lng));
  }
  const inside = (t: number) => t >= from && t < to;
  for (let i = 1; i < ts.length - 1; i++) {
    const a = as[i - 1] - MOON_HORIZON;
    const b = as[i] - MOON_HORIZON;
    if (a < 0 && b >= 0) {
      const t = ts[i - 1] + (-a / (b - a)) * step;
      if (inside(t)) ev.rise.push(Math.round(t));
    } else if (a >= 0 && b < 0) {
      const t = ts[i - 1] + (a / (a - b)) * step;
      if (inside(t)) ev.set.push(Math.round(t));
    }
    const y0 = as[i - 1], y1 = as[i], y2 = as[i + 1];
    const isMax = y1 >= y0 && y1 > y2;
    const isMin = y1 <= y0 && y1 < y2;
    if (isMax || isMin) {
      const d = y0 - 2 * y1 + y2;
      const off = d !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / d)) : 0;
      const t = Math.round(ts[i] + off * step);
      if (inside(t)) (isMax ? ev.transit : ev.antitransit).push(t);
    }
  }
  return ev;
}

/** The solunar periods of the 24 h starting at `dayStart`, in time order. */
export function solunarDay(dayStart: number, lat: number, lng: number): SolunarPeriod[] {
  const ev = moonEvents(dayStart, dayStart + 24 * H, lat, lng);
  const out: SolunarPeriod[] = [
    ...ev.transit.map((at) => ({ kind: "major" as const, event: "transit" as const, at, start: at - H, end: at + H })),
    ...ev.antitransit.map((at) => ({ kind: "major" as const, event: "antitransit" as const, at, start: at - H, end: at + H })),
    ...ev.rise.map((at) => ({ kind: "minor" as const, event: "rise" as const, at, start: at - 30 * MIN, end: at + 30 * MIN })),
    ...ev.set.map((at) => ({ kind: "minor" as const, event: "set" as const, at, start: at - 30 * MIN, end: at + 30 * MIN })),
  ];
  return out.sort((a, b) => a.at - b.at);
}

/** true when two time ranges share at least 15 minutes. */
export function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return Math.min(a.end, b.end) - Math.max(a.start, b.start) >= 15 * MIN;
}
