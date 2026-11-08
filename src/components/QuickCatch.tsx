"use client";

// Floating camera button → small sheet for logging a catch in seconds: photo,
// fish name, spot, and which trip it belongs to (the active one, an earlier
// one — handy when you're at home tidying up after the trip — or none).
// `QuickCatchSheet` is also used from a trip page to add a fish to that trip.

import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Camera, ImagePlus, Loader2, LocateFixed, X } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { newCatch } from "@/lib/factory";
import { getGps } from "@/lib/gps";
import { useI18n } from "@/lib/i18n";
import { resolveSpecies } from "@/lib/speciesLookup";
import { fmtDate } from "@/lib/time";
import { isActiveStatus } from "@/lib/types";
import { Photo } from "./common";
import { useToast } from "./Toast";
import { Button, Field, Input, Notice, Select, Sheet, cn } from "./ui";
import { snapshotCatch } from "@/lib/marine/snapshots";

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

const HIDDEN = ["/catch/edit", "/trip/edit", "/login"];

type Target = "active" | "past" | "none";

export function QuickCatchSheet({ open, onClose, fixedTripId }: { open: boolean; onClose: () => void; fixedTripId?: string }) {
  const store = useStore();
  const { ds, idx, save, addPhoto } = store;
  const { t, lang, name } = useI18n();
  const toast = useToast();
  const cam = useRef<HTMLInputElement>(null);
  const lib = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [fishId, setFishId] = useState<string | null>(null);
  const [fish, setFish] = useState("");
  const [loc, setLoc] = useState<string | null>(null);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [target, setTarget] = useState<Target>("none");
  const [pastId, setPastId] = useState<string | null>(null);
  const [lastOpen, setLastOpen] = useState(false);

  const active = ds.trips.find((x) => isActiveStatus(x.status)) ?? null;
  const spots = ds.locations.filter((l) => l.lat != null).sort((a, b) => a.name.localeCompare(b.name, "ar"));
  const pastTrips = [...ds.trips].filter((x) => x.status !== "cancelled" && x.id !== active?.id).sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, 40);
  const fixed = fixedTripId ? idx.tripById.get(fixedTripId) ?? null : null;
  const tripLabel = (id: string) => {
    const tr = idx.tripById.get(id);
    if (!tr) return "";
    return `${fmtDate(tr.started_at, lang)} · ${tr.title || (tr.location_id && idx.locById.get(tr.location_id)?.name) || t("رحلة", "Trip")}`;
  };

  // Reset every time the sheet opens.
  if (open && !lastOpen) {
    setLastOpen(true);
    let spot: string | null = null;
    try {
      spot = localStorage.getItem("ft.marineSpot");
    } catch {}
    const base = fixed ?? active;
    setLoc(base?.location_id ?? (spot && idx.locById.has(spot) ? spot : null));
    setFishId(null);
    setFish("");
    setPhoto(null);
    setGps(null);
    setErr(null);
    setTarget(fixed ? "past" : active ? "active" : "none");
    setPastId(fixed?.id ?? null);
  }
  if (!open && lastOpen) setLastOpen(false);

  const chosenTrip = fixed ?? (target === "active" ? active : target === "past" && pastId ? idx.tripById.get(pastId) ?? null : null);

  const onFile = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      setPhoto((await addPhoto(f)).id);
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
      const speciesId = fishId === "__new" ? await resolveSpecies(ds, save, fish) : fishId;
      const c = newCatch(chosenTrip, {
        photo_media_id: photo,
        species_id: speciesId,
        identification_status: speciesId ? "manual" : "unidentified",
        location_id: loc,
        lat: gps?.lat ?? null,
        lng: gps?.lng ?? null,
        technique_id: chosenTrip?.technique_id ?? null,
      });
      await save("catches", c);
      void snapshotCatch(store, c); // sea conditions (incl. pressure) for this catch right away
      onClose();
      toast(
        chosenTrip
          ? t(`حُفظت الصيدة في رحلة «${tripLabel(chosenTrip.id)}» وأُضيفت لإحصائياتك`, `Catch saved to trip “${tripLabel(chosenTrip.id)}” and counted in your stats`)
          : t("حُفظت الصيدة وأُضيفت لإحصائياتك (بدون رحلة)", "Catch saved and counted in your stats (no trip)"),
        { label: t("أكمل التفاصيل", "Add details"), href: `/catch/edit?id=${c.id}` },
      );
    } catch {
      setErr(t("تعذر الحفظ، جرّب مرة ثانية", "Couldn't save, try again"));
    } finally {
      setSaving(false);
    }
  };

  const Opt = ({ id, title, sub }: { id: Target; title: string; sub: string }) => (
    <button
      type="button"
      onClick={() => setTarget(id)}
      className={cn("flex w-full items-center gap-3 rounded-2xl border px-3.5 py-2.5 text-start", target === id ? "border-2 border-ocean bg-ocean/10" : "border-line bg-surface-2")}
    >
      <span className={cn("size-[18px] shrink-0 rounded-full", target === id ? "border-[5px] border-ocean" : "border-2 border-ink-2")} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block truncate text-xs text-ink-2">{sub}</span>
      </span>
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} title={fixed ? t("أضف سمكة للرحلة", "Add a fish to this trip") : t("صيدة سريعة", "Quick catch")}>
      <div className="space-y-4">
        <div>
          {photo ? (
            <div className="relative">
              <Photo mediaId={photo} variant="full" className="aspect-[4/3] w-full rounded-xl" />
              <button type="button" aria-label="remove photo" onClick={() => setPhoto(null)} className="absolute end-2 top-2 grid size-9 place-items-center rounded-full bg-black/60 text-white">
                <X className="size-5" />
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="lg" variant="secondary" loading={busy} onClick={() => cam.current?.click()} className="min-h-24 flex-col">
                <Camera className="size-7" /> {t("تصوير", "Take photo")}
              </Button>
              <Button type="button" size="lg" variant="secondary" loading={busy} onClick={() => lib.current?.click()} className="min-h-24 flex-col">
                <ImagePlus className="size-7" /> {t("من الألبوم", "From album")}
              </Button>
            </div>
          )}
          <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onFile(e.target.files)} />
          <input ref={lib} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files)} />
        </div>

        <Field label={t("نوع السمكة", "Fish")}>
          <div className="space-y-2">
            <Select
              value={fishId}
              onChange={setFishId}
              placeholder={t("اختر من القائمة…", "Pick from the list…")}
              options={[
                ...[...ds.species].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).map((x) => ({ value: x.id, label: name(x) })),
                { value: "__new", label: t("＋ نوع ثاني (اكتب الاسم)", "+ Another fish (type the name)") },
              ]}
            />
            {fishId === "__new" && <Input value={fish} onChange={(e) => setFish(e.target.value)} placeholder={t("اكتب اسم السمكة", "Type the fish name")} autoComplete="off" />}
          </div>
        </Field>

        <Field label={t("الموقع", "Location")}>
          <div className="space-y-2">
            <Button type="button" variant="secondary" loading={gpsBusy} onClick={locate} className="w-full">
              <LocateFixed className="size-5" /> {gps ? t("✓ تم تحديد موقعي الحالي — تحديث", "✓ Current location set — refresh") : t("استخدم موقعي الحالي (GPS)", "Use my current location (GPS)")}
            </Button>
            <Select value={loc} onChange={setLoc} placeholder={t("أو اختر المكان من القائمة", "Or pick a spot from the list")} options={spots.map((l) => ({ value: l.id, label: lang === "ar" ? l.name : l.name_en || l.name }))} />
          </div>
        </Field>

        {fixed ? (
          <Notice tone="info">{t(`تُضاف إلى الرحلة: ${tripLabel(fixed.id)}`, `Added to trip: ${tripLabel(fixed.id)}`)}</Notice>
        ) : (
          <div>
            <div className="mb-1.5 text-sm text-ink-2">{t("أضفها إلى", "Add it to")}</div>
            <div className="space-y-2">
              {active && <Opt id="active" title={t("الرحلة الجارية", "Active trip")} sub={tripLabel(active.id)} />}
              <Opt id="past" title={t("رحلة سابقة", "An earlier trip")} sub={t("لما تكون بالبيت وتضبط بعد الرحلة", "When you're home sorting things after the trip")} />
              {target === "past" && (
                <Select
                  value={pastId}
                  onChange={setPastId}
                  placeholder={pastTrips.length ? t("اختر الرحلة…", "Pick the trip…") : t("ما عندك رحلات سابقة", "No earlier trips")}
                  options={pastTrips.map((x) => ({ value: x.id, label: tripLabel(x.id) }))}
                />
              )}
              <Opt id="none" title={t("بدون رحلة", "No trip")} sub={t("تنحفظ وتربطها بعدين", "Saved now, link it later")} />
            </div>
          </div>
        )}

        {err && <Notice tone="bad">{err}</Notice>}
        <Button size="lg" className="w-full" loading={saving} onClick={doSave}>
          {saving ? <Loader2 className="size-5 animate-spin" /> : null} {t("حفظ الصيدة", "Save catch")}
        </Button>
      </div>
    </Sheet>
  );
}

export function QuickCatch() {
  const { t } = useI18n();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  if (HIDDEN.some((p) => path.startsWith(p))) return null;
  return (
    <>
      <button
        type="button"
        aria-label={t("تسجيل سريع لصيدة", "Quick catch")}
        onClick={() => setOpen(true)}
        className="no-print fixed end-4 bottom-[calc(var(--safe-bottom)+5rem)] z-40 grid size-14 place-items-center rounded-full border border-white/20 bg-black text-white shadow-xl shadow-black/60 active:scale-95"
      >
        <Camera className="size-8 text-white" strokeWidth={2.4} />
      </button>
      <QuickCatchSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
