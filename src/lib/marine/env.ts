// Resolve the environmental values that apply to a catch or trip, with
// provenance. Priority: manual entry > snapshot taken for that exact time.
// Never falls back to "current" conditions for a past record.

import { effectiveMoonPhase, moonAt } from "../astro";
import type { Catch, Dataset, EnvKind, EnvironmentObservation, MoonPhase, Tide, Trip } from "../types";

export interface Prov<T> {
  value: T;
  kind: EnvKind | "entered";
  source: string;
  at: string | null; // valid time
  fetched_at?: string | null;
}

export interface ResolvedEnv {
  moon: Prov<MoonPhase> | null;
  moonIllum: Prov<number> | null;
  tidePhase: Prov<Tide> | null;
  tideHeight: Prov<number> | null;
  nextHigh: Prov<string> | null;
  nextLow: Prov<string> | null;
  wind: Prov<number> | null; // km/h
  windDir: Prov<number> | null;
  gust: Prov<number> | null;
  wave: Prov<number> | null;
  wavePeriod: Prov<number> | null;
  seaTemp: Prov<number> | null;
  airTemp: Prov<number> | null;
  pressure: Prov<number> | null; // hPa (mean sea level, model)
  pressureChange: Prov<number> | null; // hPa over the previous 3 hours
  sunrise: Prov<string> | null;
  sunset: Prov<string> | null;
  snapshots: EnvironmentObservation[]; // rows used (for provenance display)
  unavailable: string[]; // categories attempted but unavailable
}

const WINDOW = 90 * 60_000;

/** Rows for a catch whose valid time matches the catch time (newest snapshot wins). */
export function catchRows(ds: Dataset, c: Catch): EnvironmentObservation[] {
  const t = Date.parse(c.caught_at);
  return ds.environment_observations
    .filter((e) => e.catch_id === c.id && (e.kind === "manual" || Math.abs(Date.parse(e.valid_at) - t) <= WINDOW))
    .sort((a, b) => Number(b.kind === "manual") - Number(a.kind === "manual") || b.fetched_at.localeCompare(a.fetched_at));
}

/** Rows for a trip (no catch): trip-start snapshot preferred over planning forecast. */
export function tripRows(ds: Dataset, trip: Trip): EnvironmentObservation[] {
  const t = Date.parse(trip.started_at);
  const rank = (e: EnvironmentObservation) => (e.kind === "manual" ? 0 : e.purpose === "trip_start" ? 1 : e.purpose === "planned" ? 2 : 3);
  return ds.environment_observations
    .filter((e) => e.trip_id === trip.id && !e.catch_id && (e.kind === "manual" || Math.abs(Date.parse(e.valid_at) - t) <= 3 * 3_600_000))
    .sort((a, b) => rank(a) - rank(b) || b.fetched_at.localeCompare(a.fetched_at));
}

function first<T>(rows: EnvironmentObservation[], cat: string, key: string, test: (v: unknown) => v is T): Prov<T> | null {
  for (const r of rows) {
    if ((r.category ?? guessCategory(r)) !== cat && r.kind !== "manual") continue;
    if (r.kind === "unavailable") continue;
    const v = r.data?.[key];
    if (test(v)) return { value: v, kind: r.kind, source: r.source, at: r.valid_at, fetched_at: r.fetched_at };
  }
  return null;
}

/** Legacy rows (before categories existed). */
function guessCategory(r: EnvironmentObservation): string {
  if ("wave_height_m" in (r.data ?? {}) || "sea_temp_c" in (r.data ?? {})) return "marine";
  if ("moon_phase" in (r.data ?? {})) return "astronomy";
  return "weather";
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isTide = (v: unknown): v is Tide => v === "high" || v === "low" || v === "rising" || v === "falling";

function phaseToTide(v: unknown): Tide | null {
  if (v === "high_slack") return "high";
  if (v === "low_slack") return "low";
  if (v === "rising" || v === "falling") return v;
  return null;
}

function resolve(rows: EnvironmentObservation[], manual: { tide: Tide | null; moon: MoonPhase | null; wind?: number | null; at: string }): ResolvedEnv {
  const tideRow = rows.find((r) => r.category === "tide" && r.kind !== "unavailable");
  const tidePhaseFromRow = tideRow ? phaseToTide(tideRow.data?.phase) : null;
  const manualTide = rows.find((r) => r.kind === "manual" && isTide(r.data?.observed_tide));
  const calcMoon = moonAt(manual.at);
  return {
    moon: manual.moon
      ? { value: manual.moon, kind: "entered", source: "manual", at: manual.at }
      : { value: calcMoon.phase, kind: "calculated", source: "SunCalc", at: manual.at },
    moonIllum: { value: Math.round(calcMoon.illumination * 100), kind: "calculated", source: "SunCalc", at: manual.at },
    tidePhase: manual.tide
      ? { value: manual.tide, kind: "entered", source: "manual", at: manual.at }
      : manualTide
        ? { value: manualTide.data.observed_tide as Tide, kind: "manual", source: manualTide.source, at: manualTide.valid_at }
        : tideRow && tidePhaseFromRow
          ? { value: tidePhaseFromRow, kind: tideRow.kind, source: tideRow.source, at: tideRow.valid_at, fetched_at: tideRow.fetched_at }
          : null,
    tideHeight: first(rows, "tide", "height", isNum),
    nextHigh: first(rows, "tide", "next_high_at", isStr),
    nextLow: first(rows, "tide", "next_low_at", isStr),
    wind: manual.wind != null ? { value: manual.wind, kind: "entered", source: "manual", at: manual.at } : first(rows, "weather", "wind_speed_kmh", isNum),
    windDir: first(rows, "weather", "wind_dir_deg", isNum),
    gust: first(rows, "weather", "wind_gust_kmh", isNum),
    wave: first(rows, "marine", "wave_height_m", isNum),
    wavePeriod: first(rows, "marine", "wave_period_s", isNum),
    seaTemp: first(rows, "marine", "sea_temp_c", isNum),
    airTemp: first(rows, "weather", "air_temp_c", isNum),
    pressure: first(rows, "weather", "pressure_hpa", isNum),
    pressureChange: first(rows, "weather", "pressure_change_3h_hpa", isNum),
    sunrise: first(rows, "astronomy", "sunrise", isStr),
    sunset: first(rows, "astronomy", "sunset", isStr),
    snapshots: rows,
    unavailable: [...new Set(rows.filter((r) => r.kind === "unavailable").map((r) => r.category ?? "status"))],
  };
}

/** Environment for a catch: its own manual values, else its own time-matched snapshot. */
export function catchEnv(ds: Dataset, c: Catch): ResolvedEnv {
  return resolve(catchRows(ds, c), { tide: c.tide ?? null, moon: c.moon_phase ?? null, at: c.caught_at });
}

export function tripEnv(ds: Dataset, trip: Trip): ResolvedEnv {
  const rows = tripRows(ds, trip);
  const m = effectiveMoonPhase(trip);
  return resolve(rows, { tide: trip.tide, moon: m.calculated ? null : m.phase, wind: trip.wind_speed_kmh, at: trip.started_at });
}

export function hasSnapshotFor(ds: Dataset, c: Catch): boolean {
  return catchRows(ds, c).some((r) => r.kind !== "manual");
}
