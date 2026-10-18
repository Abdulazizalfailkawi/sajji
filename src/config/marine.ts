// One place for every number that decides what the sea screen says.
// Edit here (not in the components) to tune the app.
//
// Everything marked "reference" was measured against the daily tide bulletin
// kept in reference/tides/ (11 days, 9–19 Oct 2026): the Open-Meteo sea-level
// model runs EARLIER than the bulletin and uses mean-sea-level as its zero,
// while the bulletin's heights start from a chart datum.

// ---------------------------------------------------------------- tide calibration

export interface TideSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** which bulletin region this spot is compared with */
  region: "north" | "south";
  /** minutes the model's times are moved LATER (bulletin − model, mean of 43 events) */
  shiftMin: number;
  /** metres added to the model's heights so they read like the bulletin (chart datum) */
  heightOffsetM: number;
}

export const TIDE_SPOTS: TideSpot[] = [
  { id: "kuwait-bay", name: "جون الكويت", lat: 29.39542, lng: 47.94839, region: "north", shiftMin: 19, heightOffsetM: 1.8 },
  { id: "kuwait-towers", name: "أبراج الكويت", lat: 29.37294, lng: 48.03725, region: "north", shiftMin: 33, heightOffsetM: 1.8 },
  { id: "fintas", name: "الفنطاس", lat: 29.172, lng: 48.13061, region: "south", shiftMin: 34, heightOffsetM: 1.3 },
  { id: "khiran", name: "الخيران", lat: 28.68061, lng: 48.39072, region: "south", shiftMin: 33, heightOffsetM: 1.3 },
];

/** Used for a spot that is more than MAX_SPOT_KM from every reference spot. */
export const DEFAULT_TIDE_CALIBRATION = { shiftMin: 30, heightOffsetM: 1.55 };
export const MAX_SPOT_KM = 40;

/** Smallest rise/fall (m) between a high and a low that still counts as a real tide. */
export const MIN_TIDE_RANGE_M = 0.05;

function km(aLat: number, aLng: number, bLat: number, bLng: number) {
  const r = Math.PI / 180;
  const h = Math.sin(((bLat - aLat) * r) / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLng - aLng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export function calibrationFor(lat: number, lng: number): { shiftMin: number; heightOffsetM: number; spot: TideSpot | null } {
  let best: TideSpot | null = null;
  let bestKm = Infinity;
  for (const s of TIDE_SPOTS) {
    const d = km(lat, lng, s.lat, s.lng);
    if (d < bestKm) {
      best = s;
      bestKm = d;
    }
  }
  if (!best || bestKm > MAX_SPOT_KM) return { ...DEFAULT_TIDE_CALIBRATION, spot: null };
  return { shiftMin: best.shiftMin, heightOffsetM: best.heightOffsetM, spot: best };
}

// ---------------------------------------------------------------- tide "now" wording

/** Within this many minutes of a high / low tide the screen says "الحين مد عالي / جزر". */
export const AT_PEAK_MIN = 60;
/** Half-width of the light-blue "good for fishing" band drawn around every turn on the graph. */
export const FISHING_BAND_MIN = 60;

// ---------------------------------------------------------------- safety lights (small 40 hp boat)

export const KNOT_KMH = 1.852;

export const SAFETY = {
  wind: {
    /** sustained wind, knots: green below `green`, yellow up to `yellow`, red above */
    greenKn: 10,
    yellowKn: 15,
    /** gusts above this are red on their own (knots) */
    gustRedKn: 20,
  },
  wave: {
    /** metres */
    greenM: 0.5,
    yellowM: 1.0,
  },
} as const;

export type Light = "green" | "yellow" | "red";

export function windLight(windKmh: number | null | undefined, gustKmh: number | null | undefined): Light | null {
  if (windKmh == null && gustKmh == null) return null;
  const kn = (windKmh ?? 0) / KNOT_KMH;
  const gust = (gustKmh ?? 0) / KNOT_KMH;
  if (kn > SAFETY.wind.yellowKn || gust > SAFETY.wind.gustRedKn) return "red";
  if (kn >= SAFETY.wind.greenKn) return "yellow";
  return "green";
}

export function waveLight(waveM: number | null | undefined): Light | null {
  if (waveM == null) return null;
  if (waveM > SAFETY.wave.yellowM) return "red";
  if (waveM >= SAFETY.wave.greenM) return "yellow";
  return "green";
}

const RANK: Record<Light, number> = { green: 0, yellow: 1, red: 2 };
/** The verdict follows the worst value. */
export function worstLight(...ls: (Light | null)[]): Light | null {
  const xs = ls.filter((x): x is Light => x != null);
  return xs.length ? xs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a)) : null;
}

// ---------------------------------------------------------------- best fishing time: weights

export const BEST_WEIGHTS = {
  /** most fish: share of tide timing / light / rising-falling preference (sum 1) */
  general: { tide: 0.65, light: 0.2, direction: 0.15 },
  /** hamour / balool: the slack is the peak */
  grouper: { tide: 0.8, light: 0.2 },
  /** balool also bites at sunset */
  grouperDusk: { tide: 0.7, light: 0.3 },
  /** multiplier on the whole score by the day's tide strength cycle */
  cycle: { hamal: 1, between: 0.95, fasad: 0.9 },
  /** wind / wave: scores fall when wind (km/h) or waves (m) pass these */
  wind: { startKmh: 25, fullKmh: 45, minFactor: 0.45 },
  wave: { startM: 0.8, fullM: 1.5, minFactor: 0.5 },
} as const;
