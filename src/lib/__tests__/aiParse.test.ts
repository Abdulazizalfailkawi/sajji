import { describe, expect, it } from "vitest";
import { coerceCandidates, extractJson } from "../aiParse";

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips code fences and surrounding text", () => {
    expect(extractJson('Here you go:\n```json\n{"a":{"b":2}}\n```\nDone')).toEqual({ a: { b: 2 } });
  });
  it("throws when there is no JSON object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("coerceCandidates", () => {
  it("turns string and percentage confidences into 0..1 numbers and fills missing fields", () => {
    const out = coerceCandidates({ candidates: [{ name_ar: "هامور", confidence: "85" }, { name_ar: "شعم", confidence: 0.4 }] }) as {
      candidates: { confidence: number; reasoning: string; matched_species_id: string }[];
    };
    expect(out.candidates[0].confidence).toBe(0.85);
    expect(out.candidates[1].confidence).toBe(0.4);
    expect(out.candidates[0].reasoning).toBe("");
    expect(out.candidates[0].matched_species_id).toBe("");
  });
  it("leaves non-objects alone", () => {
    expect(coerceCandidates(null)).toBeNull();
  });
});
