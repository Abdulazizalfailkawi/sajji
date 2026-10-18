import { MIN_TIDE_RANGE_M } from "../../config/marine";
// Tide derivation from a sea-level time series.
//
// High / low tides are found as local extrema of the series (refined with a
// parabola through the three surrounding points), then filtered so that
// highs and lows alternate and tiny wiggles (< minRange metres) are ignored.
// Rising / falling is derived from those extrema (or, if none bracket the
// time, from the slope of the series) — never guessed.

export interface Pt {
  t: number; // epoch ms
  h: number; // metres
}
export interface Extreme {
  t: number;
  h: number;
  type: "high" | "low";
}
export type TidePhase = "rising" | "falling" | "high_slack" | "low_slack";

const MAX_GAP = 90 * 60_000; // points further apart than this are not joined

export function cleanSeries(raw: { t: string | number; h: number | null | undefined }[]): Pt[] {
  return raw
    .filter((p) => typeof p.h === "number" && Number.isFinite(p.h))
    .map((p) => ({ t: typeof p.t === "number" ? p.t : Date.parse(p.t.endsWith("Z") || /[+-]\d\d:\d\d$/.test(p.t) ? p.t : p.t + "Z"), h: p.h as number }))
    .filter((p) => Number.isFinite(p.t))
    .sort((a, b) => a.t - b.t);
}

export function findExtrema(pts: Pt[], minRange = MIN_TIDE_RANGE_M): Extreme[] {
  const raw: Extreme[] = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const c = pts[i + 1];
    if (b.t - a.t > MAX_GAP || c.t - b.t > MAX_GAP) continue;
    const isHigh = b.h >= a.h && b.h > c.h;
    const isLow = b.h <= a.h && b.h < c.h;
    if (!isHigh && !isLow) continue;
    // Parabolic refinement (assumes roughly even spacing).
    const denom = a.h - 2 * b.h + c.h;
    const dt = (c.t - a.t) / 2;
    let off = denom !== 0 ? (0.5 * (a.h - c.h)) / denom : 0;
    off = Math.max(-0.5, Math.min(0.5, off));
    raw.push({ t: Math.round(b.t + off * dt), h: b.h - 0.25 * (a.h - c.h) * off, type: isHigh ? "high" : "low" });
  }
  // Enforce alternation: of two consecutive same-type extremes keep the more extreme.
  const alt: Extreme[] = [];
  for (const e of raw) {
    const last = alt[alt.length - 1];
    if (last && last.type === e.type) {
      if ((e.type === "high" && e.h > last.h) || (e.type === "low" && e.h < last.h)) alt[alt.length - 1] = e;
    } else alt.push(e);
  }
  // Remove insignificant high/low pairs.
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < alt.length - 1; i++) {
      if (Math.abs(alt[i].h - alt[i + 1].h) < minRange) {
        alt.splice(i, 2);
        // re-merge neighbours that may now be same-type
        for (let j = Math.max(0, i - 1); j < alt.length - 1; j++) {
          if (alt[j].type === alt[j + 1].type) {
            const keep = alt[j].type === "high" ? (alt[j].h >= alt[j + 1].h ? alt[j] : alt[j + 1]) : alt[j].h <= alt[j + 1].h ? alt[j] : alt[j + 1];
            alt.splice(j, 2, keep);
            j--;
          }
        }
        changed = true;
        break;
      }
    }
  }
  return alt;
}

/** Linear interpolation; null outside the series or across a data gap. */
export function heightAt(pts: Pt[], t: number): number | null {
  if (!pts.length || t < pts[0].t || t > pts[pts.length - 1].t) return null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    if (t >= a.t && t <= b.t) {
      if (b.t - a.t > MAX_GAP) return null;
      return b.t === a.t ? a.h : a.h + ((b.h - a.h) * (t - a.t)) / (b.t - a.t);
    }
  }
  return null;
}

const SLACK_MS = 20 * 60_000;

export function phaseAt(pts: Pt[], ext: Extreme[], t: number): TidePhase | null {
  if (heightAt(pts, t) == null) return null;
  const near = ext.find((e) => Math.abs(e.t - t) <= SLACK_MS);
  if (near) return near.type === "high" ? "high_slack" : "low_slack";
  const prev = [...ext].reverse().find((e) => e.t <= t);
  const next = ext.find((e) => e.t > t);
  if (prev && next) return prev.type === "low" ? "rising" : "falling";
  // Not bracketed by extrema: use the local slope.
  const h1 = heightAt(pts, t - 30 * 60_000) ?? heightAt(pts, t);
  const h2 = heightAt(pts, t + 30 * 60_000) ?? heightAt(pts, t);
  if (h1 == null || h2 == null) return null;
  if (Math.abs(h2 - h1) < 0.01) return null;
  return h2 > h1 ? "rising" : "falling";
}

export function surroundingExtrema(ext: Extreme[], t: number) {
  const after = ext.filter((e) => e.t > t);
  const before = ext.filter((e) => e.t <= t).reverse();
  return {
    nextHigh: after.find((e) => e.type === "high") ?? null,
    nextLow: after.find((e) => e.type === "low") ?? null,
    prevHigh: before.find((e) => e.type === "high") ?? null,
    prevLow: before.find((e) => e.type === "low") ?? null,
  };
}

/** Collapse the phase to the 4 manual tide categories used elsewhere in the app. */
export function phaseToTide(p: TidePhase | null): "high" | "rising" | "falling" | "low" | null {
  if (!p) return null;
  return p === "high_slack" ? "high" : p === "low_slack" ? "low" : p;
}
