import { describe, expect, it } from "vitest";
import { DEFAULT_CYCLE, cycleForHijriDay, cycleInfo, cycleOnDate, inRange, overlaps, parseRanges } from "../tidecycle";
import { hijriForDateKey } from "../hijri";

describe("الحمل والفساد", () => {
  it("handles ranges that wrap across the month end", () => {
    expect(inRange(29, [28, 3])).toBe(true);
    expect(inRange(2, [28, 3])).toBe(true);
    expect(inRange(10, [28, 3])).toBe(false);
  });

  it("default mapping by Hijri day (bulletin: haml 27→4, small fasad from the 5th)", () => {
    for (const d of [27, 28, 30, 1, 4]) expect(cycleForHijriDay(d)).toBe("hamal");
    for (const d of [5, 8, 11]) expect(cycleForHijriDay(d)).toBe("fasad");
    for (const d of [12, 15, 19]) expect(cycleForHijriDay(d)).toBe("hamal");
    for (const d of [20, 22, 26]) expect(cycleForHijriDay(d)).toBe("fasad");
    expect(overlaps(DEFAULT_CYCLE)).toBe(false);
  });

  it("matches every day of the reference bulletin (9–15 Oct haml, 16–19 Oct fasad)", () => {
    for (let d = 9; d <= 15; d++) expect(cycleOnDate(`2026-10-${String(d).padStart(2, "0")}`)).toBe("hamal");
    for (let d = 16; d <= 19; d++) expect(cycleOnDate(`2026-10-${String(d).padStart(2, "0")}`)).toBe("fasad");
    // the bulletin calls 14 Oct the 7th day of haml and 18 Oct the 3rd day of fasad
    expect(cycleInfo("2026-10-14")).toEqual({ cycle: "hamal", day: 7 });
    expect(cycleInfo("2026-10-18")).toEqual({ cycle: "fasad", day: 3 });
  });

  it("uses the app Hijri date, including the global offset", () => {
    // 2026-10-12 = 1 Jumada al-Ula 1448 (Umm al-Qura) → Haml
    expect(hijriForDateKey("2026-10-12").day).toBe(1);
    expect(cycleOnDate("2026-10-12")).toBe("hamal");
    // offset +4 → Hijri day 5 → fasad
    expect(cycleOnDate("2026-10-12", 4)).toBe("fasad");
  });

  it("parses and validates user ranges (Arabic digits too)", () => {
    expect(parseRanges("13-18, 28-3")).toEqual([
      [13, 18],
      [28, 3],
    ]);
    expect(parseRanges("١٣-١٨، ٢٨-٣")).toEqual([
      [13, 18],
      [28, 3],
    ]);
    expect(parseRanges("40-2")).toBeNull();
    expect(parseRanges("abc")).toBeNull();
    expect(overlaps({ hamal: [[10, 15]], fasad: [[15, 20]] })).toBe(true);
  });
});
