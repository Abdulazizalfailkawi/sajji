// What the sea is doing at a moment and place — used on the catch screen to show
// (and later save) the tide movement and pressure without the user typing anything.
// Same data and calibration as the sea screen; returns nulls when it can't be known.

import { pressureAt } from "../pressure";
import type { Water } from "../speciesInsight";
import { getConditions, kuwaitMidnight, turnsOf } from "./client";
import { tideState } from "./waqfa";

const H = 3_600_000;

export interface NowEnv {
  water: Water | null;
  pressure: number | null;
}

export async function envAt(lat: number, lng: number, atMs: number): Promise<NowEnv> {
  const from = Math.min(atMs - 14 * H, kuwaitMidnight(atMs) - 6 * H);
  const r = await getConditions(lat, lng, new Date(from), new Date(atMs + 30 * H));
  if (!r.data) return { water: null, pressure: null };
  const { pts, turns } = turnsOf(r.data);
  const st = pts.length ? tideState(pts, turns, atMs) : null;
  const water: Water | null = st?.direction === "rising" ? "saji" : st?.direction === "falling" ? "thabr" : st?.direction === "waqfa" ? "waqfa" : null;
  const p = pressureAt(r.data.weather.hours, atMs);
  return { water, pressure: p?.hpa ?? null };
}
