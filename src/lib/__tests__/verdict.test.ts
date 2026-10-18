import { describe, expect, it } from "vitest";
import { verdictFor } from "../verdict";
import { windLight, waveLight } from "../../config/marine";
import type { Conditions } from "../marine/types";

const T0 = Date.parse("2026-10-18T06:00:00Z");
const mk = (wind: number, gust: number, wave: number) =>
  ({
    weather: { hours: [{ t: new Date(T0).toISOString(), wind, gust, dir: 315 }] },
    marine: { hours: [{ t: new Date(T0).toISOString(), wave_h: wave }] },
  }) as unknown as Conditions;

describe("safety lights (40 hp boat)", () => {
  it("wind: <10 kn green, 10-15 yellow, >15 red, gust >20 kn red", () => {
    expect(windLight(15, 18)).toBe("green"); // 8 kn
    expect(windLight(24, 26)).toBe("yellow"); // 13 kn
    expect(windLight(32, 34)).toBe("red"); // 17 kn
    expect(windLight(20, 40)).toBe("red"); // gust 21.6 kn
  });
  it("waves: <0.5 green, 0.5-1 yellow, >1 red", () => {
    expect(waveLight(0.3)).toBe("green");
    expect(waveLight(0.7)).toBe("yellow");
    expect(waveLight(1.2)).toBe("red");
  });
  it("verdict is the worst of wind and waves", () => {
    expect(verdictFor(mk(10, 12, 1.4), T0, T0 + 3600e3)?.light).toBe("red");
    expect(verdictFor(mk(10, 12, 0.2), T0, T0 + 3600e3)?.light).toBe("green");
    expect(verdictFor(null, T0, T0)).toBeNull();
  });
});
