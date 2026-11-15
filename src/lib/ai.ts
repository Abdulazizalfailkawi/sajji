import { imageForAi } from "./media";
import { supabase } from "./supabase";
import type { AiSuggestion, Species } from "./types";

let configured: Promise<boolean> | null = null;

/** Whether the server has an AI key configured (cached per page load). */
export function aiConfigured(): Promise<boolean> {
  if (!configured)
    configured = fetch("/api/identify", { method: "GET" })
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((j) => Boolean(j.configured))
      .catch(() => {
        configured = null; // retry next time (probably offline)
        return false;
      });
  return configured;
}

export class AiError extends Error {}

export async function identifyFish(
  photo: Blob,
  species: Species[],
  lang: "ar" | "en",
  context?: { location?: string; technique?: string; depth_m?: number },
  opts: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<AiSuggestion> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new AiError("OFFLINE");
  const image = await imageForAi(photo);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const sb = supabase();
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  }
  // a hard limit so the scan screen can never hang; the caller can also cancel
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 40_000);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort);
  let res: Response;
  try {
    res = await fetch("/api/identify", {
      signal: ctrl.signal,
      method: "POST",
      headers,
      body: JSON.stringify({
        image,
        lang,
        species: species.map((s) => ({ id: s.id, name_ar: s.name_ar, name_en: s.name_en, scientific_name: s.scientific_name })),
        context,
      }),
    });
  } catch {
    if (opts.signal?.aborted) throw new AiError("CANCELLED");
    if (ctrl.signal.aborted) throw new AiError("TIMEOUT");
    throw new AiError("OFFLINE");
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new AiError(j.error ?? `HTTP_${res.status}`);
  return j as AiSuggestion;
}

export function confidenceBand(c: number): "high" | "medium" | "low" {
  return c >= 0.75 ? "high" : c >= 0.45 ? "medium" : "low";
}
