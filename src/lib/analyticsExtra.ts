// Additional analytics. Definitions (shown in the UI next to each table):
//
// Target performance, per species S:
//   eligible trips = completed trips with S among their target species
//   success        = eligible trip on which ≥1 S was caught
//   zero-catch     = eligible trip with no catch of any species
//   A trip with several targets is evaluated independently for each target.
//
// Depth: only catches with a recorded ACTUAL depth; missing depths are counted,
//   never treated as 0.
// Lures: catches per lure/jig as recorded on the catch (or the trip plan).
//   "trips used" counts completed trips whose plan recorded that lure; without
//   usage records a higher catch count does not mean a better lure.
// Tide: phase at catch time from the catch's own snapshot (or manual entry).

import { catchEnv, tripEnv } from "./marine/env";
import { normalizeName } from "./normalize";
import { MIN_SAMPLE, type Index, type TripRow } from "./stats";
import { targetsOf } from "./trips";
import type { Catch, Dataset } from "./types";
import { toUnit, type DepthUnit } from "./depth";

export interface TargetPerf {
  speciesId: string;
  trips: number;
  successful: number;
  zeroCatch: number;
  targetCatches: number;
  rate: number | null;
  perTrip: number | null;
  sufficient: boolean;
}

export function targetPerformance(ds: Dataset, rows: TripRow[]): TargetPerf[] {
  const m = new Map<string, TargetPerf>();
  for (const r of rows) {
    for (const s of targetsOf(ds, r.trip)) {
      const p = m.get(s) ?? { speciesId: s, trips: 0, successful: 0, zeroCatch: 0, targetCatches: 0, rate: null, perTrip: null, sufficient: false };
      const n = r.allCatches.filter((c) => c.species_id === s).length;
      p.trips++;
      if (n > 0) p.successful++;
      if (r.allCatches.length === 0) p.zeroCatch++;
      p.targetCatches += n;
      m.set(s, p);
    }
  }
  return [...m.values()]
    .map((p) => ({ ...p, rate: p.trips ? p.successful / p.trips : null, perTrip: p.trips ? p.targetCatches / p.trips : null, sufficient: p.trips >= MIN_SAMPLE }))
    .sort((a, b) => b.trips - a.trips);
}

export interface DepthBin {
  label: string;
  from: number;
  count: number;
  bySpecies: Record<string, number>;
}

export function depthBins(catches: Catch[], size = 5, unit: DepthUnit = "m"): { bins: DepthBin[]; known: number; missing: number } {
  const known = catches.filter((c) => c.depth_m != null);
  const map = new Map<number, DepthBin>();
  for (const c of known) {
    const from = Math.floor((toUnit(c.depth_m, unit) ?? 0) / size) * size;
    const b = map.get(from) ?? { label: `${from}–${from + size}`, from, count: 0, bySpecies: {} };
    b.count++;
    const k = c.species_id ?? "none";
    b.bySpecies[k] = (b.bySpecies[k] ?? 0) + 1;
    map.set(from, b);
  }
  return { bins: [...map.values()].sort((a, b) => a.from - b.from), known: known.length, missing: catches.length - known.length };
}

/** Planned target depth vs actual catch depth (only when both are recorded). */
export function targetVsActual(catches: Catch[], idx: Index, tolM = 1): { n: number; avgDiff: number | null; within: number } {
  const pairs = catches
    .map((c) => {
      const t = c.trip_id ? idx.tripById.get(c.trip_id) : undefined;
      if (!t || t.target_depth_m == null || c.depth_m == null) return null;
      const lo = t.target_depth_m;
      const hi = t.target_depth_max_m ?? t.target_depth_m;
      return { diff: c.depth_m - (lo + hi) / 2, within: c.depth_m >= lo - tolM && c.depth_m <= hi + tolM };
    })
    .filter((x): x is { diff: number; within: boolean } => !!x);
  return {
    n: pairs.length,
    avgDiff: pairs.length ? pairs.reduce((s, p) => s + p.diff, 0) / pairs.length : null,
    within: pairs.filter((p) => p.within).length,
  };
}

export interface LurePerf {
  key: string;
  label: string;
  catches: number;
  species: Record<string, number>;
  tripsUsed: number; // completed trips whose plan recorded this lure
  tripsSuccessful: number;
}

const lureName = (s: string | null | undefined) => (s ?? "").trim();

export function lurePerformance(idx: Index, catches: Catch[], rows: TripRow[]): { lures: LurePerf[]; missing: number } {
  const m = new Map<string, LurePerf>();
  let missing = 0;
  for (const c of catches) {
    const trip = c.trip_id ? idx.tripById.get(c.trip_id) : undefined;
    const name = lureName(c.lure_bait) || lureName(trip?.lure_type);
    if (!name) {
      missing++;
      continue;
    }
    const w = c.lure_weight_g ?? (lureName(c.lure_bait) ? null : trip?.lure_weight_g) ?? null;
    const col = lureName(c.lure_color) || (lureName(c.lure_bait) ? "" : lureName(trip?.lure_color));
    const label = [name, w ? `${w}g` : null, col || null].filter(Boolean).join(" · ");
    const key = normalizeName(label);
    const p = m.get(key) ?? { key, label, catches: 0, species: {}, tripsUsed: 0, tripsSuccessful: 0 };
    p.catches++;
    const sk = c.species_id ?? "none";
    p.species[sk] = (p.species[sk] ?? 0) + 1;
    m.set(key, p);
  }
  // usage: trips that planned a lure with the same base name
  for (const p of m.values()) {
    const base = normalizeName(p.label.split(" · ")[0]);
    const used = rows.filter((r) => normalizeName(lureName(r.trip.lure_type)) === base);
    p.tripsUsed = used.length;
    p.tripsSuccessful = used.filter((r) => r.allCatches.length > 0).length;
  }

  return { lures: [...m.values()].sort((a, b) => b.catches - a.catches), missing };
}

export type CatchPhase = "rising" | "falling" | "waqfa";

export function catchTidePhases(ds: Dataset, catches: Catch[]): { counts: Record<CatchPhase, number>; missing: number; manual: number } {
  const counts: Record<CatchPhase, number> = { rising: 0, falling: 0, waqfa: 0 };
  let missing = 0;
  let manual = 0;
  for (const c of catches) {
    const e = catchEnv(ds, c);
    const v = e.tidePhase?.value;
    if (!v) {
      missing++;
      continue;
    }
    if (e.tidePhase!.kind === "entered" || e.tidePhase!.kind === "manual") manual++;
    counts[v === "rising" ? "rising" : v === "falling" ? "falling" : "waqfa"]++;
  }
  return { counts, missing, manual };
}

export const TURN_BINS = ["−3h+", "−3…−1h", "−1…0h", "0…+1h", "+1…+3h", "+3h+"] as const;
function turnBin(min: number): (typeof TURN_BINS)[number] {
  if (min < -180) return "−3h+";
  if (min < -60) return "−3…−1h";
  if (min < 0) return "−1…0h";
  if (min <= 60) return "0…+1h";
  if (min <= 180) return "+1…+3h";
  return "+3h+";
}

/** Catches by time relative to the nearest high or low tide (from the catch's own snapshot). */
export function catchesByTurn(ds: Dataset, catches: Catch[]): { high: Record<string, number>; low: Record<string, number>; missing: number } {
  const high: Record<string, number> = {};
  const low: Record<string, number> = {};
  let missing = 0;
  for (const c of catches) {
    const row = catchEnv(ds, c).snapshots.find((r) => r.category === "tide" && r.kind !== "unavailable");
    const mins = row?.data?.minutes_from_turn;
    const type = row?.data?.nearest_turn_type;
    if (typeof mins !== "number" || (type !== "high" && type !== "low")) {
      missing++;
      continue;
    }
    const b = turnBin(mins);
    const target = type === "high" ? high : low;
    target[b] = (target[b] ?? 0) + 1;
  }
  return { high, low, missing };
}

/** Phase at trip start (manual observation, else the trip's own snapshot) — for trip success rates. */
export function tripStartPhase(ds: Dataset, r: TripRow): CatchPhase | null {
  const v = tripEnv(ds, r.trip).tidePhase?.value;
  if (!v) return null;
  return v === "rising" ? "rising" : v === "falling" ? "falling" : "waqfa";
}

/** Catch counts by species and spot (top species × spots). */
export function speciesBySpot(catches: Catch[], idx: Index): { spots: string[]; species: string[]; cell: (sp: string, loc: string) => number } {
  const m = new Map<string, number>();
  const spotCount = new Map<string, number>();
  const spCount = new Map<string, number>();
  for (const c of catches) {
    if (!c.species_id) continue;
    const loc = c.location_id ?? (c.trip_id ? idx.tripById.get(c.trip_id)?.location_id : null);
    if (!loc) continue;
    m.set(`${c.species_id}|${loc}`, (m.get(`${c.species_id}|${loc}`) ?? 0) + 1);
    spotCount.set(loc, (spotCount.get(loc) ?? 0) + 1);
    spCount.set(c.species_id, (spCount.get(c.species_id) ?? 0) + 1);
  }
  const top = (mm: Map<string, number>, n: number) => [...mm.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map((x) => x[0]);
  return { spots: top(spotCount, 4), species: top(spCount, 6), cell: (sp, loc) => m.get(`${sp}|${loc}`) ?? 0 };
}

// ---- barometric pressure -------------------------------------------------------

export type PressureTrendGroup = "falling" | "steady" | "rising";
export const PRESSURE_BANDS = ["<1010", "1010–1015", "1015–1020", ">1020"] as const;
export type PressureBandKey = (typeof PRESSURE_BANDS)[number];

export function pressureBand(hpa: number): PressureBandKey {
  if (hpa < 1010) return "<1010";
  if (hpa < 1015) return "1010–1015";
  if (hpa <= 1020) return "1015–1020";
  return ">1020";
}

export function trendGroup(change3h: number): PressureTrendGroup {
  return change3h <= -1 ? "falling" : change3h >= 1 ? "rising" : "steady";
}

/** How the user's catches are spread over the pressure level and its trend at catch time. */
export function catchPressure(ds: Dataset, catches: Catch[]): { trend: Record<PressureTrendGroup, number>; bands: Record<PressureBandKey, number>; withLevel: number; withTrend: number; missing: number } {
  const trend: Record<PressureTrendGroup, number> = { falling: 0, steady: 0, rising: 0 };
  const bands: Record<PressureBandKey, number> = { "<1010": 0, "1010–1015": 0, "1015–1020": 0, ">1020": 0 };
  let withLevel = 0;
  let withTrend = 0;
  let missing = 0;
  for (const c of catches) {
    const e = catchEnv(ds, c);
    if (!e.pressure) {
      missing++;
      continue;
    }
    withLevel++;
    bands[pressureBand(e.pressure.value)]++;
    if (e.pressureChange) {
      withTrend++;
      trend[trendGroup(e.pressureChange.value)]++;
    }
  }
  return { trend, bands, withLevel, withTrend, missing };
}

/** Pressure trend at the start of a trip (for success-rate groups). */
export function tripStartPressureTrend(ds: Dataset, r: TripRow): PressureTrendGroup | null {
  const e = tripEnv(ds, r.trip);
  return e.pressureChange ? trendGroup(e.pressureChange.value) : null;
}
