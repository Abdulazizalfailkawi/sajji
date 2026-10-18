// The one-sentence "can I go out?" verdict for a small boat, from the hourly
// wind and wave forecast. Thresholds live in src/config/marine.ts.

import { KNOT_KMH, waveLight, windLight, worstLight, type Light } from "../config/marine";
import type { Conditions } from "./marine/types";

export interface Verdict {
  light: Light;
  wind: Light | null;
  wave: Light | null;
  maxWindKmh: number | null;
  maxGustKmh: number | null;
  maxWaveM: number | null;
  /** direction (degrees, wind coming from) of the strongest hour */
  windDir: number | null;
}

/** Worst wind / waves between `from` and `to` (ms). Null when there is no data at all. */
export function verdictFor(c: Conditions | null, from: number, to: number): Verdict | null {
  if (!c) return null;
  let wind: number | null = null;
  let gust: number | null = null;
  let dir: number | null = null;
  for (const h of c.weather.hours) {
    const t = Date.parse(h.t);
    if (t < from - 30 * 60_000 || t > to) continue;
    if (h.wind != null && (wind == null || h.wind > wind)) {
      wind = h.wind;
      dir = h.dir ?? null;
    }
    if (h.gust != null && (gust == null || h.gust > gust)) gust = h.gust;
  }
  let wave: number | null = null;
  for (const h of c.marine.hours) {
    const t = Date.parse(h.t);
    if (t < from - 30 * 60_000 || t > to) continue;
    if (h.wave_h != null && (wave == null || h.wave_h > wave)) wave = h.wave_h;
  }
  const w = windLight(wind, gust);
  const v = waveLight(wave);
  const light = worstLight(w, v);
  if (!light) return null;
  return { light, wind: w, wave: v, maxWindKmh: wind, maxGustKmh: gust, maxWaveM: wave, windDir: dir };
}

export const knots = (kmh: number) => Math.round(kmh / KNOT_KMH);
