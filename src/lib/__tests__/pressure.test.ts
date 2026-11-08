import { describe, expect, it } from "vitest";
import { classifyTrend, pressureAt } from "../pressure";

const H = 3_600_000;
const T0 = Date.parse("2026-11-09T12:00:00Z");
const hrs = (vals: number[]) => vals.map((p, i) => ({ t: new Date(T0 + (i - vals.length + 1) * H).toISOString(), pressure: p }));

describe("barometric pressure", () => {
  it("classifies the 3-hour change", () => {
    expect(classifyTrend(-3.2)).toBe("falling_fast");
    expect(classifyTrend(-1.4)).toBe("falling");
    expect(classifyTrend(0.4)).toBe("steady");
    expect(classifyTrend(1.1)).toBe("rising");
    expect(classifyTrend(3)).toBe("rising_fast");
  });

  it("reads the value and the change since 3 h earlier", () => {
    const p = pressureAt(hrs([1016, 1015, 1014, 1012, 1011]), T0);
    expect(p).toEqual({ hpa: 1011, delta3h: -4, trend: "falling_fast" });
  });

  it("no earlier value → no trend; no data → null", () => {
    const p = pressureAt(hrs([1013]), T0);
    expect(p?.hpa).toBe(1013);
    expect(p?.trend).toBeNull();
    expect(pressureAt([{ t: new Date(T0).toISOString(), pressure: null }], T0)).toBeNull();
    expect(pressureAt([], T0)).toBeNull();
  });
});
