"use client";

// انشر صورتك — a souvenir photo (selfie with the fish, or from the album):
// optionally linked to one of your catches (fills the fish and weight), a
// caption, and who sees it: everyone in المجتمع, or only you on your profile.
// GPS never leaves the device; the photo is stripped of metadata before upload.

import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Lock, Users, X } from "lucide-react";
import { createPost } from "@/lib/community";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { fmtDate } from "@/lib/time";
import { SpeciesChips } from "./SpeciesChips";
import { Button, Field, Notice, Select, Sheet, Textarea, cn } from "./ui";

export interface ComposerPrefill {
  photo?: Blob | null;
  species?: string;
  weight?: number | null;
  catchId?: string | null;
}

export function CommunityComposer({ open, onClose, onPosted, prefill }: { open: boolean; onClose: () => void; onPosted?: () => void; prefill?: ComposerPrefill }) {
  const { ds, idx, user } = useStore();
  const { t, name, lang } = useI18n();
  const selfie = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fish, setFish] = useState("");
  const [weight, setWeight] = useState<number | null>(null);
  const [catchId, setCatchId] = useState<string | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [vis, setVis] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPhoto(prefill?.photo ?? null);
    setWeight(prefill?.weight ?? null);
    setCatchId(prefill?.catchId ?? null);
    setFish(prefill?.species ?? "");
    setBody("");
    setPlace(null);
    setVis("public");
    setErr(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!photo) {
      setPreview(null);
      return;
    }
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [photo]);

  const recent = [...ds.catches].sort((a, b) => b.caught_at.localeCompare(a.caught_at)).slice(0, 5);
  const spots = ds.locations.filter((l) => l.lat != null).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const catchLabel = (id: string) => {
    const c = ds.catches.find((x) => x.id === id);
    const sp = c?.species_id ? idx.speciesById.get(c.species_id) : null;
    return c ? `${sp ? name(sp) : t("صيدة", "Catch")} · ${fmtDate(c.caught_at, lang)}` : "";
  };

  const linkCatch = (id: string | null) => {
    setCatchId(id);
    const c = id ? ds.catches.find((x) => x.id === id) : null;
    if (c) {
      const sp = c.species_id ? idx.speciesById.get(c.species_id) : null;
      if (sp) setFish(sp.name_ar);
      setWeight(c.weight_kg ?? null);
    }
  };

  const send = async () => {
    if (!user) return;
    if (!photo) return setErr(t("أضف الصورة أول", "Add the photo first"));
    setBusy(true);
    setErr(null);
    try {
      await createPost(user.id, { photo, body, species: fish, weight, place, catchId, visibility: vis });
      onPosted?.();
      onClose();
    } catch (e) {
      const m = (e as Error).message;
      setErr(m === "DAILY_LIMIT" ? t("وصلت الحد اليومي للنشر (٢٠ منشور). جرّب باجر.", "Daily post limit reached (20). Try tomorrow.") : m === "OFFLINE" || !navigator.onLine ? t("ما فيه إنترنت — جرّب لما يرجع الاتصال", "You're offline — try again when you're back online") : t("تعذر النشر، جرّب مرة ثانية", "Couldn't post, try again"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("صورة تذكارية مع صيدتك", "A souvenir photo with your catch")}>
      <div className="space-y-4">
        <input ref={selfie} type="file" accept="image/*" capture="user" hidden onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />
        <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && setPhoto(e.target.files[0])} />

        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="aspect-square w-full rounded-3xl object-cover" />
            <button type="button" aria-label={t("حذف الصورة", "Remove photo")} onClick={() => setPhoto(null)} className="absolute end-2.5 top-2.5 grid size-9 place-items-center rounded-full bg-abyss/70 text-white">
              <X className="size-5" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => selfie.current?.click()} className="flex h-32 flex-col items-center justify-center gap-2.5 rounded-[22px] bg-gradient-to-br from-[#f7a86b] to-[#23406b] text-abyss transition-transform active:scale-95">
              <span className="grid size-12 place-items-center rounded-full bg-abyss text-[#f7a86b]">
                <Camera className="size-6" />
              </span>
              <span className="text-[15px] font-bold">{t("سلفي بالكاميرا", "Selfie")}</span>
            </button>
            <button type="button" onClick={() => lib.current?.click()} className="glass flex h-32 flex-col items-center justify-center gap-2.5 rounded-[22px] transition-transform active:scale-95">
              <span className="grid size-12 place-items-center rounded-full bg-ocean/15 text-ocean">
                <ImagePlus className="size-6" />
              </span>
              <span className="text-[15px] font-bold">{t("من الألبوم", "From album")}</span>
            </button>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <div className="mb-1.5 text-[13px] text-muted">{t("اربطها بصيدة (اختياري)", "Link it to a catch (optional)")}</div>
            <div className="flex flex-wrap gap-1.5">
              {recent.map((c) => (
                <button key={c.id} type="button" onClick={() => linkCatch(catchId === c.id ? null : c.id)} className={cn("h-9 rounded-full border px-3 text-[13px] font-bold", catchId === c.id ? "border-ocean bg-ocean text-abyss" : "glass text-ink-2")}>
                  {catchLabel(c.id)}
                </button>
              ))}
            </div>
          </div>
        )}

        {!catchId && (
          <div>
            <div className="mb-1.5 text-[13px] text-muted">{t("نوع السمكة (اختياري)", "Fish (optional)")}</div>
            <SpeciesChips value={fish} onChange={(v) => setFish(v === fish ? "" : v)} allowTyped />
          </div>
        )}

        <Field label={t("التعليق", "Caption")} hint={`${body.length}/500`}>
          <Textarea value={body} rows={3} maxLength={500} onChange={(e) => setBody(e.target.value)} placeholder={t("اكتب شيء عن الصيدة… (اختياري)", "Say something about the catch… (optional)")} />
        </Field>

        <Field label={t("المكان (اختياري)", "Place (optional)")} hint={t("يظهر الاسم فقط، ولا تُنشر إحداثيات GPS أبداً.", "Only the name is shown; GPS coordinates are never published.")}>
          <Select value={place} onChange={setPlace} placeholder={t("بدون مكان (الافتراضي)", "No place (default)")} options={spots.map((l) => ({ value: lang === "ar" ? l.name : l.name_en || l.name, label: lang === "ar" ? l.name : l.name_en || l.name }))} />
        </Field>

        <div>
          <div className="mb-1.5 text-[13px] text-muted">{t("مين يشوفها؟", "Who can see it?")}</div>
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-abyss/60 p-1">
            {(
              [
                { k: "public" as const, l: t("الكل (المجتمع)", "Everyone"), Icon: Users },
                { k: "private" as const, l: t("أنا بس", "Only me"), Icon: Lock },
              ]
            ).map(({ k, l, Icon }) => (
              <button key={k} type="button" onClick={() => setVis(k)} aria-pressed={vis === k} className={cn("flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-[13px] font-bold", vis === k ? "bg-ocean text-abyss" : "text-muted")}>
                <Icon className="size-4" /> {l}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-muted">
            {vis === "public"
              ? t("تظهر لكل مسجّلي سجي بالمجتمع وبحسابك. الصورة تنرفع بدون بيانات الموقع المخفية فيها.", "Shown to all signed-in users in the community and on your profile. Hidden location data in the photo is removed.")
              : t("تظهر بحسابك أنت بس، وما تطلع بالمجتمع.", "Shown only on your profile, not in the community.")}
          </p>
        </div>

        {err && <Notice tone="bad">{err}</Notice>}
        <Button size="lg" className="w-full" loading={busy} onClick={send}>
          {t("انشر", "Post")}
        </Button>
      </div>
    </Sheet>
  );
}
