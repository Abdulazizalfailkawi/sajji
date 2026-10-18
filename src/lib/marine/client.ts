// Client-side access to /api/conditions with a small cache so the same
// location/time window isn't requested repeatedly, plus helpers that turn a
// response into environmental snapshot rows.

import { WIND_FACTOR, calibrationFor, windSeaHeightM } from "../../config/marine";
import { moonAt, sunTimes } from "../astro";
import { uuid } from "../ids";
import type { EnvPurpose, EnvironmentObservation } from "../types";
import { cleanSeries, heightAt, type Pt } from "./tide";
import { minutesToNearestTurn, tideState, turningPoints, type TurnEvent } from "./waqfa";
import type { Conditions, MarineHour, WeatherHour } from "./types";

const TTL_FORECAST = 30 * 60_000; // refresh forecasts after 30 min
const mem = new Map<string, { at: number; data: Conditions }>();

function cacheKey(lat: number, lng: number, from: number, to: number) {
  const h = 3_600_000;
  return `ft.cond:${lat.toFixed(2)},${lng.toFixed(2)}:${Math.floor(from / h)}-${Math.ceil(to / h)}`;
}

/**
 * Wind x WIND_FACTOR (model runs low vs airport observations) and waves = the
 * higher of the model and a fetch-limited wind-sea estimate. Applied on a copy,
 * to raw (cached) data, so it is never applied twice.
 */
export function calibrateConditions(c: Conditions): Conditions {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const wind = (v: number | null) => (v == null ? null : r1(v * WIND_FACTOR));
  const hours = c.weather.hours.map((h) => {
    const w = wind(h.wind);
    return { ...h, wind: w, gust: h.gust == null ? null : Math.max(h.gust, w ?? 0) };
  });
  const windAt = new Map(hours.map((h) => [Date.parse(h.t), h.wind]));
  const marineHours = c.marine.hours.map((h) => {
    const est = windSeaHeightM(windAt.get(Date.parse(h.t)) ?? null);
    return est != null && (h.wave_h == null || est > h.wave_h) ? { ...h, wave_h: est } : h;
  });
  const cur = c.current ? { ...c.current, wind: wind(c.current.wind ?? null), gust: c.current.gust == null ? null : Math.max(c.current.gust, wind(c.current.wind ?? null) ?? 0) } : c.current;
  return { ...c, weather: { ...c.weather, hours }, marine: { ...c.marine, hours: marineHours }, current: cur as Conditions["current"] };
}

export interface ConditionsResult {
  data: Conditions | null;
  savedAt: number | null;
  stale: boolean;
  fromCache: boolean;
  error: string | null;
}

export async function getConditions(lat: number, lng: number, from: Date, to: Date, opts: { force?: boolean } = {}): Promise<ConditionsResult> {
  const r = await getConditionsRaw(lat, lng, from, to, opts);
  return r.data ? { ...r, data: calibrateConditions(r.data) } : r;
}

async function getConditionsRaw(lat: number, lng: number, from: Date, to: Date, opts: { force?: boolean } = {}): Promise<ConditionsResult> {
  const key = cacheKey(lat, lng, from.getTime(), to.getTime());
  let cached = mem.get(key) ?? null;
  if (!cached) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) cached = JSON.parse(raw);
    } catch {}
  }
  const fresh = cached && Date.now() - cached.at < TTL_FORECAST;
  if (cached && fresh && !opts.force) return { data: cached.data, savedAt: cached.at, stale: false, fromCache: true, error: null };
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return { data: cached?.data ?? null, savedAt: cached?.at ?? null, stale: !!cached, fromCache: !!cached, error: "OFFLINE" };
  try {
    const q = new URLSearchParams({ lat: String(lat), lng: String(lng), from: from.toISOString(), to: to.toISOString() });
    const r = await fetch(`/api/conditions?${q}`, { signal: AbortSignal.timeout(20_000) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? `HTTP_${r.status}`);
    const entry = { at: Date.now(), data: j as Conditions };
    mem.set(key, entry);
    try {
      localStorage.setItem(key, JSON.stringify(entry));
      pruneCache();
    } catch {}
    return { data: entry.data, savedAt: entry.at, stale: false, fromCache: false, error: null };
  } catch (e) {
    return { data: cached?.data ?? null, savedAt: cached?.at ?? null, stale: !!cached, fromCache: !!cached, error: (e as Error).message };
  }
}

function pruneCache() {
  const keys: { k: string; at: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (k.startsWith("ft.cond:")) {
      try {
        keys.push({ k, at: JSON.parse(localStorage.getItem(k)!).at });
      } catch {
        localStorage.removeItem(k);
      }
    }
  }
  keys.sort((a, b) => b.at - a.at).slice(30).forEach((x) => localStorage.removeItem(x.k));
}

/** Nearest hourly record within 90 minutes of `at`, else null. */
export function hourAt<T extends { t: string }>(hours: T[], at: number): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const h of hours) {
    const d = Math.abs(Date.parse(h.t) - at);
    if (d < bd) {
      bd = d;
      best = h;
    }
  }
  return bd <= 90 * 60_000 ? best : null;
}

/** Turning points (with estimated waqfa windows) of a conditions response. */
/**
 * The sea-level model runs earlier than the published tide times for Kuwait
 * (about 30–75 min when compared with the Shuwaikh tables and two tide apps).
 * Every model time is therefore moved later by this many minutes. The admin
 * can fine-tune it from the settings sheet (stored on the device).
 */
// The shift is now per place (src/config/marine.ts, measured against the
// bulletin). The admin slider is only an extra adjustment on top (default 0).
export const TIDE_SHIFT_DEFAULT_MIN = 0;

export function tideShiftMin(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem("ft.tideAdjust");
    const v = raw == null ? NaN : Number(raw);
    if (Number.isFinite(v)) return Math.min(180, Math.max(-180, v));
  } catch {}
  return TIDE_SHIFT_DEFAULT_MIN;
}

/** `adjustMin` = manual extra shift on top of the place calibration. */
export function turnsOf(c: Conditions, adjustMin = tideShiftMin()): { pts: Pt[]; turns: TurnEvent[] } {
  if (c.tide.status === "unavailable" || c.tide.status === "error") return { pts: [], turns: [] };
  const cal = calibrationFor(c.request.lat, c.request.lng);
  const shift = (cal.shiftMin + adjustMin) * 60_000;
  const dh = cal.heightOffsetM;
  const pts = cleanSeries(c.tide.series.map((p) => ({ t: p.t, h: p.h }))).map((p) => ({ ...p, t: p.t + shift, h: p.h + dh }));
  const ext = c.tide.extremes.map((e) => ({ t: Date.parse(e.t) + shift, h: e.h + dh, type: e.type }));
  return { pts, turns: turningPoints(pts, ext) };
}

export function tideAt(c: Conditions, at: number) {
  const { pts, turns } = turnsOf(c);
  if (!pts.length) return null;
  const h = heightAt(pts, at);
  if (h == null) return null;
  const st = tideState(pts, turns, at);
  const near = minutesToNearestTurn(turns, at);
  const iso = (x: { t: number } | null) => (x ? new Date(x.t).toISOString() : null);
  const phase = st.direction === "waqfa" ? (st.turn?.type === "high" ? "high_slack" : "low_slack") : st.direction;
  return {
    height: Math.round(h * 100) / 100,
    phase,
    in_waqfa: st.direction === "waqfa",
    rate_cm_h: st.rateCmPerH,
    next_high_at: iso(st.nextHigh),
    next_high_m: st.nextHigh?.h ?? null,
    next_low_at: iso(st.nextLow),
    next_low_m: st.nextLow?.h ?? null,
    prev_high_at: iso([...turns].reverse().find((x) => x.t <= at && x.type === "high") ?? null),
    prev_low_at: iso([...turns].reverse().find((x) => x.t <= at && x.type === "low") ?? null),
    nearest_turn_type: near?.turn.type ?? null,
    minutes_from_turn: near?.minutes ?? null,
  };
}

type Row = Omit<EnvironmentObservation, "created_at" | "updated_at">;

/**
 * Turn a conditions response into snapshot rows for one instant. Each
 * category is stored separately with its own source, data type and the
 * provider's valid time; nothing is filled in when the provider has no value.
 */
export function snapshotRows(
  c: Conditions | null,
  at: Date,
  ctx: { tripId: string | null; catchId: string | null; purpose: EnvPurpose; lat: number | null; lng: number | null; error?: string | null },
): Row[] {
  const snapshot_id = uuid();
  const fetched_at = c?.fetched_at ?? new Date().toISOString();
  const base = { trip_id: ctx.tripId, catch_id: ctx.catchId, snapshot_id, purpose: ctx.purpose, fetched_at, lat: ctx.lat, lng: ctx.lng };
  const rows: Row[] = [];
  const t = at.getTime();

  // Astronomy is always computable (moon phase doesn't depend on location).
  const m = moonAt(at);
  const sun = ctx.lat != null && ctx.lng != null ? sunTimes(at, ctx.lat, ctx.lng) : null;
  rows.push({
    ...base,
    id: uuid(),
    category: "astronomy",
    kind: "calculated",
    source: "SunCalc",
    method: "SunCalc astronomical algorithms (moon illumination & phase angle; sun times for the coordinates)",
    valid_at: at.toISOString(),
    data: {
      moon_phase: m.phase,
      moon_illumination: Math.round(m.illumination * 100),
      sunrise: sun?.sunrise?.toISOString() ?? null,
      sunset: sun?.sunset?.toISOString() ?? null,
    },
  });

  if (!c) {
    rows.push({
      ...base,
      id: uuid(),
      category: "status",
      kind: "unavailable",
      source: "—",
      method: null,
      valid_at: at.toISOString(),
      data: { reason: ctx.error ?? (ctx.lat == null ? "NO_COORDINATES" : "UNAVAILABLE") },
    });
    return rows;
  }

  const w: WeatherHour | null = hourAt(c.weather.hours, t);
  if (w && (w.wind != null || w.temp != null)) {
    rows.push({
      ...base,
      id: uuid(),
      category: "weather",
      kind: w.k,
      source: c.weather.source,
      method: `hourly value nearest to the requested time; grid ${c.weather.grid?.lat ?? "?"},${c.weather.grid?.lng ?? "?"}; wind x${WIND_FACTOR} (calibrated against Kuwait airport METAR)`,
      valid_at: w.t,
      data: {
        air_temp_c: w.temp,
        feels_c: w.feels,
        wind_speed_kmh: w.wind,
        wind_dir_deg: w.dir,
        wind_gust_kmh: w.gust,
        humidity_pct: w.rh,
        cloud_pct: w.cloud,
        precip_prob_pct: w.pprob,
        weather_code: w.code,
      },
    });
  } else
    rows.push({ ...base, id: uuid(), category: "weather", kind: "unavailable", source: c.weather.source, method: null, valid_at: at.toISOString(), data: { reason: c.weather.error ?? "NO_VALUE_FOR_TIME" } });

  const mh: MarineHour | null = hourAt(c.marine.hours, t);
  const hasMarine = mh && [mh.wave_h, mh.sst, mh.swell_h, mh.cur_v].some((v) => v != null);
  if (mh && hasMarine) {
    rows.push({
      ...base,
      id: uuid(),
      category: "marine",
      kind: mh.k,
      source: c.marine.source,
      method: `hourly value nearest to the requested time; sea grid cell ${c.marine.grid?.lat ?? "?"},${c.marine.grid?.lng ?? "?"}; wave height = max(model, fetch-limited wind-sea estimate)`,
      valid_at: mh.t,
      data: {
        wave_height_m: mh.wave_h,
        wave_dir_deg: mh.wave_dir,
        wave_period_s: mh.wave_p,
        wind_wave_height_m: mh.wind_wave_h,
        swell_height_m: mh.swell_h,
        swell_dir_deg: mh.swell_dir,
        swell_period_s: mh.swell_p,
        sea_temp_c: mh.sst,
        current_kmh: mh.cur_v,
        current_dir_deg: mh.cur_dir,
      },
    });
  } else
    rows.push({ ...base, id: uuid(), category: "marine", kind: "unavailable", source: c.marine.source, method: null, valid_at: at.toISOString(), data: { reason: c.marine.error ?? "NO_VALUE_FOR_TIME" } });

  const td = tideAt(c, t);
  if (td) {
    rows.push({
      ...base,
      id: uuid(),
      category: "tide",
      kind: c.tide.kind,
      source: c.tide.source,
      method: c.tide.method,
      valid_at: at.toISOString(),
      data: { ...td, datum: c.tide.datum, station: c.tide.station, official: false },
    });
  } else
    rows.push({ ...base, id: uuid(), category: "tide", kind: "unavailable", source: c.tide.source, method: null, valid_at: at.toISOString(), data: { reason: c.tide.error ?? "NO_TIDE_DATA" } });

  return rows;
}

/** Signals that may indicate hazardous conditions. Not a safety model. */
export function hazards(c: Conditions, from: number, to: number): { key: string; ar: string; en: string }[] {
  const out: { key: string; ar: string; en: string }[] = [];
  const wx = c.weather.hours.filter((h) => Date.parse(h.t) >= from && Date.parse(h.t) <= to);
  const sea = c.marine.hours.filter((h) => Date.parse(h.t) >= from && Date.parse(h.t) <= to);
  const maxGust = Math.max(-1, ...wx.map((h) => h.gust ?? -1));
  const maxWind = Math.max(-1, ...wx.map((h) => h.wind ?? -1));
  const maxWave = Math.max(-1, ...sea.map((h) => h.wave_h ?? -1));
  const storm = wx.some((h) => h.code != null && h.code >= 95);
  if (maxWind >= 37 || maxGust >= 50)
    out.push({
      key: "wind",
      ar: `رياح قوية متوقعة (حتى ${Math.round(maxWind)} كم/س، هبات ${Math.round(maxGust)} كم/س)`,
      en: `Strong wind forecast (up to ${Math.round(maxWind)} km/h, gusts ${Math.round(maxGust)} km/h)`,
    });
  if (maxWave >= 1.5) out.push({ key: "waves", ar: `أمواج مرتفعة متوقعة (حتى ${maxWave.toFixed(1)} م)`, en: `High waves forecast (up to ${maxWave.toFixed(1)} m)` });
  if (storm) out.push({ key: "storm", ar: "احتمال عواصف رعدية", en: "Thunderstorms possible" });
  return out;
}

/** 00:00 Asia/Kuwait (UTC+3, no DST) of the day containing `ms`. */
export function kuwaitMidnight(ms: number): number {
  const D = 86_400_000;
  return Math.floor((ms + 3 * 3_600_000) / D) * D - 3 * 3_600_000;
}
