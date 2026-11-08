import { describe, expect, it } from "vitest";
import { moonEvents, overlaps, solunarDay } from "../solunar";

// Kuwait City, Monday 9 Nov 2026 (UTC+3). Reference values published for that day by
// tides4fishing: moonrise 06:09, lunar transit 11:26, moonset 16:44.
const kw = (h: number, m = 0) => Date.parse(`2026-11-09T00:00:00+03:00`) + (h * 60 + m) * 60_000;
const LAT = 29.3759;
const LNG = 47.9774;

describe("solunar", () => {
  const ev = moonEvents(kw(0), kw(24), LAT, LNG);

  it("moonrise / transit / moonset match the published times within a few minutes", () => {
    expect(Math.abs(ev.rise[0] - kw(6, 9))).toBeLessThan(8 * 60_000);
    expect(Math.abs(ev.transit[0] - kw(11, 26))).toBeLessThan(8 * 60_000);
    expect(Math.abs(ev.set[0] - kw(16, 44))).toBeLessThan(8 * 60_000);
  });

  it("the antitransit is about 12 h from the transit", () => {
    const gap = Math.abs(ev.antitransit[0] - ev.transit[0]);
    expect(gap).toBeGreaterThan(11 * 3_600_000);
    expect(gap).toBeLessThan(13.5 * 3_600_000);
  });

  it("builds major (2 h) and minor (1 h) periods, in time order", () => {
    const p = solunarDay(kw(0), LAT, LNG);
    expect(p.length).toBeGreaterThanOrEqual(3);
    for (const x of p) expect(x.end - x.start).toBe(x.kind === "major" ? 2 * 3_600_000 : 3_600_000);
    for (let i = 1; i < p.length; i++) expect(p[i].at).toBeGreaterThanOrEqual(p[i - 1].at);
    expect(p.filter((x) => x.kind === "major").length).toBeGreaterThanOrEqual(1);
  });

  it("overlap needs at least 15 minutes", () => {
    expect(overlaps({ start: 0, end: 60 * 60_000 }, { start: 50 * 60_000, end: 120 * 60_000 })).toBe(false);
    expect(overlaps({ start: 0, end: 60 * 60_000 }, { start: 30 * 60_000, end: 120 * 60_000 })).toBe(true);
  });
});
