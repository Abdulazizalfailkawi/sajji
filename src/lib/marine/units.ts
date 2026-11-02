// Unit conversion and labels. Providers return km/h, °C, m, s.

export type WindUnit = "kmh" | "kn" | "ms";

export function convertWind(kmh: number, unit: WindUnit): number {
  if (unit === "kn") return kmh / 1.852;
  if (unit === "ms") return kmh / 3.6;
  return kmh;
}

export function windUnitLabel(unit: WindUnit, lang: "ar" | "en"): string {
  return { kmh: lang === "ar" ? "كم/س" : "km/h", kn: lang === "ar" ? "عقدة" : "kn", ms: lang === "ar" ? "م/ث" : "m/s" }[unit];
}

export function fmtWind(kmh: number | null | undefined, unit: WindUnit, lang: "ar" | "en"): string {
  if (kmh == null || !Number.isFinite(kmh)) return "—";
  const v = convertWind(kmh, unit);
  return `${Math.round(v * 10) / 10} ${windUnitLabel(unit, lang)}`;
}

const DIRS16_EN = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
const DIRS8_AR = ["شمالي", "شمالي شرقي", "شرقي", "جنوبي شرقي", "جنوبي", "جنوبي غربي", "غربي", "شمالي غربي"];
const DIRS8_EN_LONG = ["Northerly", "North-easterly", "Easterly", "South-easterly", "Southerly", "South-westerly", "Westerly", "North-westerly"];

/** Meteorological convention: the direction the wind / waves come FROM. */
export function compass(deg: number | null | undefined, lang: "ar" | "en", long = false): string {
  if (deg == null || !Number.isFinite(deg)) return "—";
  const d = ((deg % 360) + 360) % 360;
  if (lang === "ar") return DIRS8_AR[Math.round(d / 45) % 8];
  return long ? DIRS8_EN_LONG[Math.round(d / 45) % 8] : DIRS16_EN[Math.round(d / 22.5) % 16];
}

export function readWindUnit(): WindUnit {
  try {
    const v = localStorage.getItem("ft.windUnit");
    if (v === "kn" || v === "ms" || v === "kmh") return v;
  } catch {}
  return "kmh";
}
export function saveWindUnit(u: WindUnit) {
  try {
    localStorage.setItem("ft.windUnit", u);
  } catch {}
}

/** Wave height in feet, one decimal ("3.6 قدم", "0.8 قدم"). */
export function fmtWave(m: number | null | undefined, lang: "ar" | "en"): string {
  if (m == null || !Number.isFinite(m)) return "—";
  const ft = Math.round(m * 3.28084 * 10) / 10;
  return `${ft} ${lang === "ar" ? "قدم" : "ft"}`;
}
