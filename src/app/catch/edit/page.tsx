"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Camera, Clock, ImagePlus, LocateFixed, Plus, Save, X } from "lucide-react";
import { AiPanel } from "@/components/AiPanel";
import { Photo } from "@/components/common";
import { EquipmentPicker, LocationPicker, SpeciesPicker } from "@/components/pickers";
import { Button, Card, Choice, Field, Input, NumberInput, Notice, PageHeader, Select, Textarea, Toggle } from "@/components/ui";
import { MOON_EMOJI } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { newCatch, prefillFromTrip } from "@/lib/factory";
import { MOON_LABEL, TIDE_LABEL, useI18n } from "@/lib/i18n";
import { fmtDate, fromLocalInput, nowLocalInput, toLocalInput } from "@/lib/time";
import { MOON_PHASES, TIDES, isActiveStatus, type Catch, type IdentificationStatus } from "@/lib/types";
import { validateCatch } from "@/lib/validate";
import { useToast } from "@/components/Toast";
import { TideAtTime } from "@/components/TideAtTime";
import { activeTrip, targetsOf } from "@/lib/trips";
import { normalizeName } from "@/lib/normalize";
import { getGps } from "@/lib/gps";
import { snapshotCatch } from "@/lib/marine/snapshots";
import { depthWord, fromUnit, toUnit, useDepthUnit } from "@/lib/depth";
import { useIsAdmin } from "@/lib/admin";

export default function Page() {
  return (
    <Suspense>
      <CatchEdit />
    </Suspense>
  );
}

function CatchEdit() {
  const sp = useSearchParams();
  const id = sp.get("id");
  const tripId = sp.get("trip");
  const store = useStore();
  const { ds, idx, save, remove, addPhoto } = store;
  const { t, lang, name } = useI18n();
  const isAdmin = useIsAdmin();
  const du = useDepthUnit();
  const dw = depthWord(du, lang);
  const router = useRouter();
  const existing = id ? ds.catches.find((c) => c.id === id) : undefined;
  const toast = useToast();
  const initialTripId = existing ? existing.trip_id : tripId ?? activeTrip(ds)?.id ?? null;

  const [c, setC] = useState<Catch | null>(null);
  const [timeIn, setTimeIn] = useState("");
  const [equip, setEquip] = useState<string[]>([]);
  const [extra, setExtra] = useState<string[]>([]);
  const [gpsMsg, setGpsMsg] = useState<string | null>(null);
  const moreRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (c || !store.ready) return;
    if (id && !existing) return;
    const t0 = initialTripId ? idx.tripById.get(initialTripId) ?? null : null;
    const base = existing ?? newCatch(t0, prefillFromTrip(t0));
    setC(base);
    setTimeIn(toLocalInput(base.caught_at));
    const own = ds.catch_equipment.filter((x) => x.catch_id === base.id).map((x) => x.equipment_id);
    setEquip(existing ? own : t0 ? ds.trip_equipment.filter((x) => x.trip_id === t0.id).map((x) => x.equipment_id) : []);
    setExtra(ds.catch_media.filter((x) => x.catch_id === base.id).sort((a, b) => a.sort_order - b.sort_order).map((x) => x.media_id));
  }, [c, store.ready, id, existing, initialTripId, idx, ds.catch_equipment, ds.trip_equipment, ds.catch_media]);

  if (!c) return <PageHeader title="…" back />;
  const trip = c.trip_id ? idx.tripById.get(c.trip_id) ?? null : null;
  const quickSpecies = [
    ...ds.species.filter((s) => normalizeName(s.name_ar) === normalizeName("بالول")).map((s) => s.id),
    ...(trip ? targetsOf(ds, trip) : []),
    ...[...ds.catches].sort((a, b) => b.caught_at.localeCompare(a.caught_at)).map((x) => x.species_id).filter((x): x is string => !!x),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  const tripOptions = [...ds.trips].filter((x) => x.status !== "cancelled").sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 30);

  const set = <K extends keyof Catch>(k: K, v: Catch[K]) => setC((p) => (p ? { ...p, [k]: v } : p));

  const onPhoto = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setPhotoBusy(true);
    setPhotoErr(null);
    try {
      const m = await addPhoto(f);
      setC((p) => (p ? { ...p, photo_media_id: m.id, ai_suggestion: p.photo_media_id === m.id ? p.ai_suggestion : null } : p));
    } catch {
      setPhotoErr(t("تعذرت قراءة الصورة. جرّب صورة أخرى.", "Couldn't read that image. Try another one."));
    } finally {
      setPhotoBusy(false);
      if (camRef.current) camRef.current.value = "";
      if (libRef.current) libRef.current.value = "";
    }
  };

  // Extra photos of the SAME fish (one catch record, several photos; duplicates are de-duplicated by hash).
  const onMorePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setPhotoBusy(true);
    setPhotoErr(null);
    try {
      const ids: string[] = [];
      for (const f of Array.from(files)) ids.push((await addPhoto(f)).id);
      setExtra((prev) => [...new Set([...prev, ...ids])].filter((x) => x !== c.photo_media_id));
    } catch {
      setPhotoErr(t("تعذرت قراءة الصورة. جرّب صورة أخرى.", "Couldn't read that image. Try another one."));
    } finally {
      setPhotoBusy(false);
      if (moreRef.current) moreRef.current.value = "";
    }
  };

  const errText = (k: string) =>
    errors[k] &&
    ({
      required: t("مطلوب", "Required"),
      range: t("قيمة غير منطقية", "Value out of range"),
      outside_trip: t("الوقت خارج وقت الرحلة — تأكد منه", "Time is outside the trip — please check"),
      long: t("النص طويل جداً", "Text too long"),
    }[errors[k]] ?? errors[k]);

  const doSave = async (andAnother: boolean, force = false) => {
    const next: Catch = { ...c, caught_at: fromLocalInput(timeIn) ?? "" };
    if (!next.species_id && next.identification_status !== "pending_ai") next.identification_status = "unidentified";
    if (next.species_id && next.identification_status === "unidentified") next.identification_status = "manual";
    const e = validateCatch(next, trip ?? undefined);
    if (force) delete e.caught_at;
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    const prev = existing;
    await save("catches", next);
    // Extra photos
    const beforeM = ds.catch_media.filter((x) => x.catch_id === next.id);
    const keepM = extra.filter((m) => m !== next.photo_media_id);
    const rmM = beforeM.filter((x) => !keepM.includes(x.media_id));
    if (rmM.length) await remove("catch_media", rmM);
    const ts0 = new Date().toISOString();
    const addM = keepM.filter((m) => !beforeM.some((x) => x.media_id === m)).map((m) => ({ catch_id: next.id, media_id: m, sort_order: keepM.indexOf(m), created_at: ts0 }));
    if (addM.length) await save("catch_media", addM);
    // Environmental snapshot for the catch's own time & place (new catch, or time/place changed).
    const moved = !prev || prev.caught_at !== next.caught_at || prev.lat !== next.lat || prev.lng !== next.lng || prev.location_id !== next.location_id;
    if (moved && !next.is_demo) void snapshotCatch({ ...store, ds: { ...store.ds, catches: [...store.ds.catches.filter((x) => x.id !== next.id), next] } }, next);
    const before = ds.catch_equipment.filter((x) => x.catch_id === next.id);
    const rm = before.filter((x) => !equip.includes(x.equipment_id));
    const add = equip.filter((eid) => !before.some((x) => x.equipment_id === eid));
    if (rm.length) await remove("catch_equipment", rm);
    if (add.length) await save("catch_equipment", add.map((eid) => ({ catch_id: next.id, equipment_id: eid, created_at: new Date().toISOString() })));
    if (andAnother) {
      const fresh = newCatch(trip, {
        ...prefillFromTrip(trip),
        species_id: next.species_id,
        pe_rating: next.pe_rating,
        lure_bait: next.lure_bait,
        depth_m: next.depth_m,
        technique_id: next.technique_id,
        location_id: next.location_id,
      });
      setC(fresh);
      setExtra([]);
      setTimeIn(nowLocalInput());
      setSaving(false);
      window.scrollTo({ top: 0 });
      toast(t("تم حفظ الصيدة — سجّل التالية", "Catch saved — log the next one"));
      router.replace(trip ? `/catch/edit?trip=${trip.id}` : "/catch/edit");
    } else {
      toast(existing ? t("تم حفظ التعديل", "Changes saved") : t("تم حفظ الصيدة", "Catch saved"));
      router.replace(`/catch?id=${next.id}`);
    }
  };

  const loc = (c.location_id ?? trip?.location_id) ? idx.locById.get((c.location_id ?? trip?.location_id)!) : null;
  const tech = (c.technique_id ?? trip?.technique_id) ? idx.techById.get((c.technique_id ?? trip?.technique_id)!) : null;

  return (
    <>
      <PageHeader title={existing ? t("تعديل الصيدة", "Edit catch") : t("سمكة جديدة", "New fish")} subtitle={trip ? trip.title || loc?.name || undefined : t("غير مرتبطة برحلة", "Not linked to a trip")} back />

      <div className="space-y-3">
        <Card className="space-y-3">
          {c.photo_media_id ? (
            <div className="relative">
              <Photo mediaId={c.photo_media_id} variant="full" className="aspect-[4/3] w-full rounded-xl" />
              <button
                type="button"
                aria-label="remove photo"
                onClick={() => setC({ ...c, photo_media_id: null, ai_suggestion: null })}
                className="absolute end-2 top-2 grid size-9 place-items-center rounded-full bg-black/60"
              >
                <X className="size-5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="lg" variant="secondary" loading={photoBusy} onClick={() => camRef.current?.click()} className="min-h-24 flex-col">
                <Camera className="size-7 text-teal" /> {t("الكاميرا", "Camera")}
              </Button>
              <Button type="button" size="lg" variant="secondary" loading={photoBusy} onClick={() => libRef.current?.click()} className="min-h-24 flex-col">
                <ImagePlus className="size-7 text-teal" /> {t("من الصور", "Photo library")}
              </Button>
            </div>
          )}
          <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhoto(e.target.files)} />
          <input ref={libRef} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files)} />
          {photoErr && <Notice tone="bad">{photoErr}</Notice>}
          {(c.photo_media_id || extra.length > 0) && (
            <div className="flex flex-wrap items-center gap-2">
              {extra.map((m) => (
                <div key={m} className="relative">
                  <Photo mediaId={m} className="size-16 rounded-xl" />
                  <button type="button" aria-label="remove" onClick={() => setExtra(extra.filter((x) => x !== m))} className="absolute -end-1 -top-1 grid size-6 place-items-center rounded-full bg-black/70">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <Button type="button" size="sm" variant="secondary" loading={photoBusy} onClick={() => moreRef.current?.click()}>
                <ImagePlus className="size-4" /> {t("صور إضافية لنفس السمكة", "More photos of this fish")}
              </Button>
              <input ref={moreRef} type="file" accept="image/*" multiple hidden onChange={(e) => onMorePhotos(e.target.files)} />
            </div>
          )}

          {isAdmin && c.photo_media_id && (
            <AiPanel
              photoMediaId={c.photo_media_id}
              suggestion={c.ai_suggestion}
              context={{ location: loc?.name, technique: tech?.name_en, depth_m: c.depth_m ?? trip?.water_depth_m ?? undefined }}
              onSuggestion={(s) => setC((p) => (p ? { ...p, ai_suggestion: s, ai_species_id: null } : p))}
              onPick={(speciesId, status: IdentificationStatus) =>
                setC((p) =>
                  p
                    ? {
                        ...p,
                        species_id: speciesId,
                        identification_status: status,
                        ai_species_id: status === "ai_confirmed" ? speciesId : p.ai_species_id,
                      }
                    : p,
                )
              }
              onDefer={() => setC((p) => (p ? { ...p, identification_status: "pending_ai" } : p))}
            />
          )}
          {c.identification_status === "pending_ai" && !c.species_id && (
            <Notice>{t("سيتم تذكيرك بالتعرّف على هذه السمكة عند الاتصال.", "You'll be reminded to identify this fish when online.")}</Notice>
          )}

          {quickSpecies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quickSpecies.map((sid) => (
                <button
                  key={sid}
                  type="button"
                  onClick={() => setC({ ...c, species_id: sid, identification_status: c.ai_suggestion ? "ai_corrected" : "manual" })}
                  className={`min-h-11 rounded-xl border px-3.5 text-sm ${c.species_id === sid ? "border-teal bg-teal/15 text-teal" : "border-line bg-surface-2 text-ink-2"}`}
                >
                  {name(idx.speciesById.get(sid))}
                </button>
              ))}
            </div>
          )}
          <Field label={t("النوع", "Species")} hint={c.identification_status.startsWith("ai_") ? t("مؤكد من اقتراح AI", "Confirmed from AI suggestion") : undefined}>
            <SpeciesPicker
              value={c.species_id}
              onChange={(v) =>
                setC({
                  ...c,
                  species_id: v,
                  identification_status: !v ? "unidentified" : c.ai_suggestion ? "ai_corrected" : "manual",
                })
              }
              placeholder={t("اختر النوع (أو اتركه لاحقاً)", "Choose species (or leave for later)")}
            />
          </Field>
        </Card>

        <Card className="space-y-4">
          <Field label={t("الرحلة", "Trip")} hint={!c.trip_id ? t("يمكنك ربطها برحلة لاحقاً", "You can link it to a trip later") : undefined}>
            <Select
              value={c.trip_id}
              onChange={(v) => set("trip_id", v)}
              placeholder={t("— بدون رحلة —", "— No trip —")}
              options={tripOptions.map((x) => ({
                value: x.id,
                label: `${x.title || (x.location_id && idx.locById.get(x.location_id)?.name) || t("رحلة", "Trip")} · ${fmtDate(x.started_at, lang)}${isActiveStatus(x.status) ? t(" (جارية)", " (active)") : ""}`,
              }))}
            />
          </Field>
          <Field label={t("وقت الصيد (الكويت)", "Catch time (Kuwait)")} error={errText("caught_at")}>
            <div className="flex gap-2">
              <Input type="datetime-local" value={timeIn} onChange={(e) => setTimeIn(e.target.value)} />
              <Button type="button" variant="secondary" onClick={() => setTimeIn(nowLocalInput())} aria-label="now">
                <Clock className="size-4" />
              </Button>
            </div>
          </Field>
          <TideAtTime
            lat={c.lat ?? (c.location_id ? idx.locById.get(c.location_id)?.lat : null) ?? trip?.lat ?? (trip?.location_id ? idx.locById.get(trip.location_id)?.lat : null) ?? null}
            lng={c.lng ?? (c.location_id ? idx.locById.get(c.location_id)?.lng : null) ?? trip?.lng ?? (trip?.location_id ? idx.locById.get(trip.location_id)?.lng : null) ?? null}
            at={fromLocalInput(timeIn)}
          />
          {errors.caught_at === "outside_trip" && (
            <Button size="sm" variant="ghost" onClick={() => doSave(false, true)}>
              {t("الوقت صحيح، احفظ على أي حال", "Time is right, save anyway")}
            </Button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Field label={t("الوزن (كغ)", "Weight (kg)")} error={errText("weight_kg")}>
                <NumberInput value={c.weight_kg} onChange={(v) => set("weight_kg", v)} placeholder="0.0" />
              </Field>
              <Toggle checked={c.weight_is_estimate} onChange={(v) => set("weight_is_estimate", v)} label={t("تقديري", "Estimated")} />
            </div>
            <div>
              <Field label={t("الطول (سم)", "Length (cm)")} error={errText("length_cm")}>
                <NumberInput value={c.length_cm} onChange={(v) => set("length_cm", v)} placeholder="0" />
              </Field>
              <Toggle checked={c.length_is_estimate} onChange={(v) => set("length_is_estimate", v)} label={t("تقديري", "Estimated")} />
            </div>
          </div>
          <Choice
            value={c.released ? "released" : "kept"}
            allowClear={false}
            onChange={(v) => set("released", v === "released")}
            options={[
              { value: "kept", label: t("احتفظت بها", "Kept") },
              { value: "released", label: t("أطلقتها", "Released") },
            ]}
          />
        </Card>

        <details className="rounded-[var(--radius-card)] border border-line/70 bg-surface/80 p-4" open={!!(c.depth_m || c.location_id || c.technique_id || c.notes || equip.length)}>
          <summary className="cursor-pointer list-none font-semibold">⚙️ {t("تفاصيل إضافية (اختياري)", "More details (optional)")}</summary>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t(`العمق الفعلي (${dw})`, `Actual depth (${dw})`)} error={errText("depth_m")}>
                <NumberInput value={toUnit(c.depth_m, du)} onChange={(v) => set("depth_m", fromUnit(v, du))} />
              </Field>
              <Field label="PE" error={errText("pe_rating")}>
                <NumberInput value={c.pe_rating} onChange={(v) => set("pe_rating", v)} />
              </Field>
              <Field label={t("نوع الخيط", "Line type")}>
                <Input value={c.line_type ?? ""} onChange={(e) => set("line_type", e.target.value || null)} placeholder="PE / Mono / FC" />
              </Field>
              <Field label={t("الطُعم / الجك", "Lure / jig / bait")}>
                <Input value={c.lure_bait ?? ""} onChange={(e) => set("lure_bait", e.target.value || null)} />
              </Field>
              <Field label={t("وزن الجك/الطُعم (غ)", "Lure weight (g)")}>
                <NumberInput value={c.lure_weight_g ?? null} onChange={(v) => set("lure_weight_g", v)} />
              </Field>
              <Field label={t("اللون", "Colour")}>
                <Input value={c.lure_color ?? ""} onChange={(e) => set("lure_color", e.target.value || null)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("العصا والمكينة", "Rod & reel")}>
                <Input value={c.rod_reel ?? ""} onChange={(e) => set("rod_reel", e.target.value || null)} />
              </Field>
              <Field label={t("الليدر", "Leader")}>
                <Input value={c.leader ?? ""} onChange={(e) => set("leader", e.target.value || null)} placeholder="FC 40lb" />
              </Field>
              <Field label={t("الميدار / الخطاف", "Hook")}>
                <Input value={c.hook ?? ""} onChange={(e) => set("hook", e.target.value || null)} />
              </Field>
            </div>
            <div className="flex items-center justify-between gap-2 rounded-xl border border-line p-3 text-sm">
              <span className="text-muted">
                {c.lat != null ? <span className="ltr">GPS: {c.lat}, {c.lng}</span> : gpsMsg ?? t("إحداثيات الصيدة (اختياري)", "Catch coordinates (optional)")}
              </span>
              {c.lat != null ? (
                <Button size="sm" variant="ghost" onClick={() => setC({ ...c, lat: null, lng: null })}>
                  {t("إزالة", "Remove")}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const g = await getGps();
                      setC((p) => (p ? { ...p, lat: g.lat, lng: g.lng } : p));
                    } catch (e) {
                      setGpsMsg((e as Error).message === "DENIED" ? t("تم رفض الإذن", "Permission denied") : t("تعذر تحديد الموقع", "Location unavailable"));
                    }
                  }}
                >
                  <LocateFixed className="size-4" /> GPS
                </Button>
              )}
            </div>
            <Field label={t("الطريقة (إذا اختلفت عن الرحلة)", "Technique (if different from trip)")}>
              <Choice
                value={c.technique_id}
                onChange={(v) => set("technique_id", v)}
                options={[...ds.techniques].sort((a, b) => a.sort_order - b.sort_order).map((x) => ({ value: x.id, label: name(x) }))}
              />
            </Field>
            <Field label={t("الموقع (إذا اختلف عن الرحلة)", "Spot (if different from trip)")}>
              <LocationPicker value={c.location_id} onChange={(v) => set("location_id", v)} />
            </Field>
            <Field label={t("المعدات المستخدمة", "Gear used")}>
              <EquipmentPicker value={equip} onChange={setEquip} />
            </Field>
            <Field label={t("المد والجزر", "Tide")}>
              <Choice value={c.tide} onChange={(v) => set("tide", v)} options={TIDES.map((x) => ({ value: x, label: TIDE_LABEL[x][lang] }))} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("طور القمر", "Moon phase")}>
                <Select
                  value={c.moon_phase}
                  onChange={(v) => set("moon_phase", v as Catch["moon_phase"])}
                  placeholder={t("من الرحلة", "From trip")}
                  options={MOON_PHASES.map((m) => ({ value: m, label: `${MOON_EMOJI[m]} ${MOON_LABEL[m][lang]}` }))}
                />
              </Field>
              <Field label={t("الطقس", "Weather")}>
                <Input value={c.weather ?? ""} onChange={(e) => set("weather", e.target.value || null)} />
              </Field>
            </div>
            <Field
              label={t("تصحيح التاريخ الهجري (اختياري)", "Hijri date correction (optional)")}
              hint={t("بصيغة 1448-04-25 — إذا اختلف عن رؤية الهلال الرسمية", "Format 1448-04-25 — if it differs from the official moon sighting")}
              error={c.hijri_date_override && !/^1[34]\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|30)$/.test(c.hijri_date_override) ? t("صيغة غير صحيحة", "Invalid format") : null}
            >
              <Input dir="ltr" value={c.hijri_date_override ?? ""} onChange={(e) => set("hijri_date_override", e.target.value.trim() || null)} placeholder="1448-04-25" />
            </Field>
            <Field label={t("ملاحظات", "Notes")} error={errText("notes")}>
              <Textarea value={c.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
            </Field>
          </div>
        </details>
      </div>

      <div className="sticky bottom-[calc(var(--safe-bottom)+5.75rem)] z-20 mt-4 flex gap-2 rounded-2xl border border-line bg-navy/95 p-2 backdrop-blur">
        <Button size="lg" className="flex-1" loading={saving} onClick={() => doSave(false)}>
          <Save className="size-5" /> {t("حفظ", "Save")}
        </Button>
        {!existing && (
          <Button size="lg" variant="teal" loading={saving} onClick={() => doSave(true)}>
            <Plus className="size-5" /> {t("حفظ وأخرى", "Save + next")}
          </Button>
        )}
      </div>
    </>
  );
}
