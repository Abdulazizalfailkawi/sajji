// Models behind OpenRouter don't all support strict JSON schemas, so the reply is
// parsed defensively: strip code fences / reasoning noise and take the outermost
// JSON object. The result is still validated with zod by the caller.

export function extractJson(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("NO_JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Free models sometimes return numbers as strings ("0.8") — coerce what is safe. */
export function coerceCandidates(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = raw as { candidates?: unknown };
  if (!Array.isArray(o.candidates)) return raw;
  return {
    ...o,
    candidates: o.candidates.map((c) => {
      if (!c || typeof c !== "object") return c;
      const x = c as Record<string, unknown>;
      const conf = typeof x.confidence === "string" ? Number(x.confidence) : x.confidence;
      return {
        ...x,
        confidence: typeof conf === "number" && Number.isFinite(conf) ? (conf > 1 ? conf / 100 : conf) : 0,
        name_en: x.name_en ?? "",
        scientific_name: x.scientific_name ?? "",
        matched_species_id: x.matched_species_id ?? "",
        reasoning: x.reasoning ?? "",
      };
    }),
  };
}
