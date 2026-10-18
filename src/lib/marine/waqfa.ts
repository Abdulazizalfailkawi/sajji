// سجي / ثبر / الوقفة — tide direction and turning periods.
//
// Definitions used in the app:
//   سجي  = rising tide (water level increasing)
//   ثبر  = falling tide (water level decreasing)
//   الوقفة = an APPROXIMATE period around a turning point (high or low water)
//           during which the predicted water level changes slowly. Water does
//           not literally stop, and local currents can differ.
//
// Method (time series available):
//   1. Turning point = local extremum of the predicted series, refined with a
//      parabola through the three surrounding samples (see tide.ts).
//   2. Near the turning point the curve is ≈ h(t) = h0 + ½·a·(t − t0)², where
//      a is the curvature from the second difference of those samples (m/h²).
//      The rate of change is a·(t − t0).
//   3. The estimated waqfa interval is where |rate| < WAQFA_RATE (5 cm/h):
//      |t − t0| < WAQFA_RATE / |a|. In Kuwait (range 1–3 m, peak rates
//      ~0.3–0.8 m/h) 5 cm/h is roughly 10% of the peak rate. The half-width is
//      capped at 90 min; a flatter curve (weak neap tide) is reported as such.
//   4. Uncertainty: the turning time of hourly model data is given as ±30 min
//      (±15 min for 30-min data) on top of model error versus the real coast.
//
// Method (only high/low event times available, e.g. manual official table):
//   the turning point is the event time itself; NO waqfa duration is invented.

import type { Extreme, Pt } from "./tide";
import { heightAt } from "./tide";
import { AT_PEAK_MIN } from "../../config/marine";

export const WAQFA_RATE_M_PER_H = 0.05;
export const WAQFA_MAX_HALF_MIN = 90;

export interface TurnEvent {
  t: number; // estimated turning time (epoch ms)
  h: number | null; // predicted level (m), null if unknown
  type: "high" | "low";
  basis: "series" | "events";
  /** estimated waqfa window (null when it cannot be justified) */
  waqfaStart: number | null;
  waqfaEnd: number | null;
  /** ± minutes on the turning time from the data resolution alone */
  uncertaintyMin: number | null;
  /** waqfa half-width hit the cap: the curve is very flat (weak tide) */
  flat: boolean;
}

const H = 3_600_000;

/** Turning points with waqfa windows from a predicted series. */
export function turningPoints(pts: Pt[], ext: Extreme[]): TurnEvent[] {
  if (pts.length < 3) return [];
  const step = median(pts.slice(1).map((p, i) => p.t - pts[i].t));
  const out: TurnEvent[] = [];
  for (const e of ext) {
    // nearest sample to the extreme and its neighbours
    let i = 0;
    for (let k = 1; k < pts.length; k++) if (Math.abs(pts[k].t - e.t) < Math.abs(pts[i].t - e.t)) i = k;
    if (i === 0 || i === pts.length - 1) {
      out.push({ t: e.t, h: e.h, type: e.type, basis: "series", waqfaStart: null, waqfaEnd: null, uncertaintyMin: null, flat: false });
      continue;
    }
    const dtH = (pts[i + 1].t - pts[i - 1].t) / 2 / H;
    const a = Math.abs((pts[i - 1].h - 2 * pts[i].h + pts[i + 1].h) / (dtH * dtH)); // m/h²
    let halfMin = a > 0 ? (WAQFA_RATE_M_PER_H / a) * 60 : Infinity;
    const flat = halfMin > WAQFA_MAX_HALF_MIN;
    halfMin = Math.min(halfMin, WAQFA_MAX_HALF_MIN);
    out.push({
      t: e.t,
      h: Math.round(e.h * 100) / 100,
      type: e.type,
      basis: "series",
      waqfaStart: e.t - halfMin * 60_000,
      waqfaEnd: e.t + halfMin * 60_000,
      uncertaintyMin: step <= 30 * 60_000 ? 15 : 30,
      flat,
    });
  }
  return out;
}

/** Turning points from event times only (manual / official tables). */
export function turningPointsFromEvents(events: { t: number; h: number | null; type: "high" | "low" }[]): TurnEvent[] {
  return events
    .slice()
    .sort((a, b) => a.t - b.t)
    .map((e) => ({ ...e, basis: "events" as const, waqfaStart: null, waqfaEnd: null, uncertaintyMin: null, flat: false }));
}

export type Direction = "rising" | "falling" | "waqfa";

export interface TideState {
  direction: Direction | null;
  /** the turning point whose waqfa we are in, or the next one */
  turn: TurnEvent | null;
  next: TurnEvent | null;
  nextHigh: TurnEvent | null;
  nextLow: TurnEvent | null;
  prev: TurnEvent | null;
  level: number | null;
  rateCmPerH: number | null;
}

/** Direction at time t: inside a waqfa window → waqfa; otherwise by the bracketing turning points. */
export function tideState(pts: Pt[], turns: TurnEvent[], t: number): TideState {
  const next = turns.find((x) => x.t > t) ?? null;
  const prev = [...turns].reverse().find((x) => x.t <= t) ?? null;
  const inWaqfa = turns.find((x) => x.waqfaStart != null && x.waqfaEnd != null && t >= x.waqfaStart && t <= x.waqfaEnd) ?? null;
  const level = pts.length ? heightAt(pts, t) : null;
  const h1 = pts.length ? heightAt(pts, t - 15 * 60_000) : null;
  const h2 = pts.length ? heightAt(pts, t + 15 * 60_000) : null;
  const rate = h1 != null && h2 != null ? ((h2 - h1) / 0.5) * 100 : null;
  let direction: Direction | null = null;
  if (inWaqfa) direction = "waqfa";
  else if (next) direction = next.type === "high" ? "rising" : "falling";
  else if (prev) direction = prev.type === "high" ? "falling" : "rising";
  // Without a reliable series, a direction derived only from events far away is still valid
  // (between a low and the next high the tide rises), but needs at least one bracketing event.
  return {
    direction,
    turn: inWaqfa ?? next,
    next,
    nextHigh: turns.find((x) => x.t > t && x.type === "high") ?? null,
    nextLow: turns.find((x) => x.t > t && x.type === "low") ?? null,
    prev,
    level: level == null ? null : Math.round(level * 100) / 100,
    rateCmPerH: rate == null ? null : Math.round(rate),
  };
}

/** Signed minutes from t to the nearest turning point (negative = before it). */
export function minutesToNearestTurn(turns: TurnEvent[], t: number): { minutes: number; turn: TurnEvent } | null {
  let best: TurnEvent | null = null;
  for (const x of turns) if (!best || Math.abs(x.t - t) < Math.abs(best.t - t)) best = x;
  if (!best) return null;
  return { minutes: Math.round((t - best.t) / 60_000), turn: best };
}

function median(xs: number[]): number {
  if (!xs.length) return H;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Dense, smooth samples for drawing (monotone cubic Hermite — no overshoot). */
export function smoothSeries(pts: Pt[], stepMin = 10): Pt[] {
  if (pts.length < 3) return pts;
  const n = pts.length;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1].h - pts[i].h) / (pts[i + 1].t - pts[i].t));
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      m[i] = tau * a * d[i];
      m[i + 1] = tau * b * d[i];
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const hseg = p1.t - p0.t;
    if (hseg > 90 * 60_000) continue; // don't bridge gaps
    for (let t = p0.t; t < p1.t; t += stepMin * 60_000) {
      const s = (t - p0.t) / hseg;
      const h00 = 2 * s ** 3 - 3 * s ** 2 + 1;
      const h10 = s ** 3 - 2 * s ** 2 + s;
      const h01 = -2 * s ** 3 + 3 * s ** 2;
      const h11 = s ** 3 - s ** 2;
      out.push({ t, h: h00 * p0.h + h10 * hseg * m[i] + h01 * p1.h + h11 * hseg * m[i + 1] });
    }
  }
  out.push(pts[n - 1]);
  return out;
}

export type TideNow =
  | { kind: "at_high" | "at_low"; turn: TurnEvent; minutes: number; next: TurnEvent | null }
  | { kind: "rising" | "falling"; turn: null; minutes: number; next: TurnEvent };

/**
 * What the beginner sees: within `atPeakMin` minutes of a high/low turn it is
 * "الحين مد عالي / جزر" (minutes is signed: negative = before the turn); otherwise
 * the water is taking (rising) or giving (falling) and `minutes` is the time left
 * to the next turn. All inputs are epoch ms, so the Kuwait/UTC offset never matters.
 */
export function tideNow(turns: TurnEvent[], at: number, atPeakMin = AT_PEAK_MIN): TideNow | null {
  const sorted = [...turns].sort((a, b) => a.t - b.t);
  const next = sorted.find((x) => x.t > at) ?? null;
  const prev = [...sorted].reverse().find((x) => x.t <= at) ?? null;
  const near = [prev, next].filter((x): x is TurnEvent => !!x).sort((a, b) => Math.abs(a.t - at) - Math.abs(b.t - at))[0];
  if (near && Math.abs(near.t - at) <= atPeakMin * 60_000)
    return { kind: near.type === "high" ? "at_high" : "at_low", turn: near, minutes: Math.round((at - near.t) / 60_000), next: near === next ? sorted[sorted.indexOf(near) + 1] ?? null : next };
  if (!next) return null;
  return { kind: next.type === "high" ? "rising" : "falling", turn: null, minutes: Math.round((next.t - at) / 60_000), next };
}
