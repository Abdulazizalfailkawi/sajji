// Server-side data providers. Only imported by route handlers.
//
// Investigated sources (October 2026):
// * Open-Meteo Weather API — global, free for non-commercial use (CC BY 4.0
//   attribution). Forecast endpoint (~3 months back, 16 days ahead), Historical
//   Forecast API (archived model runs, 2022+), ERA5 archive (reanalysis, 1940+).
// * Open-Meteo Marine API — waves, swell, SST, currents, sea level (MSL) on
//   ~5–9 km grids. Verified non-null around Kuwait Bay, Al-Fintas, Kubbar and
//   Qaruh. Sea level is a MODEL, documented by Open-Meteo as "not suitable for
//   coastal navigation"; it is labelled as such and never as an official tide table.
// * Kuwait Meteorological Center (met.gov.kw/Forecasts/marine.php) publishes
//   official tide tables for Shuwaikh and Shuaiba but offers no API and its
//   terms forbid republishing — it is linked, not scraped. Users can type the
//   official times in as manual entries.
// * WorldTides API v3 — paid (credits), station/atlas tide predictions; used
//   only when WORLDTIDES_API_KEY is set.

import { cleanSeries, findExtrema } from "./tide";
import type { Block, Conditions, CurrentWeather, MarineHour, TideBlock, WeatherHour } from "./types";
import type { EnvKind } from "../types";

const DAY = 86_400_000;
const HIST_FORECAST_START = Date.parse("2022-01-01T00:00:00Z");

export class ProviderError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
  }
}

/** fetch with timeout, one retry on network/5xx/429, and Next.js data caching. */
export async function getJson(url: string, revalidate: number, tries = 2): Promise<Record<string, unknown>> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(9000), next: { revalidate } } as RequestInit);
      if (r.status === 429 || r.status >= 500) throw new ProviderError(`HTTP ${r.status}`, r.status);
      const j = (await r.json()) as Record<string, unknown>;
      if (!r.ok || j.error) throw new ProviderError(String(j.reason ?? `HTTP ${r.status}`), r.status);
      return j;
    } catch (e) {
      lastErr = e;
      if (e instanceof ProviderError && e.status && e.status < 500 && e.status !== 429) break;
      if (i < tries - 1) await new Promise((res) => setTimeout(res, 600 * (i + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new ProviderError(String(lastErr));
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Data type of an hourly value relative to when it was retrieved: values for
 * the current/next hours are forecasts; values more than 3 h in the past are
 * stored model estimates for that past time (never observations).
 */
function kindFor(tIso: string, fetchedMs: number, endpoint: string): EnvKind {
  if (endpoint === "era5") return "reanalysis";
  return Date.parse(tIso + (tIso.endsWith("Z") ? "" : "Z")) > fetchedMs - 3 * 3_600_000 ? "forecast" : "archived_forecast";
}

function availability<T extends object>(hours: T[], keys: (keyof T)[]) {
  const out: Record<string, { valid: number; total: number }> = {};
  for (const k of keys) out[String(k)] = { valid: hours.filter((h) => h[k] != null).length, total: hours.length };
  return out;
}

function statusOf(av: Record<string, { valid: number; total: number }>, total: number): Block<unknown>["status"] {
  const vals = Object.values(av);
  if (!total || vals.every((v) => v.valid === 0)) return "unavailable";
  if (vals.some((v) => v.valid < v.total)) return "partial";
  return "ok";
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const arr = (h: Record<string, unknown>, k: string): unknown[] => (Array.isArray(h[k]) ? (h[k] as unknown[]) : []);

export interface Window {
  lat: number;
  lng: number;
  from: number;
  to: number;
  wantCurrent: boolean;
}

export async function fetchWeather(w: Window, now: number): Promise<{ block: Block<WeatherHour>; current: Conditions["current"]; daily: Conditions["daily"] }> {
  // Choose the endpoint that actually holds data for this time window.
  let endpoint: "forecast" | "historical_forecast" | "era5";
  if (w.from >= now - 85 * DAY && w.to <= now + 15 * DAY) endpoint = "forecast";
  else if (w.from >= HIST_FORECAST_START) endpoint = "historical_forecast";
  else endpoint = "era5";

  const base = {
    forecast: "https://api.open-meteo.com/v1/forecast",
    historical_forecast: "https://historical-forecast-api.open-meteo.com/v1/forecast",
    era5: "https://archive-api.open-meteo.com/v1/archive",
  }[endpoint];
  const hourly = "temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,cloud_cover,pressure_msl,weather_code" + (endpoint === "era5" ? "" : ",precipitation_probability");
  const q = new URLSearchParams({
    latitude: w.lat.toFixed(2),
    longitude: w.lng.toFixed(2),
    timezone: "GMT",
    start_date: isoDay(w.from),
    end_date: isoDay(w.to),
    hourly,
    daily: "sunrise,sunset",
  });
  if (w.wantCurrent && endpoint === "forecast") q.set("current", "temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m,cloud_cover,pressure_msl,weather_code");
  const source = {
    forecast: "Open-Meteo Weather API (best-match forecast models)",
    historical_forecast: "Open-Meteo Historical Forecast API (archived model runs)",
    era5: "Open-Meteo ERA5 reanalysis",
  }[endpoint];
  const revalidate = w.to < now - 2 * DAY ? 86_400 : 900;
  try {
    const j = await getJson(`${base}?${q}`, revalidate);
    const h = (j.hourly ?? {}) as Record<string, unknown>;
    const times = arr(h, "time") as string[];
    const hours: WeatherHour[] = times
      .map((t, i) => ({
        t: t + "Z",
        k: kindFor(t, now, endpoint),
        temp: num(arr(h, "temperature_2m")[i]),
        feels: num(arr(h, "apparent_temperature")[i]),
        wind: num(arr(h, "wind_speed_10m")[i]),
        dir: num(arr(h, "wind_direction_10m")[i]),
        gust: num(arr(h, "wind_gusts_10m")[i]),
        rh: num(arr(h, "relative_humidity_2m")[i]),
        cloud: num(arr(h, "cloud_cover")[i]),
        pressure: num(arr(h, "pressure_msl")[i]),
        pprob: num(arr(h, "precipitation_probability")[i]),
        code: num(arr(h, "weather_code")[i]),
      }))
      .filter((x) => {
        const ms = Date.parse(x.t);
        return ms >= w.from - 3_600_000 && ms <= w.to + 3_600_000;
      });
    const av = availability(hours, ["temp", "wind", "dir", "gust", "rh", "cloud", "pprob", "pressure"]);
    if (endpoint === "era5") delete av.pprob;
    const c = j.current as Record<string, unknown> | undefined;
    const current: Conditions["current"] =
      c && typeof c.time === "string"
        ? {
            t: (c.time as string) + "Z",
            temp: num(c.temperature_2m),
            feels: num(c.apparent_temperature),
            wind: num(c.wind_speed_10m),
            dir: num(c.wind_direction_10m),
            gust: num(c.wind_gusts_10m),
            rh: num(c.relative_humidity_2m),
            cloud: num(c.cloud_cover),
            pressure: num(c.pressure_msl),
            code: num(c.weather_code),
            kind: "forecast",
            source: "Open-Meteo current conditions (model nowcast, not an on-site measurement)",
          }
        : null;
    const d = (j.daily ?? {}) as Record<string, unknown>;
    const daily = (arr(d, "time") as string[]).map((date, i) => ({
      date,
      sunrise: typeof arr(d, "sunrise")[i] === "string" ? (arr(d, "sunrise")[i] as string) + "Z" : null,
      sunset: typeof arr(d, "sunset")[i] === "string" ? (arr(d, "sunset")[i] as string) + "Z" : null,
    }));
    return {
      block: {
        status: statusOf(av, hours.length),
        source,
        endpoint,
        grid: num(j.latitude) != null ? { lat: num(j.latitude)!, lng: num(j.longitude)! } : null,
        hours,
        availability: av,
      },
      current,
      daily,
    };
  } catch (e) {
    return {
      block: { status: "error", source, endpoint, grid: null, hours: [], availability: {}, error: (e as Error).message },
      current: null,
      daily: [],
    };
  }
}

export async function fetchMarine(w: Window, now: number): Promise<Block<MarineHour>> {
  const source = "Open-Meteo Marine API (wave, ocean & sea-level models)";
  const q = new URLSearchParams({
    latitude: w.lat.toFixed(2),
    longitude: w.lng.toFixed(2),
    timezone: "GMT",
    cell_selection: "sea",
    start_date: isoDay(w.from),
    end_date: isoDay(w.to),
    hourly:
      "wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,swell_wave_direction,swell_wave_period,sea_surface_temperature,ocean_current_velocity,ocean_current_direction,sea_level_height_msl",
  });
  try {
    const j = await getJson(`https://marine-api.open-meteo.com/v1/marine?${q}`, w.to < now - 2 * DAY ? 86_400 : 1800);
    const h = (j.hourly ?? {}) as Record<string, unknown>;
    const times = arr(h, "time") as string[];
    const hours: MarineHour[] = times
      .map((t, i) => ({
        t: t + "Z",
        k: kindFor(t, now, "marine"),
        wave_h: num(arr(h, "wave_height")[i]),
        wave_dir: num(arr(h, "wave_direction")[i]),
        wave_p: num(arr(h, "wave_period")[i]),
        wind_wave_h: num(arr(h, "wind_wave_height")[i]),
        swell_h: num(arr(h, "swell_wave_height")[i]),
        swell_dir: num(arr(h, "swell_wave_direction")[i]),
        swell_p: num(arr(h, "swell_wave_period")[i]),
        sst: num(arr(h, "sea_surface_temperature")[i]),
        cur_v: num(arr(h, "ocean_current_velocity")[i]),
        cur_dir: num(arr(h, "ocean_current_direction")[i]),
        sea_level: num(arr(h, "sea_level_height_msl")[i]),
      }))
      .filter((x) => {
        const ms = Date.parse(x.t);
        return ms >= w.from - 13 * 3_600_000 && ms <= w.to + 13 * 3_600_000;
      });
    const av = availability(hours, ["wave_h", "wave_dir", "wave_p", "wind_wave_h", "swell_h", "swell_p", "sst", "cur_v", "sea_level"]);
    return {
      status: statusOf(av, hours.length),
      source,
      endpoint: "marine",
      grid: num(j.latitude) != null ? { lat: num(j.latitude)!, lng: num(j.longitude)! } : null,
      hours,
      availability: av,
    };
  } catch (e) {
    return { status: "error", source, endpoint: "marine", grid: null, hours: [], availability: {}, error: (e as Error).message };
  }
}

const MODEL_NOTE =
  "Modelled sea level (global ocean model, ~5–9 km grid, mean-sea-level datum). Not an official tide table and not for navigation; nearshore times and heights can differ. Official Kuwait tide tables: met.gov.kw (Shuwaikh, Shuaiba).";

export function tideFromMarine(marine: Block<MarineHour>): TideBlock {
  const series = cleanSeries(marine.hours.map((h) => ({ t: h.t, h: h.sea_level })));
  const base: Omit<TideBlock, "status" | "series" | "extremes"> = {
    source: "Open-Meteo Marine API · sea_level_height_msl (model)",
    kind: "model",
    official: false,
    datum: "MSL",
    station: null,
    method: "Local extrema of the hourly modelled sea-level series, refined by parabolic interpolation (min. range 0.15 m); waqfa = |rate| < 5 cm/h around each turn",
    note: MODEL_NOTE,
  };
  if (series.length < 6) return { ...base, status: "unavailable", series: [], extremes: [], error: marine.error ?? "No sea-level values for this location/time" };
  const ext = findExtrema(series);
  return {
    ...base,
    status: series.length === marine.hours.length ? "ok" : "partial",
    series: series.map((p) => ({ t: new Date(p.t).toISOString(), h: p.h })),
    extremes: ext.map((e) => ({ t: new Date(e.t).toISOString(), h: Math.round(e.h * 100) / 100, type: e.type })),
  };
}

/** Optional paid provider (only used when WORLDTIDES_API_KEY is configured). Not exercised in development. */
export async function tideFromWorldTides(w: Window, key: string): Promise<TideBlock> {
  const start = Math.floor((w.from - 13 * 3_600_000) / 1000);
  const length = Math.min(7 * 86_400, Math.ceil((w.to - w.from) / 1000) + 26 * 3600);
  const q = new URLSearchParams({
    heights: "",
    extremes: "",
    lat: w.lat.toFixed(3),
    lon: w.lng.toFixed(3),
    start: String(start),
    length: String(length),
    step: "1800",
    datum: "MSL",
    stationDistance: "60",
    key,
  });
  const base = {
    kind: "forecast" as EnvKind,
    official: false as const,
    datum: "MSL" as const,
    method: "WorldTides harmonic tide prediction",
  };
  try {
    const j = await getJson(`https://www.worldtides.info/api/v3?${q.toString().replace(/=&/g, "&")}`, 21_600, 1);
    const heights = (Array.isArray(j.heights) ? j.heights : []) as { dt: number; height: number }[];
    const extremes = (Array.isArray(j.extremes) ? j.extremes : []) as { dt: number; height: number; type: string }[];
    const station = typeof j.station === "string" ? j.station : null;
    return {
      ...base,
      status: heights.length ? "ok" : "unavailable",
      source: `WorldTides API${station ? ` · station ${station}` : ` · ${String(j.atlas ?? "global atlas")}`}`,
      station,
      series: heights.map((x) => ({ t: new Date(x.dt * 1000).toISOString(), h: x.height })),
      extremes: extremes.map((x) => ({ t: new Date(x.dt * 1000).toISOString(), h: x.height, type: x.type.toLowerCase() === "high" ? "high" : "low" })),
      note: station
        ? "Tide prediction based on a nearby tide station (not the official Kuwait tide table)."
        : "Tide prediction from a global tidal atlas (no nearby station). Not the official Kuwait tide table.",
    };
  } catch (e) {
    return { ...base, status: "error", source: "WorldTides API", station: null, series: [], extremes: [], note: "", error: (e as Error).message };
  }
}

export const ATTRIBUTION = "Weather & marine data: Open-Meteo.com (CC BY 4.0). Sun & moon: SunCalc astronomical calculation.";

export type { CurrentWeather };
