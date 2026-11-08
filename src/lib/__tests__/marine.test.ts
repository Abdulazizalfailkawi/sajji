import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanSeries, findExtrema, heightAt, phaseAt, phaseToTide, surroundingExtrema } from "../marine/tide";
import { getConditions, hourAt, pressureRow, snapshotRows, tideAt, turnsOf } from "../marine/client";
import { fetchWeather, fetchMarine, tideFromMarine } from "../marine/providers";
import type { Conditions, MarineHour, WeatherHour } from "../marine/types";
import { catchEnv } from "../marine/env";
import { catchSummary, ordinal, speciesOrdinal } from "../summary";
import { speciesTargetAnalytics } from "../speciesAnalytics";
import { buildReport } from "../reports";
import { buildIndex, speciesStats } from "../stats";
import { cascadeDelete } from "../db/sync";
import { newCatch, newTrip } from "../factory";
import { catchPressure, pressureBand, trendGroup } from "../analyticsExtra";
import { dateKey, kwParts } from "../time";
import { hijriForDateKey, toHijri } from "../hijri";
import { emptyDataset, type Dataset, type EnvironmentObservation, type Species } from "../types";

const H = 3_600_000;
const T0 = Date.parse("2026-10-12T00:00:00Z");

/** Synthetic semidiurnal tide: period 12.42 h, amplitude 1.2 m, first high at T0 + 3h. */
function synth(hours = 48, step = H) {
  const out: { t: string; h: number | null }[] = [];
  for (let i = 0; i <= hours * (H / step); i++) {
    const t = T0 + i * step;
    out.push({ t: new Date(t).toISOString(), h: 1.2 * Math.cos((2 * Math.PI * (t - (T0 + 3 * H))) / (12.42 * H)) });
  }
  return out;
}

describe("tide extrema & phase", () => {
  const pts = cleanSeries(synth());
  const ext = findExtrema(pts);

  it("finds alternating highs and lows at the right times (±15 min)", () => {
    expect(ext.length).toBeGreaterThanOrEqual(7);
    for (let i = 1; i < ext.length; i++) expect(ext[i].type).not.toBe(ext[i - 1].type);
    const firstHigh = ext.find((e) => e.type === "high")!;
    expect(Math.abs(firstHigh.t - (T0 + 3 * H))).toBeLessThan(15 * 60_000);
    const firstLow = ext.find((e) => e.type === "low")!;
    expect(Math.abs(firstLow.t - (T0 + 3 * H + 6.21 * H))).toBeLessThan(15 * 60_000);
  });

  it("derives rising/falling from successive values, not guesses", () => {
    expect(phaseAt(pts, ext, T0 + 5 * H)).toBe("falling"); // after the 03:00 high
    expect(phaseAt(pts, ext, T0 + 12 * H)).toBe("rising"); // after the ~09:13 low
    expect(phaseAt(pts, ext, T0 + 3 * H + 5 * 60_000)).toBe("high_slack");
    expect(phaseToTide("high_slack")).toBe("high");
    expect(phaseAt(pts, ext, T0 + 100 * H)).toBeNull(); // outside the series
  });

  it("ignores small wiggles and does not bridge data gaps", () => {
    const noisy = cleanSeries(synth().map((p, i) => ({ ...p, h: (p.h as number) + (i % 2 ? 0.02 : -0.02) })));
    const e2 = findExtrema(noisy);
    expect(e2.length).toBeLessThanOrEqual(ext.length + 1);
    const gappy = cleanSeries(synth().map((p, i) => (i >= 10 && i <= 14 ? { ...p, h: null } : p)));
    expect(heightAt(gappy, T0 + 12 * H)).toBeNull();
  });

  it("works on the real Open-Meteo Al-Fintas sample (mixed semidiurnal)", () => {
    const real = [0.01, -0.51, -0.9, -1.09, -1.03, -0.75, -0.32, 0.16, 0.57, 0.81, 0.84, 0.67, 0.38, 0.05, -0.19, -0.27, -0.15, 0.14, 0.54, 0.94, 1.25, 1.35, 1.21, 0.85, 0.34, -0.21];
    const p = cleanSeries(real.map((h, i) => ({ t: new Date(T0 + i * H).toISOString(), h })));
    const e = findExtrema(p);
    expect(e.map((x) => x.type)).toEqual(["low", "high", "low", "high"]);
    const s = surroundingExtrema(e, T0 + 12 * H);
    expect(s.nextLow!.h).toBeLessThan(0);
    expect(s.nextHigh!.h).toBeGreaterThan(1.3);
  });
});

// ---------------------------------------------------------------------------
function cond(partial: Partial<Conditions> = {}, opts: { weather?: Partial<WeatherHour>; marine?: Partial<MarineHour> } = {}): Conditions {
  const hours = Array.from({ length: 48 }, (_, i) => new Date(T0 + i * H).toISOString());
  const wx: WeatherHour[] = hours.map((t) => ({ t, k: "archived_forecast", temp: 30, feels: 31, wind: 18.52, dir: 315, gust: 25, rh: 40, cloud: 10, pprob: 0, code: 1, ...opts.weather }));
  const sea = synth(47);
  const mh: MarineHour[] = hours.map((t, i) => ({ t, k: "archived_forecast", wave_h: 0.4, wave_dir: 300, wave_p: 3, wind_wave_h: 0.3, swell_h: 0.1, swell_dir: 300, swell_p: 2, sst: 28, cur_v: 1, cur_dir: 90, sea_level: sea[i].h, ...opts.marine }));
  const marine = { status: "ok" as const, source: "Open-Meteo Marine API", endpoint: "marine", grid: { lat: 29.2, lng: 48.29 }, hours: mh, availability: {} };
  return {
    request: { lat: 29.17, lng: 48.12, from: hours[0], to: hours[47] },
    fetched_at: new Date(T0 + 72 * H).toISOString(),
    weather: { status: "ok", source: "Open-Meteo Historical Forecast API", endpoint: "historical_forecast", grid: { lat: 29.19, lng: 48.07 }, hours: wx, availability: {} },
    current: null,
    daily: [],
    marine,
    tide: tideFromMarine(marine),
    attribution: "",
    ...partial,
  };
}

describe("environmental snapshots", () => {
  const ctx = { tripId: "trip", catchId: "c1", purpose: "catch" as const, lat: 29.17, lng: 48.12 };

  it("stores weather, marine, tide and astronomy with provenance for the exact time", () => {
    const at = new Date(T0 + 5 * H + 10 * 60_000);
    const rows = snapshotRows(cond(), at, ctx);
    const by = (c: string) => rows.find((r) => r.category === c)!;
    expect(new Set(rows.map((r) => r.snapshot_id)).size).toBe(1);
    expect(by("weather").kind).toBe("archived_forecast");
    expect(by("weather").valid_at).toBe(new Date(T0 + 5 * H).toISOString());
    expect(by("weather").data.wind_speed_kmh).toBe(18.52);
    expect(by("marine").data.wave_height_m).toBe(0.4);
    expect(by("tide").kind).toBe("model");
    expect(by("tide").data.phase).toBe("falling");
    expect(by("tide").data.official).toBe(false);
    expect(by("astronomy").kind).toBe("calculated");
  });

  it("marks unavailable data instead of inventing it", () => {
    const rows = snapshotRows(cond({}, { marine: { wave_h: null, sst: null, swell_h: null, cur_v: null, sea_level: null } }), new Date(T0 + 5 * H), ctx);
    expect(rows.find((r) => r.category === "marine")!.kind).toBe("unavailable");
    expect(rows.find((r) => r.category === "tide")!.kind).toBe("unavailable");
    const none = snapshotRows(null, new Date(T0), { ...ctx, lat: null, lng: null });
    expect(none.map((r) => r.kind).sort()).toEqual(["calculated", "unavailable"]);
    expect(none.find((r) => r.kind === "unavailable")!.data.reason).toBe("NO_COORDINATES");
  });

  it("never substitutes another time's conditions (historical vs current)", () => {
    // Response only covers hours 0..47; a catch 3 days later must not pick the last hour.
    expect(hourAt(cond().weather.hours, T0 + 72 * H)).toBeNull();
    const rows = snapshotRows(cond(), new Date(T0 + 72 * H), ctx);
    expect(rows.find((r) => r.category === "weather")!.kind).toBe("unavailable");
    expect(tideAt(cond(), T0 + 72 * H)).toBeNull();
  });

  it("shifts every model tide time by the same number of minutes (calibration)", () => {
    const base = turnsOf(cond(), 0);
    const moved = turnsOf(cond(), 50);
    expect(base.turns.length).toBeGreaterThan(2);
    expect(moved.turns.length).toBe(base.turns.length);
    moved.turns.forEach((t, i) => {
      expect(t.t - base.turns[i].t).toBe(50 * 60_000);
      expect(t.type).toBe(base.turns[i].type);
      if (t.waqfaStart != null) expect(t.waqfaStart - base.turns[i].waqfaStart!).toBe(50 * 60_000);
    });
    expect(moved.pts[0].t - base.pts[0].t).toBe(50 * 60_000);
  });
});

// ---------------------------------------------------------------------------
const ts = "2026-01-01T00:00:00.000Z";
const sp = (id: string, ar: string, en: string): Species => ({ id, name_ar: ar, name_en: en, scientific_name: null, aliases: [], family: null, notes: null, cover_media_id: null, is_builtin: true, created_at: ts, updated_at: ts });

function baloolData(): Dataset {
  const ds = emptyDataset();
  ds.species = [sp("bal", "بالول", "Balool"), sp("ham", "هامور", "Grouper")];
  ds.techniques = [{ id: "jig", code: "jigging", name_ar: "جيقنق", name_en: "Jigging", is_builtin: true, sort_order: 1, created_at: ts, updated_at: ts }];
  const mk = (id: string, start: string, target: string | null, tide: "rising" | "falling" | null = null) =>
    newTrip({ id, status: "completed", started_at: start, ended_at: new Date(Date.parse(start) + 4 * H).toISOString(), target_species_id: target, technique_id: "jig", tide });
  ds.trips = [
    mk("t1", "2026-09-01T02:00:00Z", "bal", "rising"),
    mk("t2", "2026-09-08T02:00:00Z", "bal", "falling"),
    mk("t3", "2026-09-15T02:00:00Z", "bal"),
    mk("t4", "2026-09-22T02:00:00Z", "ham"), // other target: not a failed Balool trip
    { ...mk("t5", "2026-09-29T02:00:00Z", "bal"), is_demo: true },
  ];
  const c = (id: string, trip: string, s: string, at: string, w: number | null = null) => newCatch(ds.trips.find((x) => x.id === trip)!, { id, species_id: s, caught_at: at, weight_kg: w });
  ds.catches = [
    c("c1", "t1", "bal", "2026-09-01T03:00:00Z", 2.1),
    c("c2", "t1", "bal", "2026-09-01T03:30:00Z"),
    c("c3", "t4", "bal", "2026-09-22T03:00:00Z"), // Balool caught on a grouper trip
    c("c4", "t4", "ham", "2026-09-22T03:10:00Z"),
    { ...c("c5", "t5", "bal", "2026-09-29T03:00:00Z"), is_demo: true },
  ];
  return ds;
}

describe("Balool / species analytics", () => {
  const ds = baloolData();
  const idx = buildIndex(ds);
  const a = speciesTargetAnalytics(ds, idx, "bal");

  it("uses target trips (incl. zero-catch trips) as the denominator", () => {
    expect(a.targetTrips).toBe(4); // t1, t2, t3, t5 (demo included here: it is a real-looking record in analytics)
    expect(a.successful).toBe(2); // t1 and demo t5
    expect(a.unsuccessful).toBe(2);
    expect(a.fishOnOtherTrips).toBe(1); // c3 on the grouper trip is NOT a target-trip success
  });

  it("reports missing data per dimension", () => {
    expect(a.byTide.missing).toBe(2); // t3, t5 have no tide
    expect(a.byTide.groups.find((g) => g.key === "rising")).toMatchObject({ trips: 1, successful: 1 });
    expect(a.byTide.groups.find((g) => g.key === "falling")).toMatchObject({ trips: 1, successful: 0 });
    expect(a.byTide.groups.every((g) => !g.sufficient)).toBe(true);
  });

  it("species counts and ordinals update after a catch is deleted", () => {
    expect(speciesStats(ds.species[0], ds, idx).count).toBe(4);
    expect(speciesOrdinal(ds, ds.catches[2])).toBe(3);
    const { ds: after } = cascadeDelete(ds, "catches", [ds.catches[0] as never]);
    const idx2 = buildIndex(after);
    expect(speciesStats(after.species[0], after, idx2).count).toBe(3);
    expect(speciesOrdinal(after, after.catches.find((x) => x.id === "c3")!)).toBe(2);
  });

  it("reports exclude demo records", () => {
    const r = buildReport(ds, idx, { from: "2026-09-01", to: "2026-09-30" }, 0, () => "x");
    expect(r.summary.trips).toBe(4);
    expect(r.catches).toHaveLength(4);
    expect(r.excludedDemo).toBe(1);
    expect(r.sentences[0].en).toMatch(/4 fish across 4 trips/);
  });
});

describe("catch summary", () => {
  it("shows only real values and marks provenance", () => {
    const ds = baloolData();
    const idx = buildIndex(ds);
    const c = ds.catches[0];
    const s = catchSummary(ds, idx, c, "en", "kn");
    expect(s.headline).toMatch(/You logged Balool \(بالول\) on 1 September 2026 .* using Jigging, on a trip\./);
    expect(s.lines.find((l) => l.label === "Measurements")?.value).toBe("2.1 kg");
    expect(s.lines.find((l) => l.label === "Wind")).toBeUndefined(); // no snapshot -> omitted, not "according to data"
    expect(s.lines.find((l) => l.label === "Moon")?.value).toMatch(/\(calculated\)/);
    expect(s.closing).toBe("This is your 1st recorded Balool catch.");
    const ar = catchSummary(ds, idx, ds.catches[1], "ar", "kn");
    expect(ar.closing).toBe("هذه المرة الثانية المسجلة التي تصيد فيها بالول.");
  });

  it("regenerates after edits and uses snapshot values with their type", () => {
    const ds = baloolData();
    const c = { ...ds.catches[0], weight_kg: 3.4, weight_is_estimate: true };
    ds.catches[0] = c;
    // Synthetic provider data covers T0..T0+47h; take the snapshot there and file it under the catch time.
    const rows = snapshotRows(cond(), new Date(T0 + 5 * H), { tripId: c.trip_id, catchId: c.id, purpose: "catch", lat: 29.17, lng: 48.12 });
    ds.environment_observations = rows.map((r) => ({ ...r, valid_at: c.caught_at, created_at: ts, updated_at: ts })) as EnvironmentObservation[];
    const s = catchSummary(ds, buildIndex(ds), c, "en", "kn");
    expect(s.lines.find((l) => l.label === "Measurements")?.value).toBe("3.4 kg (est.)");
    expect(s.lines.find((l) => l.label === "Wind")?.value).toMatch(/North-westerly 10 kn.*\(model estimate\)/);
    const env = catchEnv(ds, { ...c, tide: "low" });
    expect(env.tidePhase).toMatchObject({ value: "low", kind: "entered" }); // manual wins over model
    expect(ordinal(7, "en")).toBe("7th");
    expect(ordinal(7, "ar")).toBe("السابعة");
  });
});

describe("Kuwait time & Hijri boundaries", () => {
  it("assigns dates by Kuwait midnight, not UTC", () => {
    expect(dateKey("2026-10-11T20:59:00Z")).toBe("2026-10-11"); // 23:59 Kuwait
    expect(dateKey("2026-10-11T21:00:00Z")).toBe("2026-10-12"); // 00:00 Kuwait
    expect(kwParts("2026-10-11T21:30:00Z").hour).toBe(0);
  });
  it("Hijri month boundary follows the Kuwait date", () => {
    expect(hijriForDateKey("2026-10-12")).toEqual({ year: 1448, month: 5, day: 1 });
    expect(toHijri("2026-10-11T21:30:00Z")).toEqual({ year: 1448, month: 5, day: 1 }); // 00:30 Kuwait on the 12th
    expect(toHijri("2026-10-11T20:30:00Z").month).toBe(4); // 23:30 Kuwait on the 11th
  });
});

// ---------------------------------------------------------------------------
describe("providers & caching", () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal("navigator", { onLine: true });
  });
  afterEach(() => vi.unstubAllGlobals());

  const okJson = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } }));

  it("chooses forecast / archived-forecast / reanalysis endpoints by date", async () => {
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url);
      return okJson({ latitude: 29.2, longitude: 48.1, hourly: { time: [], temperature_2m: [] }, daily: { time: [] } });
    });
    const now = Date.parse("2026-10-12T12:00:00Z");
    await fetchWeather({ lat: 29.17, lng: 48.12, from: now - 2 * H, to: now + 24 * H, wantCurrent: true }, now);
    await fetchWeather({ lat: 29.17, lng: 48.12, from: Date.parse("2024-05-01T00:00:00Z"), to: Date.parse("2024-05-02T00:00:00Z"), wantCurrent: false }, now);
    await fetchWeather({ lat: 29.17, lng: 48.12, from: Date.parse("2019-05-01T00:00:00Z"), to: Date.parse("2019-05-02T00:00:00Z"), wantCurrent: false }, now);
    expect(calls[0]).toContain("api.open-meteo.com/v1/forecast");
    expect(calls[0]).toContain("current=");
    expect(calls[1]).toContain("historical-forecast-api.open-meteo.com");
    expect(calls[2]).toContain("archive-api.open-meteo.com");
    expect(calls[0]).toContain("latitude=29.17");
  });

  it("reports provider failures and all-null variables as unavailable", async () => {
    vi.stubGlobal("fetch", () => Promise.resolve(new Response("{}", { status: 503 })));
    const now = Date.now();
    const w = await fetchWeather({ lat: 29, lng: 48, from: now, to: now + H, wantCurrent: false }, now);
    expect(w.block.status).toBe("error");
    expect(w.block.hours).toHaveLength(0);
    vi.stubGlobal("fetch", () => okJson({ latitude: 29, longitude: 48, hourly: { time: ["2026-10-12T00:00", "2026-10-12T01:00"], wave_height: [null, null], sea_level_height_msl: [null, null] } }));
    const m = await fetchMarine({ lat: 29, lng: 48, from: Date.parse("2026-10-12T00:00:00Z"), to: Date.parse("2026-10-12T01:00:00Z"), wantCurrent: false }, now);
    expect(m.status).toBe("unavailable");
    expect(tideFromMarine(m).status).toBe("unavailable");
  });

  it("caches identical requests and serves stale data when the provider fails", async () => {
    let n = 0;
    vi.stubGlobal("fetch", () => {
      n++;
      return okJson(cond());
    });
    const a = await getConditions(29.17, 48.12, new Date(T0), new Date(T0 + 24 * H));
    const b = await getConditions(29.17, 48.12, new Date(T0), new Date(T0 + 24 * H));
    expect(n).toBe(1);
    expect(a.fromCache).toBe(false);
    expect(b.fromCache).toBe(true);
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));
    const c = await getConditions(29.17, 48.12, new Date(T0), new Date(T0 + 24 * H), { force: true });
    expect(c.stale).toBe(true);
    expect(c.data).not.toBeNull();
    expect(c.error).toMatch(/fetch/);
  });
});

describe("barometric pressure with each catch", () => {
  // pressure falls 1.5 hPa per hour: 1020 at T0 ... so a 3-hour change of -4.5 hPa
  const withPressure = () => {
    const c = cond();
    c.weather.hours = c.weather.hours.map((h, i) => ({ ...h, pressure: 1020 - 1.5 * i }));
    return c;
  };
  const at = new Date(T0 + 10 * H);
  const ctx = { tripId: null, catchId: "c1", purpose: "catch" as const, lat: 29.17, lng: 48.12 };

  it("the weather snapshot stores the pressure, its 3-hour change and trend", () => {
    const w = snapshotRows(withPressure(), at, ctx).find((r) => r.category === "weather")!;
    expect(w.data.pressure_hpa).toBe(1005);
    expect(w.data.pressure_change_3h_hpa).toBe(-4.5);
    expect(w.data.pressure_trend).toBe("falling_fast");
  });

  it("an older record gets a pressure-only row added (nothing replaced)", () => {
    const row = pressureRow(withPressure(), at, { tripId: null, catchId: "c1", lat: 29.17, lng: 48.12 })!;
    expect(row.category).toBe("weather");
    expect(row.purpose).toBe("refresh");
    expect(Object.keys(row.data)).toEqual(expect.arrayContaining(["pressure_hpa", "pressure_change_3h_hpa"]));
    expect(row.data).not.toHaveProperty("wind_speed_kmh");
    expect(pressureRow(cond(), at, { tripId: null, catchId: "c1", lat: 1, lng: 1 })).toBeNull(); // no pressure in the data
  });

  it("catchEnv reads pressure from the pressure-only row while keeping the older wind values", () => {
    const ds = emptyDataset();
    const c = newCatch(null, { id: "c1", caught_at: at.toISOString() });
    ds.catches = [c];
    const full = snapshotRows(cond(), at, ctx); // snapshot taken before pressure existed
    const extra = pressureRow(withPressure(), at, { tripId: null, catchId: "c1", lat: 29.17, lng: 48.12 })!;
    ds.environment_observations = [...full, extra].map((r) => ({ ...r, created_at: "x", updated_at: "x" })) as unknown as EnvironmentObservation[];
    const e = catchEnv(ds, c);
    expect(e.pressure?.value).toBe(1005);
    expect(e.wind).not.toBeNull();
  });

  it("groups catches by level and trend, counting the ones without pressure", () => {
    expect(pressureBand(1008)).toBe("<1010");
    expect(pressureBand(1012)).toBe("1010–1015");
    expect(pressureBand(1019)).toBe("1015–1020");
    expect(pressureBand(1023)).toBe(">1020");
    expect(trendGroup(-1.2)).toBe("falling");
    expect(trendGroup(0.3)).toBe("steady");
    const ds = emptyDataset();
    const c1 = newCatch(null, { id: "c1", caught_at: at.toISOString() });
    const c2 = newCatch(null, { id: "c2", caught_at: at.toISOString() });
    ds.catches = [c1, c2];
    ds.environment_observations = snapshotRows(withPressure(), at, ctx).map((r) => ({ ...r, created_at: "x", updated_at: "x" })) as unknown as EnvironmentObservation[];
    const r = catchPressure(ds, ds.catches);
    expect(r.withLevel).toBe(1);
    expect(r.missing).toBe(1);
    expect(r.trend.falling).toBe(1);
    expect(r.bands["1000–1010".length ? "<1010" : "<1010"]).toBe(1);
  });
});
