import { describe, expect, it } from "vitest";
import { calibrateConditions } from "../marine/client";
import { WIND_FACTOR, windSeaHeightM, windLight, waveLight } from "../../config/marine";
import type { Conditions } from "../marine/types";

const T = "2026-10-18T12:00:00.000Z";
const mk = (wind: number, gust: number, wave: number | null) =>
  ({
    weather: { hours: [{ t: T, wind, gust, dir: 300 }] },
    marine: { hours: [{ t: T, wave_h: wave }] },
    current: null,
  }) as unknown as Conditions;

describe("wind & wave calibration", () => {
  it("multiplies the model wind by the airport-fitted factor and keeps gust >= wind", () => {
    const c = calibrateConditions(mk(18, 20, 0.1));
    expect(c.weather.hours[0].wind).toBeCloseTo(18 * WIND_FACTOR, 1);
    expect(c.weather.hours[0].gust!).toBeGreaterThanOrEqual(c.weather.hours[0].wind!);
  });
  it("never lowers the model wave height; raises it to the wind-sea estimate", () => {
    expect(calibrateConditions(mk(20, 25, 2.0)).marine.hours[0].wave_h).toBe(2.0);
    const w = calibrateConditions(mk(20, 25, 0.1)).marine.hours[0].wave_h!;
    expect(w).toBeGreaterThan(0.3);
    expect(w).toBe(windSeaHeightM(20 * WIND_FACTOR));
  });
  it("is not applied twice (works on a copy)", () => {
    const raw = mk(10, 12, 0.1);
    calibrateConditions(raw);
    expect(raw.weather.hours[0].wind).toBe(10);
  });
  it("a 12 km/h model wind (typical 'calm' day) gives yellow (~10 kn); 25 km/h model wind turns red", () => {
    expect(windLight(12 * WIND_FACTOR, 0)).toBe("yellow"); // 18.6 km/h = 10 kn
    expect(windLight(25 * WIND_FACTOR, 0)).toBe("red");
    expect(waveLight(windSeaHeightM(25 * WIND_FACTOR))).not.toBe("green");
  });
});
