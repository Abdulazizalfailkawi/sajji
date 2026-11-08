// Barometric pressure (mean sea-level pressure, hPa) and its short-term trend.
// The value is a weather-MODEL field (Open-Meteo), not a reading from the user's
// location. A fast fall is the classic sign that the weather is about to change.

export type PressureTrend = "rising_fast" | "rising" | "steady" | "falling" | "falling_fast";

export interface PressureNow {
  hpa: number;
  /** change over the last 3 hours (hPa), null when there is no earlier value */
  delta3h: number | null;
  trend: PressureTrend | null;
}

export function classifyTrend(delta3h: number): PressureTrend {
  if (delta3h <= -3) return "falling_fast";
  if (delta3h <= -1) return "falling";
  if (delta3h >= 3) return "rising_fast";
  if (delta3h >= 1) return "rising";
  return "steady";
}

/** Pressure at `at`, with its change over the previous 3 hours. */
export function pressureAt(hours: { t: string; pressure?: number | null }[], at: number): PressureNow | null {
  const near = (ms: number) => {
    let best: { t: string; pressure?: number | null } | null = null;
    let bd = Infinity;
    for (const h of hours) {
      if (typeof h.pressure !== "number") continue;
      const d = Math.abs(Date.parse(h.t) - ms);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return bd <= 90 * 60_000 ? best : null;
  };
  const now = near(at);
  if (!now || typeof now.pressure !== "number") return null;
  const before = near(at - 3 * 3_600_000);
  const delta = before && typeof before.pressure === "number" ? Math.round((now.pressure - before.pressure) * 10) / 10 : null;
  return { hpa: Math.round(now.pressure), delta3h: delta, trend: delta == null ? null : classifyTrend(delta) };
}
