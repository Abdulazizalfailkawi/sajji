// Shape of /api/conditions responses. Every block carries its own
// provenance so the UI can always say where a number came from and what
// kind of number it is.

import type { EnvKind } from "../types";

export type BlockStatus = "ok" | "partial" | "unavailable" | "error";

export interface WeatherHour {
  t: string; // ISO UTC
  k: EnvKind; // forecast | archived_forecast | reanalysis
  temp: number | null;
  feels: number | null;
  wind: number | null; // km/h
  dir: number | null; // degrees, FROM
  gust: number | null; // km/h
  rh: number | null; // %
  cloud: number | null; // %
  pprob: number | null; // %
  pressure?: number | null; // hPa, mean sea level (model)
  code: number | null; // WMO weather code
}

export interface MarineHour {
  t: string;
  k: EnvKind;
  wave_h: number | null;
  wave_dir: number | null;
  wave_p: number | null;
  wind_wave_h: number | null;
  swell_h: number | null;
  swell_dir: number | null;
  swell_p: number | null;
  sst: number | null;
  cur_v: number | null; // km/h
  cur_dir: number | null; // degrees, TOWARDS
  sea_level: number | null; // m, MSL datum
}

export interface Block<T> {
  status: BlockStatus;
  source: string;
  endpoint: string;
  grid: { lat: number; lng: number } | null;
  hours: T[];
  /** valid (non-null) values per variable over the window */
  availability: Record<string, { valid: number; total: number }>;
  error?: string;
}

export interface TideBlock {
  status: BlockStatus;
  source: string;
  kind: EnvKind; // "model" for the Open-Meteo sea-level model, "forecast" for station predictions
  official: false;
  datum: "MSL";
  station: string | null;
  method: string;
  series: { t: string; h: number }[];
  extremes: { t: string; h: number; type: "high" | "low" }[];
  note: string;
  error?: string;
}

export interface CurrentWeather {
  t: string;
  temp: number | null;
  feels: number | null;
  wind: number | null;
  dir: number | null;
  gust: number | null;
  rh: number | null;
  cloud: number | null;
  pressure?: number | null;
  code: number | null;
}

export interface Conditions {
  request: { lat: number; lng: number; from: string; to: string };
  fetched_at: string;
  weather: Block<WeatherHour>;
  current: (CurrentWeather & { kind: "forecast"; source: string }) | null;
  daily: { date: string; sunrise: string | null; sunset: string | null }[];
  marine: Block<MarineHour>;
  tide: TideBlock;
  attribution: string;
}
