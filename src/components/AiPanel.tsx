"use client";

import { useEffect, useState } from "react";
import { Sparkles, TriangleAlert } from "lucide-react";
import { AiError, aiConfigured, confidenceBand, identifyFish } from "@/lib/ai";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { normalizeName } from "@/lib/normalize";
import type { AiCandidate, AiSuggestion, IdentificationStatus } from "@/lib/types";
import { loadMediaBlob } from "@/lib/useMedia";
import { NewSpeciesForm } from "./pickers";
import { Badge, Button, Notice, Progress, Sheet } from "./ui";

/**
 * Runs AI identification on a photo and lets the user confirm or correct.
 * Nothing is saved until the user picks a species; the AI is never treated
 * as certain.
 */
export function AiPanel({
  photoMediaId,
  suggestion,
  context,
  onSuggestion,
  onPick,
  onDefer,
}: {
  photoMediaId: string;
  suggestion: AiSuggestion | null;
  context?: { location?: string; technique?: string; depth_m?: number };
  onSuggestion: (s: AiSuggestion) => void;
  onPick: (speciesId: string, status: IdentificationStatus) => void;
  onDefer?: () => void;
}) {
  const { ds, online } = useStore();
  const { t, lang, name } = useI18n();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState<AiCandidate | null>(null);

  useEffect(() => {
    if (online) void aiConfigured().then(setEnabled);
  }, [online]);

  const run = async () => {
    const media = ds.media.find((m) => m.id === photoMediaId);
    if (!media) return;
    setBusy(true);
    setErr(null);
    try {
      const blob = await loadMediaBlob(media);
      if (!blob) throw new AiError("NO_PHOTO");
      onSuggestion(await identifyFish(blob, ds.species, lang, context));
    } catch (e) {
      const code = (e as Error).message;
      setErr(
        {
          OFFLINE: t("لا يوجد اتصال — يمكنك الحفظ والتعرّف لاحقاً.", "You're offline — save now and identify later."),
          AI_NOT_CONFIGURED: t("الذكاء الاصطناعي غير مُفعّل (يحتاج مفتاح API على الخادم).", "AI isn't configured (needs an API key on the server)."),
          AI_KEY_INVALID: t("مفتاح API غير صالح.", "The API key is invalid."),
          UNAUTHENTICATED: t("سجّل الدخول لاستخدام التعرّف بالذكاء الاصطناعي.", "Sign in to use AI identification."),
          AUTH_NOT_CONFIGURED: t("التعرّف بالذكاء الاصطناعي يتطلب حساباً.", "AI identification requires an account."),
          AI_RATE_LIMITED: t("طلبات كثيرة — حاول بعد دقيقة.", "Too many requests — try again in a minute."),
          AI_NO_CREDIT: t("رصيد الذكاء الاصطناعي خلص.", "AI credit has run out."),
          AI_BAD_OUTPUT: t("ما قدر يقرأ الصورة زين — جرّب صورة ثانية أو اختر النوع يدوياً.", "Couldn't read the photo — try another or choose the species manually."),
          AI_UNREACHABLE: t("الذكاء الاصطناعي ما استجاب — حاول مرة ثانية.", "The AI didn't respond — try again."),
          NO_PHOTO: t("الصورة غير متوفرة على هذا الجهاز.", "The photo isn't available on this device."),
        }[code] ?? t(`تعذر التعرّف (${code}). اختر النوع يدوياً.`, `Identification failed (${code}). Choose the species manually.`),
      );
    } finally {
      setBusy(false);
    }
  };

  // Match candidates to the user's species list by id, then by normalised names.
  const resolve = (c: AiCandidate): string | null => {
    if (c.matched_species_id && ds.species.some((s) => s.id === c.matched_species_id)) return c.matched_species_id;
    const keys = [c.name_ar, c.name_en, c.scientific_name].map(normalizeName).filter(Boolean);
    return (
      ds.species.find((s) => [s.name_ar, s.name_en, s.scientific_name, ...s.aliases].map(normalizeName).some((k) => k && keys.includes(k)))?.id ?? null
    );
  };

  const pick = (c: AiCandidate, i: number) => {
    const id = resolve(c);
    if (!id) return setCreating(c);
    onPick(id, i === 0 ? "ai_confirmed" : "ai_corrected");
  };

  if (!suggestion) {
    return (
      <div className="space-y-2">
        <Button variant="secondary" className="w-full" loading={busy} disabled={!online || enabled === false} onClick={run}>
          <Sparkles className="size-4 text-teal" />
          {!online
            ? t("التعرّف بالذكاء الاصطناعي يحتاج إنترنت", "AI identification needs internet")
            : enabled === false
              ? t("الذكاء الاصطناعي غير مُفعّل", "AI not configured")
              : t("تعرّف على السمكة بالذكاء الاصطناعي", "Identify with AI")}
        </Button>
        {!online && onDefer && (
          <button type="button" className="w-full text-center text-sm text-teal" onClick={onDefer}>
            {t("علّمها للتعرّف لاحقاً عند الاتصال", "Mark to identify later when online")}
          </button>
        )}
        {err && <Notice tone="warn">{err}</Notice>}
      </div>
    );
  }

  const bandLabel = { high: t("ثقة عالية", "High confidence"), medium: t("ثقة متوسطة", "Medium confidence"), low: t("ثقة منخفضة", "Low confidence") };
  return (
    <div className="space-y-3 rounded-xl border border-ocean/30 bg-ocean/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-teal" /> {t("اقتراح الذكاء الاصطناعي", "AI suggestion")}
        {suggestion.image_quality !== "good" && (
          <Badge tone="warn">
            <TriangleAlert className="size-3" />
            {{ fair: t("صورة مقبولة", "Fair photo"), poor: t("صورة غير واضحة", "Unclear photo"), not_a_fish: t("لا تظهر سمكة", "No fish visible"), good: "" }[suggestion.image_quality]}
          </Badge>
        )}
      </div>
      <p className="text-sm text-ink-2">{suggestion.summary}</p>
      {suggestion.candidates.map((c, i) => {
        const local = resolve(c);
        const band = confidenceBand(c.confidence);
        return (
          <div key={i} className="rounded-xl bg-surface-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-medium">
                  {local ? name(ds.species.find((s) => s.id === local)) : lang === "ar" ? c.name_ar : c.name_en}
                </div>
                <div className="text-xs text-muted">
                  {lang === "ar" ? c.name_en : c.name_ar}
                  {c.scientific_name && <i> · {c.scientific_name}</i>}
                  {!local && <span className="text-warn"> · {t("غير موجود في قائمتك", "not in your list")}</span>}
                </div>
              </div>
              <Badge tone={band === "high" ? "good" : band === "medium" ? "warn" : "bad"}>
                {Math.round(c.confidence * 100)}% · {bandLabel[band]}
              </Badge>
            </div>
            <div className="my-2">
              <Progress value={c.confidence} tone={band === "high" ? "good" : "ocean"} />
            </div>
            {c.reasoning && <p className="text-xs text-muted">{c.reasoning}</p>}
            <Button size="sm" variant={i === 0 ? "teal" : "secondary"} className="mt-2" onClick={() => pick(c, i)}>
              {local ? t("تأكيد هذا النوع", "Confirm this species") : t("إضافته كنوع جديد", "Add as new species")}
            </Button>
          </div>
        );
      })}
      {suggestion.candidates.length === 0 && <Notice tone="warn">{t("لم يتمكن من اقتراح نوع. اختر يدوياً.", "No species suggested. Choose manually.")}</Notice>}
      <p className="text-xs text-muted">
        {t(
          "الذكاء الاصطناعي قد يخطئ — تأكد بنفسك أو اختر النوع يدوياً من القائمة أدناه.",
          "AI can be wrong — check it yourself, or pick the species manually below.",
        )}{" "}
        <button type="button" className="text-teal" onClick={run}>
          {t("إعادة المحاولة", "Retry")}
        </button>
      </p>

      <Sheet open={!!creating} onClose={() => setCreating(null)} title={t("نوع جديد", "New species")}>
        {creating && (
          <NewSpeciesForm
            initial={{ name_ar: creating.name_ar, name_en: creating.name_en, scientific_name: creating.scientific_name ?? "" }}
            onDone={(id) => {
              const idxC = suggestion.candidates.indexOf(creating);
              setCreating(null);
              if (id) onPick(id, idxC === 0 ? "ai_confirmed" : "ai_corrected");
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
