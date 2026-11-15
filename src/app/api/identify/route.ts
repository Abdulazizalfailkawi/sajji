// POST /api/identify — AI fish identification (server-side only).
//
// Provider: OpenRouter when OPENROUTER_API_KEY is set (model from OPENROUTER_MODEL),
// otherwise Anthropic. The key never leaves the server. Requests must carry the
// signed-in user's Supabase access token so the endpoint can't be used
// anonymously to spend API credit. The model only *suggests*; the client
// always asks the user to confirm or correct before anything is saved.

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { coerceCandidates, extractJson } from "@/lib/aiParse";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "inclusionai/ling-3.2-flash:free";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const useOpenRouter = () => Boolean(process.env.OPENROUTER_API_KEY);
const activeModel = () => (useOpenRouter() ? OPENROUTER_MODEL : ANTHROPIC_MODEL);

class AiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail?: string,
  ) {
    super(code);
  }
}

const RequestSchema = z.object({
  image: z
    .string()
    .min(100)
    .max(4_000_000)
    .regex(/^[A-Za-z0-9+/=]+$/, "image must be base64"),
  lang: z.enum(["ar", "en"]).default("ar"),
  species: z
    .array(
      z.object({
        id: z.string().uuid(),
        name_ar: z.string().max(80),
        name_en: z.string().max(120).nullable(),
        scientific_name: z.string().max(120).nullable(),
      }),
    )
    .max(500),
  context: z
    .object({
      location: z.string().max(100).optional(),
      technique: z.string().max(60).optional(),
      depth_m: z.number().optional(),
    })
    .optional(),
});

const OutputSchema = z.object({
  image_quality: z.enum(["good", "fair", "poor", "not_a_fish"]),
  summary: z.string(),
  candidates: z
    .array(
      z.object({
        name_ar: z.string(),
        name_en: z.string(),
        scientific_name: z.string(),
        confidence: z.number(),
        matched_species_id: z.string(),
        reasoning: z.string(),
      }),
    )
    .max(5),
});

const JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["image_quality", "summary", "candidates"],
  properties: {
    image_quality: { type: "string", enum: ["good", "fair", "poor", "not_a_fish"] },
    summary: { type: "string" },
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name_ar", "name_en", "scientific_name", "confidence", "matched_species_id", "reasoning"],
        properties: {
          name_ar: { type: "string" },
          name_en: { type: "string" },
          scientific_name: { type: "string" },
          confidence: { type: "number" },
          matched_species_id: { type: "string" },
          reasoning: { type: "string" },
        },
      },
    },
  },
};

const SYSTEM = `You identify sea animals for a fisherman in Kuwait (Arabian Gulf). You ONLY name what is in the photo.
Rules:
- Scope: marine animals only (fish, shrimp, crabs, squid, shellfish, rays, sharks, etc.). If the photo does not clearly show a sea animal (a boat, a landscape, a person, an object, anything else), set image_quality to "not_a_fish" and return no candidates. Never describe or discuss anything else.
- Give the name only. Put the single most likely species first, using its Kuwaiti/Gulf Arabic common name when you know it. Add a second or third candidate only if the photo genuinely cannot separate them.
- Do NOT explain: "summary" and every "reasoning" must be an empty string.
- confidence is a calibrated probability between 0 and 1. Never give 1.0. If you are not sure, lower it.
- scientific_name: give it only when you are confident; otherwise an empty string.
- matched_species_id: if a candidate is the same species as an entry in the user's species list, return that entry's id; otherwise an empty string. Match only when it is genuinely the same species.
- name_ar is in Arabic; name_en is the English name.`;

const JSON_SHAPE = `Reply with ONE JSON object only, no markdown, exactly this shape:
{"image_quality":"good|fair|poor|not_a_fish","summary":"...","candidates":[{"name_ar":"...","name_en":"...","scientific_name":"...","confidence":0.0,"matched_species_id":"...","reasoning":"..."}]}`;

function json(status: number, body: unknown) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

async function authorize(req: Request): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return process.env.AI_ALLOW_ANONYMOUS === "true" ? null : "AUTH_NOT_CONFIGURED";
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return "UNAUTHENTICATED";
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return "UNAUTHENTICATED";
  // AI identification is limited to the admin account.
  const admin = (process.env.ADMIN_EMAIL || "alfailkaw33@gmail.com").toLowerCase();
  if ((data.user.email ?? "").toLowerCase() !== admin) return "FORBIDDEN";
  return null;
}

export async function GET() {
  return json(200, { configured: Boolean(process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY), model: activeModel() });
}

export async function POST(req: Request) {
  if (!process.env.OPENROUTER_API_KEY && !process.env.ANTHROPIC_API_KEY) return json(503, { error: "AI_NOT_CONFIGURED" });

  const authError = await authorize(req);
  if (authError) return json(authError === "FORBIDDEN" ? 403 : 401, { error: authError });

  let body: z.infer<typeof RequestSchema>;
  try {
    body = RequestSchema.parse(await req.json());
  } catch (e) {
    return json(400, { error: "BAD_REQUEST", detail: e instanceof z.ZodError ? e.issues.slice(0, 3) : String(e) });
  }

  const speciesList = body.species
    .map((s) => `${s.id} | ${s.name_ar} | ${s.name_en ?? ""} | ${s.scientific_name ?? ""}`)
    .join("\n");
  const ctx = body.context
    ? Object.entries(body.context)
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ")
    : "";

  const userText = `Answer language: ${body.lang === "ar" ? "Arabic" : "English"}.
${ctx ? `Catch context (may help, may be wrong): ${ctx}
` : ""}The user's species list (id | Arabic | English | scientific):
${speciesList || "(empty)"}

Identify the fish in the photo.`;

  try {
    const { model, text } = useOpenRouter() ? await askOpenRouter(body.image, userText) : await askAnthropic(body.image, userText);
    const parsed = OutputSchema.safeParse(coerceCandidates(extractJson(text)));
    if (!parsed.success) return json(502, { error: "AI_BAD_OUTPUT" });

    const validIds = new Set(body.species.map((s) => s.id));
    const candidates = parsed.data.candidates.slice(0, 3).map((c) => ({
      name_ar: c.name_ar.trim(),
      name_en: c.name_en.trim(),
      scientific_name: c.scientific_name.trim() || null,
      // Never present certainty, whatever the model says.
      confidence: Math.max(0, Math.min(0.95, c.confidence)),
      matched_species_id: validIds.has(c.matched_species_id) ? c.matched_species_id : null,
      reasoning: c.reasoning.trim(),
    }));

    return json(200, {
      model,
      created_at: new Date().toISOString(),
      image_quality: parsed.data.image_quality,
      summary: parsed.data.summary.trim(),
      candidates,
    });
  } catch (e) {
    if (e instanceof AiError) return json(e.status, { error: e.code, ...(e.detail ? { detail: e.detail } : {}) });
    if (e instanceof SyntaxError || (e instanceof Error && e.message === "NO_JSON")) return json(502, { error: "AI_BAD_OUTPUT" });
    if (e instanceof Anthropic.RateLimitError) return json(429, { error: "AI_RATE_LIMITED" });
    if (e instanceof Anthropic.AuthenticationError) return json(503, { error: "AI_KEY_INVALID" });
    if (e instanceof Anthropic.BadRequestError) return json(502, { error: "AI_BAD_REQUEST", detail: e.message });
    if (e instanceof Anthropic.APIConnectionError) return json(504, { error: "AI_UNREACHABLE" });
    if (e instanceof Anthropic.APIError) return json(502, { error: "AI_ERROR", detail: e.message });
    if (e instanceof DOMException && (e.name === "TimeoutError" || e.name === "AbortError")) return json(504, { error: "AI_UNREACHABLE" });
    return json(500, { error: "SERVER_ERROR" });
  }
}

/** OpenRouter (OpenAI-compatible chat completions) — picture goes in as a data URL. */
async function askOpenRouter(imageB64: string, userText: string): Promise<{ model: string; text: string }> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      "X-Title": "Sajji",
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.2,
      max_tokens: 4000,
      messages: [
        { role: "system", content: `${SYSTEM}

${JSON_SHAPE}` },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageB64}` } },
            { type: "text", text: userText },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(50_000),
  });
  if (res.status === 401) throw new AiError(503, "AI_KEY_INVALID");
  if (res.status === 402) throw new AiError(503, "AI_NO_CREDIT");
  if (res.status === 429) throw new AiError(429, "AI_RATE_LIMITED");
  if (!res.ok) {
    let detail = "";
    try {
      detail = String(((await res.json()) as { error?: { message?: string } }).error?.message ?? "").slice(0, 200);
    } catch {}
    throw new AiError(502, "AI_ERROR", detail || `HTTP_${res.status}`);
  }
  const j = (await res.json()) as { model?: string; choices?: { message?: { content?: string | null }; finish_reason?: string }[]; error?: { message?: string } };
  if (j.error) throw new AiError(502, "AI_ERROR", String(j.error.message ?? "").slice(0, 200));
  const choice = j.choices?.[0];
  const text = choice?.message?.content ?? "";
  if (!text.trim()) throw new AiError(502, choice?.finish_reason === "length" ? "AI_TRUNCATED" : "AI_BAD_OUTPUT");
  return { model: j.model ?? OPENROUTER_MODEL, text };
}

async function askAnthropic(imageB64: string, userText: string): Promise<{ model: string; text: string }> {
  const client = new Anthropic();
  {
    const response = await client.beta.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: JSON_SCHEMA } },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageB64 } },
            { type: "text", text: userText },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new AiError(422, "AI_REFUSED");
    if (response.stop_reason === "max_tokens") throw new AiError(502, "AI_TRUNCATED");
    return { model: response.model, text: response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("") };
  }
}
