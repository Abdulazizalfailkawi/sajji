import { describe, expect, it } from "vitest";
import { bandOfHour, insightFor, kuwaitHour, waterOfTide } from "../speciesInsight";

describe("speciesInsight", () => {
  it("maps tide movement to saji / thabr / waqfa", () => {
    expect(waterOfTide("rising")).toBe("saji");
    expect(waterOfTide("falling")).toBe("thabr");
    expect(waterOfTide("high")).toBe("waqfa");
    expect(waterOfTide("low")).toBe("waqfa");
    expect(waterOfTide(null)).toBeNull();
  });

  it("splits the day into bands", () => {
    expect(bandOfHour(4)).toBe("dawn");
    expect(bandOfHour(8)).toBe("morning");
    expect(bandOfHour(12)).toBe("noon");
    expect(bandOfHour(16)).toBe("afternoon");
    expect(bandOfHour(19)).toBe("sunset");
    expect(bandOfHour(23)).toBe("night");
    expect(bandOfHour(1)).toBe("night");
  });

  it("uses Kuwait time (UTC+3), not UTC", () => {
    expect(kuwaitHour("2026-11-15T02:30:00Z")).toBe(5);
  });

  it("returns null with no catches", () => {
    expect(insightFor([])).toBeNull();
  });

  it("computes shares and the most common water / band from the user's own catches only", () => {
    const r = insightFor([
      { at: "2026-11-12T02:40:00Z", cycle: "hamal", tide: "falling" }, // 05:40 Kuwait → dawn
      { at: "2026-11-12T03:15:00Z", cycle: "hamal", tide: "falling" }, // 06:15 → morning
      { at: "2026-11-09T01:50:00Z", cycle: "hamal", tide: "falling" }, // 04:50 → dawn
      { at: "2026-11-05T04:10:00Z", cycle: "fasad", tide: "rising" }, // 07:10 → morning
    ])!;
    expect(r.count).toBe(4);
    expect(r.hamal).toBe(75);
    expect(r.fasad).toBe(25);
    expect(r.between).toBe(0);
    expect(r.water).toEqual({ key: "thabr", count: 3 });
    expect(r.waterKnown).toBe(4);
    expect(r.band?.count).toBe(2);
  });

  it("ignores catches with no tide record when counting water, and says how many were known", () => {
    const r = insightFor([
      { at: "2026-11-12T02:40:00Z", cycle: "fasad", tide: null },
      { at: "2026-11-12T03:15:00Z", cycle: "fasad", tide: "rising" },
    ])!;
    expect(r.water).toEqual({ key: "saji", count: 1 });
    expect(r.waterKnown).toBe(1);
  });
});
