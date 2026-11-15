"use client";

// سجّل صيدة — one flow from the camera button: photo (or album) → AI names the
// fish (admin only for now; everyone else picks it) → confirm: fish, the sea
// conditions filled in for you, method, place → saved into صيدي.
// `QuickCatchSheet` is also used from a trip page to add a fish to that trip.

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, LocateFixed, Sparkles, X } from "lucide-react";
import { AiError, aiConfigured, identifyFish } from "@/lib/ai";
import { useIsAdmin } from "@/lib/admin";
import { findSpeciesByName } from "@/lib/commonFish";
import { useStore } from "@/lib/db/store";
import { newCatch } from "@/lib/factory";
import { getGps } from "@/lib/gps";
import { useI18n } from "@/lib/i18n";
import { envAt, type NowEnv } from "@/lib/marine/nowEnv";
import { presetRank } from "@/lib/marine/presets";
import { snapshotCatch } from "@/lib/marine/snapshots";
import { normalizeName } from "@/lib/normalize";
import { WATER_LABEL } from "@/lib/speciesInsight";
import { resolveSpecies } from "@/lib/speciesLookup";
import { cycleShortLabel, readCycleConfig } from "@/lib/tidecycle";
import { dateKey, fmtDate, fmtTime } from "@/lib/time";
import { isActiveStatus, type AiSuggestion, type IdentificationStatus, type Media } from "@/lib/types";
import { loadMediaBlob } from "@/lib/useMedia";
import { Photo } from "./common";
import { SpeciesChips } from "./SpeciesChips";
import { useToast } from "./Toast";
import { Button, Notice, Select, Sheet, cn } from "./ui";

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const HIDDEN = ["/catch/edit", "/trip/edit", "/login", "/reset-password"];

type Target = "active" | "past" | "none";
type Step = "pick" | "scan" | "result";

export function QuickCatchSheet({ open, onClose, fixedTripId }: { open: boolean; onClose: () => void; fixedTripId?: string }) {
  const store = useStore();
  const { ds, idx, save, addPhoto, online, hijriOffset } = store;
  const { t, lang, name } = useI18n();
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("pick");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [fish, setFish] = useState("");
  const [ai, setAi] = useState<{ suggestion: AiSuggestion; top: string | null; conf: number | null } | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const aiCtl = useRef<AbortController | null>(null);
  const [loc, setLoc] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [tech, setTech] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>("none");
  const [pastId, setPastId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [env, setEnv] = useState<NowEnv | null>(null);

  const active = ds.trips.find((x) => isActiveStatus(x.status)) ?? null;
  const spots = ds.locations
    .filter((l) => l.lat != null && l.lng != null)
    .sort((a, b) => {
      const ra = presetRank(a.name);
      const rb = presetRank(b.name);
      if (ra >= 0 || rb >= 0) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
      return Number(!!b.is_favorite) - Number(!!a.is_favorite) || a.name.localeCompare(b.name, "ar");
    });
  const pastTrips = [...ds.trips].filter((x) => x.status !== "cancelled" && x.id !== active?.id).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 40);
  const fixed = fixedTripId ? idx.tripById.get(fixedTripId) ?? null : null;
  const techniques = [...ds.techniques].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const tripLabel = (id: string) => {
    const tr = idx.tripById.get(id);
    if (!tr) return "";
    return `${fmtDate(tr.started_at, lang)} · ${tr.title || (tr.location_id && idx.locById.get(tr.location_id)?.name) || t("رحلة", "Trip")}`;
  };

  // Reset every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    let spot: string | null = null;
    try {
      spot = localStorage.getItem("ft.marineSpot");
    } catch {}
    const base = fixed ?? active;
    setStep("pick");
    setLoc(base?.location_id ?? (spot && idx.locById.has(spot) ? spot : null));
    setFish("");
    setAi(null);
    setAiNote(null);
    setPhoto(null);
    setGps(null);
    setErr(null);
    setEnv(null);
    setTech(base?.technique_id ?? null);
    setTarget(fixed ? "past" : active ? "active" : "none");
    setPastId(fixed?.id ?? null);
    setNow(Date.now());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sea conditions at the chosen place, right now (shown now, saved with the catch).
  const spotRow = loc ? idx.locById.get(loc) ?? null : null;
  const coords = gps ?? (spotRow?.lat != null && spotRow?.lng != null ? { lat: spotRow.lat, lng: spotRow.lng } : null);
  useEffect(() => {
    if (!open || step !== "result") return;
    setEnv(null);
    if (!coords) return;
    let dead = false;
    void envAt(coords.lat, coords.lng, now).then((e) => !dead && setEnv(e)).catch(() => !dead && setEnv({ water: null, pressure: null }));
    return () => {
      dead = true;
    };
  }, [open, step, coords?.lat, coords?.lng, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const chosenTrip = fixed ?? (target === "active" ? active : target === "past" && pastId ? idx.tripById.get(pastId) ?? null : null);

  const runAi = async (media: Media) => {
    setStep("scan");
    setAiNote(null);
    const ctl = new AbortController();
    aiCtl.current = ctl;
    try {
      const blob = await loadMediaBlob(media); // the row addPhoto just returned (the store may not hold it yet)
      if (!blob) throw new AiError("NO_PHOTO");
      const s = await identifyFish(blob, ds.species, lang, { location: spotRow?.name, technique: tech ? name(idx.techById.get(tech)) : undefined }, { signal: ctl.signal });
      const top = s.image_quality === "not_a_fish" ? null : s.candidates[0] ?? null;
      if (top) {
        setFish(top.name_ar);
        setAi({ suggestion: s, top: top.name_ar, conf: top.confidence });
      } else {
        setAi({ suggestion: s, top: null, conf: null });
        setAiNote(t("ما قدرت أتعرف على سمكة بالصورة — اختر النوع بنفسك", "Couldn't see a fish in the photo — pick it yourself"));
      }
    } catch (e) {
      const code = (e as Error).message;
      setAiNote(
        code === "CANCELLED"
          ? null
          : code === "TIMEOUT"
            ? t("الذكاء الاصطناعي تأخر — اختر النوع بنفسك أو جرّب مرة ثانية", "The AI took too long — pick the fish yourself or try again")
            : code === "AI_NO_CREDIT"
          ? t("رصيد الذكاء الاصطناعي خلص — اختر النوع بنفسك", "AI credit is used up — pick the fish yourself")
          : code === "AI_RATE_LIMITED"
            ? t("الذكاء الاصطناعي مزدحم — اختر النوع بنفسك أو جرّب بعد دقيقة", "AI is busy — pick it yourself or try in a minute")
              : t(`تعذر التعرّف (${code}) — اختر النوع بنفسك`, `Couldn't identify (${code}) — pick the fish yourself`),
      );
    } finally {
      setStep("result");
    }
  };

  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      const m = await addPhoto(f);
      setPhoto(m.id);
      setNow(Date.now());
      const enabled = isAdmin && online && (await aiConfigured());
      if (enabled) await runAi(m);
      else setStep("result");
    } catch {
      setErr(t("تعذرت قراءة الصورة، جرّب مرة ثانية", "Couldn't read that photo, try again"));
    } finally {
      setBusy(false);
      if (cam.current) cam.current.value = "";
      if (lib.current) lib.current.value = "";
    }
  };

  const locate = async () => {
    setGpsBusy(true);
    setErr(null);
    try {
      const pt = await getGps();
      setGps(pt);
      const near = spots.map((l) => ({ l, d: km(pt, { lat: l.lat!, lng: l.lng! }) })).sort((a, b) => a.d - b.d)[0];
      if (near && near.d <= 5) setLoc(near.l.id);
    } catch (e) {
      setErr((e as Error).message === "DENIED" ? t("تم رفض إذن الموقع — اختر المكان من القائمة", "Location permission denied — pick a spot from the list") : t("تعذر تحديد موقعك — اختر المكان من القائمة", "Couldn't get your location — pick a spot from the list"));
    } finally {
      setGpsBusy(false);
    }
  };

  const doSave = async () => {
    if (target === "past" && !chosenTrip) return setErr(t("اختر الرحلة", "Pick a trip"));
    setSaving(true);
    try {
      const speciesId = fish ? await resolveSpecies(ds, save, fish) : null;
      let status: IdentificationStatus = speciesId ? "manual" : "unidentified";
      let aiSpecies: string | null = null;
      if (ai?.top) {
        aiSpecies = findSpeciesByName(ds.species, ai.top)?.id ?? null;
        status = fish && normalizeName(fish) === normalizeName(ai.top) ? "ai_confirmed" : speciesId ? "ai_corrected" : "unidentified";
      }
      const c = newCatch(chosenTrip, {
        photo_media_id: photo,
        species_id: speciesId,
        identification_status: status,
        ai_species_id: aiSpecies,
        ai_suggestion: ai?.suggestion ?? null,
        location_id: loc,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
        technique_id: tech ?? chosenTrip?.technique_id ?? null,
      });
      await save("catches", c);
      void snapshotCatch(store, c); // sea conditions (incl. pressure) for this catch right away
      onClose();
      toast(
        chosenTrip
          ? t(`حُفظت الصيدة في رحلة «${tripLabel(chosenTrip.id)}» وأُضيفت لإحصائياتك`, `Catch saved to trip “${tripLabel(chosenTrip.id)}” and counted in your stats`)
          : t("انحفظت الصيدة في صيدي ✓", "Catch saved to My catches ✓"),
        { label: t("أكمل التفاصيل", "Add details"), href: `/catch/edit?id=${c.id}` },
      );
    } catch {
      setErr(t("تعذر الحفظ، جرّب مرة ثانية", "Couldn't save, try again"));
    } finally {
      setSaving(false);
    }
  };

  const cyc = cycleShortLabel(dateKey(new Date(now)), hijriOffset, readCycleConfig());
  const pill = (on: boolean) => cn("h-10 rounded-full border px-4 text-sm font-bold transition-transform active:scale-95", on ? "border-ocean bg-ocean text-abyss" : "glass text-ink-2");

  return (
    <>
      <Sheet open={open && step !== "scan"} onClose={onClose} title={fixed ? t("أضف سمكة للرحلة", "Add a fish to this trip") : t("سجّل صيدة", "Log a catch")}>
        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files)} />
        <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files)} />

        {step === "pick" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2.5">
              <button type="button" disabled={busy} onClick={() => cam.current?.click()} className="glass flex h-28 flex-col items-center justify-center gap-2 rounded-[20px] text-[15px] font-bold transition-transform active:scale-95 disabled:opacity-60">
                {busy ? <Loader2 className="size-7 animate-spin text-ocean" /> : <Camera className="size-7 text-ocean" />}
                {t("صوّر السمكة", "Take a photo")}
              </button>
              <button type="button" disabled={busy} onClick={() => lib.current?.click()} className="glass flex h-28 flex-col items-center justify-center gap-2 rounded-[20px] text-[15px] font-bold transition-transform active:scale-95 disabled:opacity-60">
                <ImagePlus className="size-7 text-ocean" />
                {t("من الألبوم", "From album")}
              </button>
            </div>
            {isAdmin && <p className="text-center text-xs text-mint">{t("الذكاء الاصطناعي يتعرّف على السمكة بعد التصوير", "AI names the fish after the photo")}</p>}
            {err && <Notice tone="bad">{err}</Notice>}
            <button type="button" onClick={() => setStep("result")} className="block w-full py-2 text-center text-sm font-semibold text-ocean">
              {t("سجّلها بدون صورة", "Log it without a photo")}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {photo && (
              <div className="relative h-36 overflow-hidden rounded-3xl">
                <Photo mediaId={photo} variant="full" className="h-full w-full" />
                {ai?.top && <div className="absolute end-3 top-3 flex items-center gap-1 rounded-[10px] bg-abyss/75 px-2.5 py-1 text-xs font-bold text-mint"><Sparkles className="size-3.5" /> {t("تعرّفت عليها", "Identified")}</div>}
                <button type="button" aria-label={t("حذف الصورة", "Remove photo")} onClick={() => { setPhoto(null); setAi(null); setAiNote(null); setStep("pick"); }} className="absolute start-3 top-3 grid size-9 place-items-center rounded-full bg-abyss/75 text-white">
                  <X className="size-4" />
                </button>
              </div>
            )}

            <div>
              <div className="flex items-end justify-between gap-2">
                <div className="text-3xl font-bold leading-tight">{fish || <span className="text-xl text-muted">{t("اختر السمكة", "Pick the fish")}</span>}</div>
                {ai?.top && fish && normalizeName(fish) === normalizeName(ai.top) && ai.conf != null && <div className="shrink-0 text-[13px] text-muted">{t(`متأكد ${Math.round(ai.conf * 100)}٪`, `${Math.round(ai.conf * 100)}% sure`)}</div>}
              </div>
              {ai?.top && ai.conf != null && fish && normalizeName(fish) === normalizeName(ai.top) && (
                <div className="mt-2 h-1.5 rounded bg-white/10">
                  <div className="h-1.5 rounded bg-gradient-to-l from-mint to-ocean" style={{ width: `${Math.round(ai.conf * 100)}%` }} />
                </div>
              )}
            </div>
            {aiNote && <Notice tone="warn">{aiNote}</Notice>}

            <div>
              <div className="mb-1.5 text-[13px] text-muted">{ai?.top ? t("مو هذي؟ اختر الصح", "Not this one? Pick the right one") : t("نوع السمكة", "Fish")}</div>
              <SpeciesChips value={fish} onChange={setFish} allowTyped extra={ai?.top ? [ai.top] : []} />
            </div>

            <div className="glass grid grid-cols-2 gap-2.5 rounded-[20px] p-3">
              <div>
                <div className="text-[11px] text-muted">{t("التاريخ والساعة", "Date & time")}</div>
                <div className="text-[15px] font-bold leading-tight">{fmtTime(now, lang)}</div>
                <div className="text-xs text-ink-2">{fmtDate(now, lang)}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted">{t("حمل أو فساد", "Haml / Fasad")}</div>
                <div className={cn("text-[15px] font-bold", cyc.cycle === "hamal" ? "text-mint" : cyc.cycle === "fasad" ? "text-warn" : "text-ocean")}>{lang === "ar" ? cyc.ar : cyc.en}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted">{t("المد والجزر", "Tide")}</div>
                <div className="text-[15px] font-bold">{env?.water ? WATER_LABEL[env.water][lang] : coords ? "…" : "—"}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted">{t("الضغط", "Pressure")}</div>
                <div className="text-[15px] font-bold">{env?.pressure != null ? `${env.pressure} hPa` : coords ? "…" : "—"}</div>
              </div>
              <div className="col-span-2 text-xs text-mint">{coords ? t("✓ ينحفظون تلقائي — ما تحتاج تكتب شي", "✓ Saved automatically — nothing to type") : t("اختر المكان تحت عشان تنحسب حالة البحر", "Pick the place below to get the sea conditions")}</div>
            </div>

            <div>
              <div className="mb-1.5 text-[13px] text-muted">{t("طريقة الصيد", "Method")}</div>
              <div className="flex flex-wrap gap-1.5">
                {techniques.map((x) => (
                  <button key={x.id} type="button" onClick={() => setTech(tech === x.id ? null : x.id)} className={pill(tech === x.id)}>
                    {name(x)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-1.5 text-[13px] text-muted">{t("المكان", "Place")}</div>
              <div className="flex flex-wrap gap-1.5">
                <button type="button" disabled={gpsBusy} onClick={locate} className={cn("flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold", gps ? "border-mint text-mint" : "glass text-ink-2")}>
                  {gpsBusy ? <Loader2 className="size-4 animate-spin" /> : <LocateFixed className="size-4" />} {gps ? t("موقعي ✓", "My location ✓") : t("موقعي الحين", "My location")}
                </button>
                {spots.slice(0, 6).map((l) => (
                  <button key={l.id} type="button" onClick={() => { setLoc(l.id); setGps(null); }} className={pill(!gps && loc === l.id)}>
                    {lang === "ar" ? l.name : l.name_en || l.name}
                  </button>
                ))}
              </div>
              {spots.length > 6 && (
                <div className="mt-2">
                  <Select value={spots.slice(6).some((l) => l.id === loc) && !gps ? loc : null} onChange={(v) => { setLoc(v); setGps(null); }} placeholder={t("أماكن ثانية…", "More places…")} options={spots.slice(6).map((l) => ({ value: l.id, label: lang === "ar" ? l.name : l.name_en || l.name }))} />
                </div>
              )}
            </div>

            {fixed ? (
              <Notice tone="info">{t(`تُضاف إلى الرحلة: ${tripLabel(fixed.id)}`, `Added to trip: ${tripLabel(fixed.id)}`)}</Notice>
            ) : (
              <div>
                <div className="mb-1.5 text-[13px] text-muted">{t("أضفها إلى", "Add it to")}</div>
                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-abyss/60 p-1">
                  {(
                    [
                      { id: "active" as const, l: t("الرحلة الجارية", "Active trip"), off: !active },
                      { id: "past" as const, l: t("رحلة سابقة", "Earlier trip"), off: false },
                      { id: "none" as const, l: t("بدون رحلة", "No trip"), off: false },
                    ]
                  )
                    .filter((o) => !o.off)
                    .map((o) => (
                      <button key={o.id} type="button" onClick={() => setTarget(o.id)} className={cn("min-h-11 rounded-xl px-1 text-[13px] font-bold", target === o.id ? "bg-ocean text-abyss" : "text-muted")}>
                        {o.l}
                      </button>
                    ))}
                </div>
                {target === "active" && active && <div className="mt-1.5 text-xs text-muted">{tripLabel(active.id)}</div>}
                {target === "past" && (
                  <div className="mt-2">
                    <Select value={pastId} onChange={setPastId} placeholder={pastTrips.length ? t("اختر الرحلة…", "Pick the trip…") : t("ما عندك رحلات سابقة", "No earlier trips")} options={pastTrips.map((x) => ({ value: x.id, label: tripLabel(x.id) }))} />
                  </div>
                )}
              </div>
            )}

            {err && <Notice tone="bad">{err}</Notice>}
            <Button size="lg" className="w-full" loading={saving} onClick={doSave}>
              {saving ? <Loader2 className="size-5 animate-spin" /> : null} {t("حفظ في صيدي", "Save to My catches")}
            </Button>
          </div>
        )}
      </Sheet>

      {open && step === "scan" && (
        <div className="fixed inset-0 z-[70] flex flex-col items-center justify-center gap-5 bg-abyss/95 p-6 backdrop-blur-md">
          <div className="relative size-72 overflow-hidden rounded-[32px] shadow-[0_0_0_1px_rgb(95_211_168/0.4),0_0_60px_rgb(95_211_168/0.18)]">
            {photo && <Photo mediaId={photo} variant="full" className="h-full w-full" />}
            <div className="sj-scanline absolute inset-x-0 h-[3px] bg-mint shadow-[0_0_20px_#5fd3a8]" />
          </div>
          <div className="flex items-center gap-2.5 text-lg font-semibold">
            <Loader2 className="size-5 animate-spin text-mint" /> {t("قاعد أتعرف على السمكة…", "Identifying the fish…")}
          </div>
          <div className="text-[13px] text-muted">{t("أشوف الشكل واللون والزعانف", "Looking at shape, colour and fins")}</div>
          <button type="button" onClick={() => aiCtl.current?.abort()} className="glass mt-2 h-11 rounded-full px-6 text-sm font-bold">
            {t("تخطّي — أختار بنفسي", "Skip — I'll pick it")}
          </button>
        </div>
      )}
    </>
  );
}

/** The quick-catch sheet, opened by the camera button in the bottom bar or on the sea screen ("sj:quick-catch"). */
export function QuickCatch() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("sj:quick-catch", on);
    return () => window.removeEventListener("sj:quick-catch", on);
  }, []);
  if (HIDDEN.some((p) => path.startsWith(p))) return null;
  return <QuickCatchSheet open={open} onClose={() => setOpen(false)} />;
}
