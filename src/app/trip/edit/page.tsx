"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Check, Clock, Play, Plus, Save } from "lucide-react";
import { EquipmentPicker, LocationPicker, SpeciesSheet } from "@/components/pickers";
import { useToast } from "@/components/Toast";
import { Button, Card, Choice, Field, Input, NumberInput, Notice, PageHeader, Select, Textarea, Toggle, cn } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { lastUsed, newTrip } from "@/lib/factory";
import { HIJRI_MONTHS_AR, HIJRI_MONTHS_EN, fmtHijri, parseHijri, toHijri } from "@/lib/hijri";
import { SEA_LABEL, TIDE_LABEL, WIND_LABEL, useI18n } from "@/lib/i18n";
import { coordsForTrip, takeSnapshot } from "@/lib/marine/snapshots";
import { normalizeName } from "@/lib/normalize";
import { activeTrip, setTargets, statusOf, targetsOf } from "@/lib/trips";
import { fromLocalInput, nowLocalInput, toLocalInput } from "@/lib/time";
import { SEA_STATES, TIDES, WIND_DIRS, type Trip } from "@/lib/types";
import { validateTrip } from "@/lib/validate";
import { depthWord, fromUnit, toUnit, useDepthUnit } from "@/lib/depth";
import { TripFishEditor, type PendingFish } from "@/components/TripFishEditor";
import { newCatch } from "@/lib/factory";
import { resolveSpecies } from "@/lib/speciesLookup";

export default function Page() {
  return (
    <Suspense>
      <TripEdit />
    </Suspense>
  );
}

type Mode = "start" | "plan" | "past";

function TripEdit() {
  const sp = useSearchParams();
  const id = sp.get("id");
  const store = useStore();
  const { ds, idx, save, remove } = store;
  const { t, lang, name } = useI18n();
  const du = useDepthUnit();
  const dw = depthWord(du, lang);
  const toast = useToast();
  const router = useRouter();
  const existing = id ? idx.tripById.get(id) : undefined;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [targets, setTargetsState] = useState<string[]>([]);
  const [equip, setEquip] = useState<string[]>([]);
  const [startIn, setStartIn] = useState("");
  const [endIn, setEndIn] = useState("");
  const [range, setRange] = useState(false);
  const [mode, setMode] = useState<Mode>("start");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [fixHijri, setFixHijri] = useState(false);
  const [pickSpecies, setPickSpecies] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [pendingFish, setPendingFish] = useState<PendingFish[]>([]);

  const balool = useMemo(() => ds.species.find((s) => normalizeName(s.name_ar) === normalizeName("بالول")), [ds.species]);
  const other = activeTrip(ds);

  useEffect(() => {
    if (trip) return;
    if (id && !existing) return;
    const base = existing ?? newTrip({ ...lastUsed(ds), status: "active", target_species_id: null });
    setTrip(base);
    setStartIn(toLocalInput(base.started_at));
    setEndIn(toLocalInput(base.ended_at));
    setTargetsState(existing ? targetsOf(ds, existing) : []);
    setEquip(ds.trip_equipment.filter((x) => x.trip_id === base.id).map((x) => x.equipment_id));
    setFixHijri(!!base.hijri_date_override);
    setRange(base.target_depth_max_m != null);
  }, [id, existing, ds, trip, balool]);

  if (!trip) return <PageHeader title="…" back />;

  const set = <K extends keyof Trip>(k: K, v: Trip[K]) => setTrip((p) => (p ? { ...p, [k]: v } : p));
  const startedIso = fromLocalInput(startIn);
  const computedHijri = startedIso ? toHijri(startedIso) : null;
  const override = parseHijri(trip.hijri_date_override);
  const tech = trip.technique_id ? idx.techById.get(trip.technique_id) : null;
  const isTrolling = tech?.code === "trolling";
  const isJigging = tech?.code === "jigging";
  const timeShown = !!existing || mode === "past" || showTime;
  const future = timeShown && startedIso ? Date.parse(startedIso) > Date.now() + 15 * 60_000 : false;
  const effMode: Mode = existing ? "start" : mode === "past" ? "past" : future ? "plan" : "start";
  const blockedByActive = !existing && effMode === "start" && other && other.id !== trip.id;

  const errText = (k: string) =>
    errors[k] &&
    ({
      required: t("مطلوب", "Required"),
      before_start: t("النهاية قبل البداية", "End is before start"),
      too_long: t("أطول من ٧٢ ساعة — تأكد من التاريخ", "Longer than 72 h — check the date"),
      range: t("قيمة غير منطقية", "Value out of range"),
      long: t("النص طويل جداً", "Text too long"),
    }[errors[k]] ?? errors[k]);

  const onSave = async () => {
    const startIso = effMode === "start" && !existing && !timeShown ? new Date().toISOString() : fromLocalInput(startIn) ?? "";
    const status: Trip["status"] = existing ? trip.status : effMode === "plan" ? "planned" : effMode === "past" ? "completed" : "active";
    const next: Trip = {
      ...trip,
      status,
      started_at: startIso,
      planned_start_at: existing ? trip.planned_start_at ?? null : effMode === "plan" ? startIso : null,
      ended_at: endIn && (status === "completed" || existing) ? fromLocalInput(endIn) : null,
      title: trip.title?.trim() || null,
      hijri_date_override: fixHijri ? trip.hijri_date_override : null,
      target_species_id: targets[0] ?? null,
      target_depth_max_m: range ? trip.target_depth_max_m ?? null : null,
    };
    const e = validateTrip(next);
    if (next.target_depth_m != null && next.target_depth_max_m != null && next.target_depth_max_m < next.target_depth_m) e.target_depth_max_m = "range";
    if (status === "completed" && !next.ended_at) e.ended_at = "required";
    setErrors(e);
    if (Object.keys(e).length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (blockedByActive) return;
    setSaving(true);
    await save("trips", next);
    await setTargets(store, next, targets);
    for (const pf of pendingFish) {
      const speciesId = await resolveSpecies(store.ds, store.save, pf.name);
      await save(
        "catches",
        newCatch(next, {
          species_id: speciesId,
          weight_kg: pf.weight,
          photo_media_id: pf.photo,
          identification_status: speciesId ? "manual" : "unidentified",
          location_id: next.location_id,
          technique_id: next.technique_id,
          tide: next.tide,
        }),
      );
    }
    const before = ds.trip_equipment.filter((x) => x.trip_id === next.id);
    const toRemove = before.filter((x) => !equip.includes(x.equipment_id));
    const toAdd = equip.filter((eid) => !before.some((x) => x.equipment_id === eid));
    if (toRemove.length) await remove("trip_equipment", toRemove);
    if (toAdd.length) await save("trip_equipment", toAdd.map((eid) => ({ trip_id: next.id, equipment_id: eid, created_at: new Date().toISOString() })));
    // Conditions for the trip's own time & place: planning forecast, or trip start.
    const moved = !existing || existing.started_at !== next.started_at || existing.location_id !== next.location_id || existing.lat !== next.lat;
    if (moved && !next.is_demo && (status === "planned" || status === "active"))
      void takeSnapshot(store, {
        at: new Date(next.started_at),
        tripId: next.id,
        catchId: null,
        purpose: status === "planned" ? "planned" : "trip_start",
        coords: coordsForTrip({ ...ds, trips: [...ds.trips.filter((x) => x.id !== next.id), next] }, next),
      });
    toast(existing ? t("تم حفظ الرحلة", "Trip saved") : status === "planned" ? t("تم حفظ الرحلة المخططة", "Planned trip saved") : status === "active" ? t("بدأت الرحلة — بالتوفيق!", "Trip started — good luck!") : t("تم حفظ الرحلة", "Trip saved"));
    router.replace(`/trip?id=${next.id}`);
  };

  const months = lang === "ar" ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  const h = override ?? computedHijri ?? { year: 1448, month: 1, day: 1 };
  const setHijriPart = (part: "year" | "month" | "day", v: number) => {
    const n = { ...h, [part]: v };
    set("hijri_date_override", `${n.year}-${String(n.month).padStart(2, "0")}-${String(n.day).padStart(2, "0")}`);
  };
  const toggleTarget = (sid: string) => setTargetsState((cur) => (cur.includes(sid) ? cur.filter((x) => x !== sid) : [...cur, sid]));

  return (
    <>
      <PageHeader title={existing ? t("تعديل الرحلة", "Edit trip") : t("رحلة جديدة", "New trip")} back />
      {Object.keys(errors).length > 0 && (
        <Notice tone="bad" className="mb-3">
          {t("راجع الحقول المظللة", "Please check the highlighted fields")}
        </Notice>
      )}

      <div className="space-y-3">
        <Card className="space-y-4">
          <div className="font-semibold">🎯 {t("الهدف", "The target")}</div>
          <Field label={t("النوع المستهدف", "Target species")}>
            <div className="space-y-2">
              {targets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {targets.map((sid) => (
                    <button key={sid} type="button" onClick={() => toggleTarget(sid)} className="min-h-11 rounded-xl border border-teal bg-teal/15 px-3.5 text-sm text-teal">
                      <Check className="me-1 inline size-4" /> {name(idx.speciesById.get(sid))} <span className="text-muted">×</span>
                    </button>
                  ))}
                </div>
              )}
              <Select
                value={null}
                onChange={(sid) => sid && !targets.includes(sid) && setTargetsState([...targets, sid])}
                placeholder={targets.length ? t("＋ أضف نوعاً مستهدفاً ثانياً…", "+ Add another target…") : t("اختر السمكة المستهدفة…", "Pick the target fish…")}
                options={[...ds.species].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).map((x) => ({ value: x.id, label: name(x) }))}
              />
              <button type="button" onClick={() => setPickSpecies(true)} className="text-sm text-teal">
                {t("نوع غير موجود في القائمة؟ أضفه", "Not in the list? Add it")}
              </button>
            </div>
          </Field>
          <Field label={t("طريقة الصيد", "Technique")}>
            <Choice
              value={trip.technique_id}
              onChange={(v) => set("technique_id", v)}
              options={[...ds.techniques].sort((a, b) => a.sort_order - b.sort_order).map((x) => ({ value: x.id, label: name(x) }))}
            />
          </Field>
          <Field label={t("موقع الصيد", "Fishing spot")}>
            <LocationPicker value={trip.location_id} onChange={(v) => set("location_id", v)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={range ? t(`العمق من (${dw})`, `Depth from (${dw})`) : t(`العمق المستهدف (${dw})`, `Target depth (${dw})`)} error={errText("target_depth_m")}>
              <NumberInput value={toUnit(trip.target_depth_m, du)} onChange={(v) => set("target_depth_m", fromUnit(v, du))} />
            </Field>
            {range ? (
              <Field label={t(`إلى (${dw})`, `to (${dw})`)} error={errText("target_depth_max_m")}>
                <NumberInput value={toUnit(trip.target_depth_max_m, du)} onChange={(v) => set("target_depth_max_m", fromUnit(v, du))} />
              </Field>
            ) : (
              <div className="flex items-end">
                <Button type="button" variant="ghost" size="sm" onClick={() => setRange(true)}>
                  {t("+ نطاق عمق", "+ depth range")}
                </Button>
              </div>
            )}
          </div>
        </Card>
        <Card className="space-y-4">
          <div className="font-semibold">🕐 {t("متى؟", "When?")}</div>
          {!existing && (
            <Choice
              value={mode === "past" ? "past" : "now"}
              allowClear={false}
              onChange={(v) => setMode(v === "past" ? "past" : "start")}
              options={[
                { value: "now", label: t("الآن أو مخططة", "Now or planned") },
                { value: "past", label: t("رحلة سابقة", "Past trip") },
              ]}
            />
          )}
          {timeShown && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label={existing ? t("البداية", "Start") : mode === "past" ? t("البداية", "Start") : t("التاريخ ووقت البداية المخطط", "Date & planned start")} error={errText("started_at")}>
                <Input type="datetime-local" value={startIn} onChange={(e) => setStartIn(e.target.value)} />
              </Field>
              {(existing ? statusOf(existing) === "completed" || !!endIn : mode === "past") && (
                <Field label={t("النهاية", "End")} error={errText("ended_at")}>
                  <div className="flex gap-2">
                    <Input type="datetime-local" value={endIn} onChange={(e) => setEndIn(e.target.value)} />
                    <Button type="button" variant="secondary" onClick={() => setEndIn(nowLocalInput())} aria-label="now">
                      <Clock className="size-4" />
                    </Button>
                  </div>
                </Field>
              )}
            </div>
          )}
          {!timeShown && (
            <button
              type="button"
              className="text-sm text-teal"
              onClick={() => {
                setShowTime(true);
                setStartIn(toLocalInput(new Date(Date.now() + 86_400_000).toISOString()).slice(0, 11) + "05:00");
              }}
            >
              {t("تخطيط لوقت لاحق؟ اختر الموعد", "Planning for later? Pick a time")}
            </button>
          )}
        </Card>
        <Card className="space-y-4">
          <div>
            <div className="font-semibold">🎣 {t("العدّة المستخدمة", "Gear used")}</div>
            <p className="mt-0.5 text-xs text-muted">{t("اكتب اسم كل قطعة — كله اختياري.", "Type the name of each item — all optional.")}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("البكرة (الماكينة)", "Reel")}>
              <Input value={trip.gear_reel ?? ""} onChange={(e) => set("gear_reel", e.target.value || null)} placeholder="Shimano Stella" />
            </Field>
            <Field label={t("القصبة", "Rod")}>
              <Input value={trip.gear_rod ?? ""} onChange={(e) => set("gear_rod", e.target.value || null)} placeholder="Major Craft" />
            </Field>
            <Field label={t("الخيط", "Line")}>
              <Input value={trip.gear_line ?? ""} onChange={(e) => set("gear_line", e.target.value || null)} placeholder="PE 3" />
            </Field>
            <Field label={t("الليدر", "Leader")}>
              <Input value={trip.gear_leader ?? ""} onChange={(e) => set("gear_leader", e.target.value || null)} placeholder="Fluoro 40 lb" />
            </Field>
          </div>
          <Field label={isJigging ? t("الجيج (الاسم)", "Jig (name)") : t("الجيج أو الميرور (الاسم)", "Jig or lure (name)")}>
            <Input value={trip.lure_type ?? ""} onChange={(e) => set("lure_type", e.target.value || null)} placeholder={isTrolling ? "Rapala X-Rap" : "Slow jig"} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("وزنه (غ)", "Weight (g)")}>
              <NumberInput value={trip.lure_weight_g ?? null} onChange={(v) => set("lure_weight_g", v)} />
            </Field>
            <Field label={t("لونه", "Colour")}>
              <Input value={trip.lure_color ?? ""} onChange={(e) => set("lure_color", e.target.value || null)} />
            </Field>
            {isTrolling && (
              <Field label={t("سرعة التشخيط (عقدة)", "Trolling speed (kn)")}>
                <NumberInput value={trip.trolling_speed_kn ?? null} onChange={(v) => set("trolling_speed_kn", v)} />
              </Field>
            )}
          </div>
          <Field label={t("من قائمة معداتي (اختياري)", "From my equipment list (optional)")}>
            <EquipmentPicker value={equip} onChange={setEquip} />
          </Field>
        </Card>
        <Card className="space-y-3">
          <div>
            <div className="font-semibold">🌊 {t("وقت الصيد", "When the fish bit")}</div>
            <p className="mt-0.5 text-xs text-muted">{t("متى كان المد لما صدت؟ اختياري — إذا تركته فاضي يحسبه التطبيق تلقائياً.", "What was the tide doing when you caught? Optional — left empty, the app works it out automatically.")}</p>
          </div>
          <Choice value={trip.tide} onChange={(v) => set("tide", v)} options={TIDES.map((x) => ({ value: x, label: TIDE_LABEL[x][lang] }))} />
        </Card>
        <Card>
          <TripFishEditor trip={trip} pending={pendingFish} setPending={setPendingFish} />
        </Card>
        <Card className="space-y-4">
          <Field label={t("اسم الرحلة (اختياري)", "Trip name (optional)")} error={errText("title")}>
            <Input value={trip.title ?? ""} onChange={(e) => set("title", e.target.value)} placeholder={t("مثال: تشخيط بالول الفنطاس", "e.g. Al-Fintas Balool trolling")} />
          </Field>
          <Field label={t("ملاحظات", "Notes")} error={errText("notes")}>
              <Textarea value={trip.notes ?? ""} onChange={(e) => set("notes", e.target.value || null)} />
            </Field>
          <details className="rounded-xl border border-line/70 p-3">
            <summary className="cursor-pointer list-none text-sm font-semibold">{t("خيارات متقدمة (اختياري)", "Advanced options (optional)")}</summary>
            <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t(`عمق الماء الفعلي (${dw})`, `Actual water depth (${dw})`)} error={errText("water_depth_m")}>
                <NumberInput value={toUnit(trip.water_depth_m, du)} onChange={(v) => set("water_depth_m", fromUnit(v, du))} />
              </Field>
              <Field label={t("حالة البحر", "Sea state")}>
                <Select value={trip.sea_state} onChange={(v) => set("sea_state", v as Trip["sea_state"])} options={SEA_STATES.map((x) => ({ value: x, label: SEA_LABEL[x][lang] }))} />
              </Field>
              <Field label={t("الرياح (كم/س)", "Wind (km/h)")} error={errText("wind_speed_kmh")}>
                <NumberInput value={trip.wind_speed_kmh} onChange={(v) => set("wind_speed_kmh", v)} />
              </Field>
              <Field label={t("اتجاه الرياح", "Wind direction")}>
                <Select value={trip.wind_dir} onChange={(v) => set("wind_dir", v as Trip["wind_dir"])} options={WIND_DIRS.map((d) => ({ value: d, label: WIND_LABEL[d][lang] }))} />
              </Field>
            </div>
            <Field label={t("ملاحظات المعدات", "Gear notes")}>
              <Input value={trip.gear_notes ?? ""} onChange={(e) => set("gear_notes", e.target.value || null)} />
            </Field>
            {computedHijri && (
              <div className="rounded-xl bg-surface-2 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {t("الهجري:", "Hijri:")} <b>{fmtHijri(override ?? computedHijri, lang)}</b>
                  </span>
                  <button type="button" className="text-teal" onClick={() => setFixHijri((v) => !v)}>
                    {fixHijri ? t("إلغاء التصحيح", "Undo") : t("تصحيح", "Correct")}
                  </button>
                </div>
                {fixHijri && (
                  <div className="mt-2 grid grid-cols-[1fr_2fr_1.3fr] gap-2">
                    <NumberInput value={h.day} onChange={(v) => v && v >= 1 && v <= 30 && setHijriPart("day", Math.round(v))} aria-label="day" />
                    <select value={h.month} onChange={(e) => setHijriPart("month", Number(e.target.value))} className="min-h-12 rounded-xl border border-line bg-surface-3 px-2">
                      {months.map((mm, i) => (
                        <option key={mm} value={i + 1}>
                          {mm}
                        </option>
                      ))}
                    </select>
                    <NumberInput value={h.year} onChange={(v) => v && v > 1300 && v < 1500 && setHijriPart("year", Math.round(v))} aria-label="year" />
                  </div>
                )}
              </div>
            )}
            {existing && <Toggle checked={statusOf(trip) === "cancelled"} onChange={(v) => set("status", v ? "cancelled" : existing.status === "cancelled" ? "planned" : existing.status)} label={t("رحلة ملغاة (لم تحدث)", "Cancelled (didn't happen)")} />}
            </div>
          </details>
        </Card>
      </div>

      {blockedByActive && other && (
        <Notice tone="warn" className="mt-3">
          {t("لديك رحلة جارية. أنهِها أولاً أو خطط هذه الرحلة لوقت لاحق.", "You have an active trip. Finish it first, or plan this trip for later.")}{" "}
          <Link className="underline" href={`/trip?id=${other.id}`}>
            {t("فتح الرحلة الجارية", "Open active trip")}
          </Link>
        </Notice>
      )}

      <div className="sticky bottom-[calc(var(--safe-bottom)+4.5rem)] z-20 mt-4 rounded-2xl border border-line bg-navy/95 p-2 backdrop-blur">
        <Button size="lg" className={cn("w-full", effMode === "start" && !existing && "bg-teal text-abyss hover:bg-teal-dim")} loading={saving} disabled={!!blockedByActive} onClick={onSave}>
          {existing ? (
            <>
              <Save className="size-5" /> {t("حفظ", "Save")}
            </>
          ) : effMode === "plan" ? (
            <>
              <Save className="size-5" /> {t("احفظ الرحلة المخططة", "Save planned trip")}
            </>
          ) : effMode === "past" ? (
            <>
              <Save className="size-5" /> {t("احفظ الرحلة السابقة", "Save past trip")}
            </>
          ) : (
            <>
              <Play className="size-5" /> {t("ابدأ الرحلة الآن", "Start trip now")}
            </>
          )}
        </Button>
        {!existing && targets.length === 0 && <p className="mt-1 text-center text-xs text-muted">{t("بدون نوع مستهدف — لن تدخل في إحصائيات استهداف الأنواع", "No target species — won't count in target-species stats")}</p>}
      </div>

      <SpeciesSheet
        open={pickSpecies}
        onClose={() => setPickSpecies(false)}
        species={ds.species}
        onPick={(sid) => {
          if (sid && !targets.includes(sid)) setTargetsState([...targets, sid]);
          setPickSpecies(false);
        }}
      />
    </>
  );
}
