import { describe, expect, it } from "vitest";
import { tideNow, type TurnEvent } from "../marine/waqfa";

const k = (hhmm: string, day = "2026-10-15") => Date.parse(`${day}T${hhmm}:00+03:00`);
const turn = (t: number, type: "high" | "low"): TurnEvent => ({ t, h: 1, type, basis: "series", waqfaStart: null, waqfaEnd: null, uncertaintyMin: null, flat: false });
const turns = [turn(k("01:12"), "high"), turn(k("08:48"), "low"), turn(k("15:25"), "high"), turn(k("20:27"), "low"), turn(k("01:40", "2026-10-16"), "high")];

describe("tideNow", () => {
  it("10 min before a high tide: it is high tide now", () => {
    const r = tideNow(turns, k("15:15"))!;
    expect(r.kind).toBe("at_high");
    expect(r.minutes).toBe(-10);
  });
  it("20 min after a low tide: it is low tide now", () => {
    const r = tideNow(turns, k("09:08"))!;
    expect(r.kind).toBe("at_low");
    expect(r.minutes).toBe(20);
  });
  it("exactly 60 min away still counts; 61 min does not", () => {
    expect(tideNow(turns, k("16:25"))!.kind).toBe("at_high");
    expect(tideNow(turns, k("16:26"))!.kind).toBe("falling");
  });
  it("between a low and the next high the water is taking (rising) with time left", () => {
    const r = tideNow(turns, k("12:00"))!;
    expect(r.kind).toBe("rising");
    expect(r.minutes).toBe(3 * 60 + 25);
  });
  it("after a high the water is giving (falling)", () => {
    const r = tideNow(turns, k("18:00"))!;
    expect(r.kind).toBe("falling");
    expect(r.next?.type).toBe("low");
  });
  it("near midnight uses Kuwait time correctly (23:50 Kuwait = 20:50 UTC)", () => {
    const r = tideNow(turns, k("23:50"))!;
    expect(r.kind).toBe("rising");
    expect(r.minutes).toBe(110); // to 01:40 next day
    expect(tideNow(turns, Date.parse("2026-10-15T20:50:00Z"))!.minutes).toBe(110);
    expect(tideNow(turns, k("00:45", "2026-10-16"))!.kind).toBe("at_high"); // 55 min before the 01:40 high
  });
  it("no turns -> null", () => expect(tideNow([], 0)).toBeNull());
});
