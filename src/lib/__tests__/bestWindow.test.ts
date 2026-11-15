import { describe, expect, it } from "vitest";
import { bestWindow, type HourIn } from "../bestWindow";

const H = 3_600_000;
const T0 = Date.UTC(2026, 10, 15, 0, 0); // an hour boundary

// wind in km/h: below 18.5 km/h (10 kn) is "green"
const mk = (winds: (number | null)[], gust?: (number | null)[], pressure?: number[]): HourIn[] =>
  winds.map((w, i) => ({ t: T0 + i * H, wind: w, gust: gust ? gust[i] : w == null ? null : w + 2, pressure: pressure?.[i] }));

describe("bestWindow", () => {
  it("picks the longest run of calm hours", () => {
    //            0   1   2   3   4   5   6   7   8
    const hours = mk([10, 10, 25, 8, 8, 8, 8, 30, 9]);
    const r = bestWindow(hours, T0, T0 + 9 * H)!;
    expect(r.start).toBe(T0 + 3 * H);
    expect(r.end).toBe(T0 + 7 * H);
    expect(r.hours).toBe(4);
    expect(r.allDay).toBe(false);
    expect(r.maxWindKmh).toBe(8);
  });

  it("ties go to the calmer run", () => {
    const hours = mk([14, 14, 30, 6, 6, 30]);
    const r = bestWindow(hours, T0, T0 + 6 * H)!;
    expect(r.start).toBe(T0 + 3 * H);
  });

  it("returns null when no run is long enough (or the wind is never calm)", () => {
    expect(bestWindow(mk([30, 25, 40, 22]), T0, T0 + 4 * H)).toBeNull();
    expect(bestWindow(mk([5, 30, 5, 30, 5]), T0, T0 + 5 * H)).toBeNull(); // single hours only
  });

  it("flags a fully calm period as all day", () => {
    const r = bestWindow(mk([5, 6, 7, 8]), T0, T0 + 4 * H)!;
    expect(r.allDay).toBe(true);
    expect(r.hours).toBe(4);
  });

  it("strong gusts make an hour unfit even if the mean wind is calm", () => {
    const hours = mk([10, 10, 10, 10], [12, 40, 12, 12]); // 40 km/h gust ≈ 21.6 kn
    const r = bestWindow(hours, T0, T0 + 4 * H)!;
    expect(r.start).toBe(T0 + 2 * H);
    expect(r.hours).toBe(2);
  });

  it("a fast pressure fall (≥3 hPa in 3 h) breaks the window", () => {
    const hours = mk([8, 8, 8, 8, 8, 8], undefined, [1015, 1015, 1015, 1014, 1011, 1008]);
    // hour 4: 1011-1015=-4 → unfit; hour 5: 1008-1015=-7 → unfit
    const r = bestWindow(hours, T0, T0 + 6 * H)!;
    expect(r.start).toBe(T0);
    expect(r.hours).toBe(4);
  });

  it("hours with no wind data are not counted as calm", () => {
    expect(bestWindow(mk([null, null, null]), T0, T0 + 3 * H)).toBeNull();
  });

  it("starts at the next whole hour when `from` is mid-hour", () => {
    const r = bestWindow(mk([5, 5, 5, 5]), T0 + 30 * 60_000, T0 + 4 * H)!;
    expect(r.start).toBe(T0 + H);
  });
});
