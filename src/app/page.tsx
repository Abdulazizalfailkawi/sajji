"use client";

// البحر — the home screen: live tide (سجي / ثبر / الوقفة), countdown to the
// next turning point, high/low events, interactive 24 h tide chart and marine
// conditions for the selected fishing spot. All times in Asia/Kuwait.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ExternalLink, Fish, LocateFixed, Sparkles, MapPinPlus, Settings as SettingsIcon, MapPin, PencilLine, Plus, RefreshCw, Sunrise, Sunset, Timer, Waves, Wind } from "lucide-react";
import { KindBadge } from "@/components/EnvPanel";
import { LocationForm } from "@/components/LocationForm";
import { TideChart } from "@/components/TideChart";
import { Badge, Button, Card, Choice, Empty, LinkButton, Notice, Sheet, Spinner, cn } from "@/components/ui";
import { SyncBadge } from "@/components/SyncBadge";
import { MOON_EMOJI, moonAt, sunTimes } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { getGps } from "@/lib/gps";
import { fmtHijri, toHijri } from "@/lib/hijri";
import { useNow } from "@/lib/hooks/useNow";
import { MOON_LABEL, useI18n } from "@/lib/i18n";
import { TIDE_SHIFT_DEFAULT_MIN, getConditions, hazards, hourAt, tideShiftMin, turnsOf, type ConditionsResult } from "@/lib/marine/client";
import { PRESET_SPOTS, presetRank } from "@/lib/marine/presets";
import { KMC_MARINE_URL } from "@/lib/marine/stations";
import { VerdictBanner } from "@/components/VerdictBanner";
import { verdictFor } from "@/lib/verdict";
import { compass, fmtWind, readWindUnit, saveWindUnit, type WindUnit } from "@/lib/marine/units";
import { saveDepthUnit, useDepthUnit, type DepthUnit } from "@/lib/depth";
import { checkForUpdate } from "@/lib/update";
import { tideNow, tideState, turningPointsFromEvents, type TurnEvent } from "@/lib/marine/waqfa";
import { CYCLE_LABEL, cycleInfo, readCycleConfig } from "@/lib/tidecycle";
import { dateKey, fmtDate, fmtDateTime, fmtTime } from "@/lib/time";
import { normalizeName } from "@/lib/normalize";
import { uuid } from "@/lib/ids";
import { isActiveStatus } from "@/lib/types";
import { useIsAdmin } from "@/lib/admin";
import { SaveSpotSheet } from "@/components/SaveSpotSheet";
import { PushSettings } from "@/components/PushSettings";

const H = 3_600_000;
const STALE_MS = 6 * H;

function hms(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
function dayName(ms: number, lang: "ar" | "en") {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { timeZone: "Asia/Kuwait", weekday: "long" }).format(new Date(ms));
}

function remain(ms: number, lang: "ar" | "en") {
  const m = Math.max(0, Math.round(ms / 60_000));
  return lang === "ar" ? `بعد ${Math.floor(m / 60)} س ${m % 60} د` : `in ${Math.floor(m / 60)}h ${m % 60}m`;
}

function Tile({ icon, title, tone, aside, hint, open, onToggle, className, children }: { icon: React.ReactNode; title: string; tone: "rise" | "fall" | "warn"; aside?: React.ReactNode; hint: string; open: boolean; onToggle: () => void; className?: string; children: React.ReactNode }) {
  const border = tone === "rise" ? "border-rise/40" : tone === "fall" ? "border-fall/40" : "border-warn/40";
  return (
    <Card className={cn("p-3.5", border, className)}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="mb-3 flex w-full items-center justify-between gap-2 text-start">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-2">
          {icon} {title}
          <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} />
          {!open && <span className="text-[10px] font-normal text-muted">{hint}</span>}
        </span>
        {aside}
      </button>
      {children}
    </Card>
  );
}

export default function MarineHome() {
  const store = useStore();
  const { ds, idx, online, hijriOffset, ready, save } = store;
  const { t, lang, setLang } = useI18n();
  const depthUnit = useDepthUnit();
  const isAdmin = useIsAdmin();
  const [headerTop, setHeaderTop] = useState(36);
  const [brandX, setBrandX] = useState(0);
  const [tideShift, setTideShift] = useState(TIDE_SHIFT_DEFAULT_MIN);
  useEffect(() => setTideShift(tideShiftMin()), []);
  const [wordAr, setWordAr] = useState({ x: 0, y: 0 });
  const [wordEn, setWordEn] = useState({ x: 0, y: 0 });
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem("ft.brandTop"));
      if (localStorage.getItem("ft.brandTop") != null && Number.isFinite(v)) setHeaderTop(Math.min(160, Math.max(0, v)));
      const rd = (k: string) => {
        try {
          const o = JSON.parse(localStorage.getItem(k) ?? "null");
          return o && Number.isFinite(o.x) && Number.isFinite(o.y) ? { x: Math.min(160, Math.max(-160, o.x)), y: Math.min(120, Math.max(-60, o.y)) } : null;
        } catch {
          return null;
        }
      };
      const wa = rd("ft.wordAr");
      const we = rd("ft.wordEn");
      if (wa) setWordAr(wa);
      if (we) setWordEn(we);
      const x = Number(localStorage.getItem("ft.brandX"));
      if (localStorage.getItem("ft.brandX") != null && Number.isFinite(x)) setBrandX(Math.min(140, Math.max(-140, x)));
    } catch {}
  }, []);
  const [setOpen, setSetOpen] = useState(false);
  const [upd, setUpd] = useState<string | null>(null);
  const now = useNow(1000);
  const [unit, setUnit] = useState<WindUnit>("kmh");
  const [spotId, setSpotId] = useState<string | null>(null);
  const [gpsPt, setGpsPt] = useState<{ lat: number; lng: number } | null>(null);
  const [res, setRes] = useState<ConditionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [open1, setOpen1] = useState(false);
  const [dayOff, setDayOff] = useState(0);
  const [open2, setOpen2] = useState(false);
  const [gpsErr, setGpsErr] = useState<string | null>(null);

  const spots = useMemo(
    () =>
      ds.locations
        .filter((l) => l.lat != null && l.lng != null)
        .sort((a, b) => {
          const ra = presetRank(a.name);
          const rb = presetRank(b.name);
          if (ra >= 0 || rb >= 0) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
          return Number(!!b.is_favorite) - Number(!!a.is_favorite) || a.name.localeCompare(b.name, "ar");
        }),
    [ds.locations],
  );

  // The four main areas are added once per device — and again whenever the
  // device has no spot at all (e.g. its data was cleared), so the sea screen
  // always works with or without an account. An existing spot with the same
  // name is never overwritten or duplicated.
  const seeding = useRef(false);
  useEffect(() => {
    if (!ready || seeding.current) return;
    let done = false;
    try {
      done = localStorage.getItem("ft.presetSpots") === "1";
    } catch {}
    const hasSpot = ds.locations.some((l) => l.lat != null && l.lng != null);
    if (done && hasSpot) return;
    seeding.current = true;
    try {
      localStorage.setItem("ft.presetSpots", "1");
    } catch {}
    const have = new Set(ds.locations.map((l) => normalizeName(l.name)));
    const ts = new Date().toISOString();
    void (async () => {
      for (const p of PRESET_SPOTS) {
        if (have.has(normalizeName(p.name))) continue;
        await save("locations", {
          id: uuid(),
          name: p.name,
          name_en: p.name_en,
          area: "الكويت",
          lat: p.lat,
          lng: p.lng,
          kind: "boat",
          notes: null,
          typical_depth_m: null,
          tide_station: "model",
          is_favorite: false,
          is_demo: false,
          created_at: ts,
          updated_at: ts,
        });
      }
      seeding.current = false;
    })();
  }, [ready, ds.locations.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setUnit(readWindUnit()), []);
  useEffect(() => {
    if (spotId || !spots.length) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("ft.marineSpot");
    } catch {}
    const pick = spots.find((s) => s.id === saved)?.id ?? spots[0].id;
    setSpotId(pick);
    try {
      localStorage.setItem("ft.marineSpot", pick);
    } catch {}
  }, [spots, spotId]);

  const spot = spots.find((s) => s.id === spotId) ?? null;
  const pt = gpsPt ?? (spot ? { lat: spot.lat!, lng: spot.lng! } : null);
  const hourKey = Math.floor(now / H);

  const load = useCallback(
    async (force = false) => {
      if (!pt) return;
      setLoading(true);
      const base = hourKey * H;
      setRes(await getConditions(pt.lat, pt.lng, new Date(base - 14 * H), new Date(base + 76 * H), { force }));
      setLoading(false);
    },
    [pt?.lat, pt?.lng, hourKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    void load();
  }, [load]);

  const c = res?.data ?? null;
  const today = dateKey(new Date(now));
  const model = useMemo(() => (c ? turnsOf(c, tideShift) : { pts: [], turns: [] as TurnEvent[] }), [c, tideShift]);
  const usingManual = false;
  const turns = model.turns;
  const dayStart = Date.parse(`${today}T00:00:00+03:00`) + dayOff * 24 * H;
  const dayTurns = turns.filter((x) => x.t >= dayStart && x.t < dayStart + 24 * H);
  const st = tideState(usingManual ? [] : model.pts, turns, now);
  const stale = !!res?.savedAt && now - res.savedAt > STALE_MS;
  const fetchedAge = c ? now - Date.parse(c.fetched_at) : 0;

  // When the last loaded turning point has passed, fetch a newer window.
  useEffect(() => {
    if (c && !usingManual && model.turns.length && !model.turns.some((x) => x.t > now) && online) void load(true);
  }, [c, usingManual, model.turns, now, online, load]);

  // The viewed day: today ("now") or a later day (its midday, or the hour tapped on the graph).
  const viewing = dayOff > 0;
  const viewMs = viewing ? dayStart + 12 * H : now;
  const refT = viewing ? sel ?? viewMs : now;
  const w = c ? hourAt(c.weather.hours, refT) : null;
  const cur = viewing ? null : c?.current ?? null;
  const wx = cur ?? w;
  const m = c ? hourAt(c.marine.hours, refT) : null;
  const moon = moonAt(new Date(viewMs));
  const sun = pt ? sunTimes(new Date(viewMs), pt.lat, pt.lng) : null;
  const warn = c ? hazards(c, viewing ? dayStart : now, viewing ? dayStart + 24 * H : now + 24 * H) : [];
  const hijri = toHijri(new Date(viewMs), hijriOffset);
  const cyc = cycleInfo(dateKey(new Date(viewMs)), hijriOffset, readCycleConfig());
  const active = ds.trips.find((x) => isActiveStatus(x.status));
  const chartFrom = viewing ? dayStart : now - 2 * H;
  const chartTo = viewing ? dayStart + 24 * H : now + 24 * H;
  const dayLevels = dayTurns.map((x) => x.h).filter((x): x is number => x != null);
  const clock = new Intl.DateTimeFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { timeZone: "Asia/Kuwait", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(now));
  const seaLevel: "calm" | "moderate" | "rough" | null =
    wx?.wind == null && m?.wave_h == null
      ? null
      : (wx?.wind ?? 0) >= 37 || (wx?.gust ?? 0) >= 50 || (m?.wave_h ?? 0) >= 1.5
        ? "rough"
        : (wx?.wind ?? 0) >= 20 || (m?.wave_h ?? 0) >= 0.6
          ? "moderate"
          : "calm";
  const seaLabel = seaLevel === "rough" ? t("رياح شديدة", "Rough") : seaLevel === "moderate" ? t("متوسط", "Moderate") : seaLevel === "calm" ? t("هادئ", "Calm") : "—";
  const verdict = verdictFor(c, viewing ? dayStart + 5 * H : now, viewing ? dayStart + 19 * H : now + 10 * H);
  const tn = viewing ? null : tideNow(turns, now);
  const selState = sel != null ? tideState(usingManual ? [] : model.pts, turns, sel) : null;

  const dirLabel = (d: string | null) =>
    d === "rising" ? t("سجي", "Saji · rising") : d === "falling" ? t("ثبر", "Thabr · falling") : d === "waqfa" ? t("وقفة", "Waqfa · slack") : "—";
  const dirColor = (d: string | null) => (d === "rising" ? "text-rise" : d === "falling" ? "text-fall" : "text-warn");

  return (
    <>
      {/* Header */}
      <header className="no-print mb-3 pb-1 pt-[calc(var(--safe-top)+0.75rem)]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-start">
          <div className="flex justify-start">
            <button aria-label={t("الإعدادات", "Settings")} onClick={() => setSetOpen(true)} className="grid size-10 place-items-center rounded-full border border-line bg-surface-2">
              <SettingsIcon className="size-5" />
            </button>
          </div>
          <div className="flex items-center justify-center gap-2" style={{ marginTop: isAdmin ? headerTop : 36, transform: `translateX(${isAdmin ? brandX : 0}px)` }}>
            <img src="/icons/sajji-mark.svg" alt="" className="size-24 shrink-0" />
            <div className="flex flex-col items-center leading-tight">
              <div className="text-5xl font-extrabold" style={{ transform: `translate(${isAdmin ? (lang === "ar" ? wordAr : wordEn).x : 0}px, ${isAdmin ? (lang === "ar" ? wordAr : wordEn).y : 0}px)` }}>{t("سجي", "SAJJI")}</div>
              <div className="mt-2 text-base font-semibold tracking-[0.3em] text-ocean" style={{ transform: `translate(${isAdmin ? (lang === "ar" ? wordEn : wordAr).x : 0}px, ${isAdmin ? (lang === "ar" ? wordEn : wordAr).y : 0}px)` }}>{lang === "ar" ? "SAJJI" : "سجي"}</div>
            </div>
          </div>
          <div className="flex justify-end">
            <button aria-label="refresh" disabled={!online || !pt || loading} onClick={() => load(true)} className="grid size-10 place-items-center rounded-full border border-line bg-surface-2 disabled:opacity-40">
              <RefreshCw className={cn("size-5", loading && "animate-spin")} />
            </button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <div className="relative">
              <select
                aria-label={t("موقع الصيد", "Fishing spot")}
                value={gpsPt ? "__gps" : spotId ?? ""}
                onChange={(e) => {
                  if (e.target.value === "__gps") return;
                  if (e.target.value === "__add") {
                    setAddOpen(true);
                    return;
                  }
                  setGpsPt(null);
                  setSpotId(e.target.value);
                  setSel(null);
                  try {
                    localStorage.setItem("ft.marineSpot", e.target.value);
                  } catch {}
                }}
                className="w-full appearance-none truncate bg-transparent pe-6 text-xl font-bold focus:outline-none"
              >
                {gpsPt && <option value="__gps">{t("موقعي (GPS)", "My location (GPS)")}</option>}
                {!spots.length && <option value="">{t("اختر موقعاً", "Choose a spot")}</option>}
                {spots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.is_favorite ? "★ " : ""}
                    {lang === "ar" ? s.name : s.name_en || s.name}
                  </option>
                ))}
                <option value="__add">{t("＋ إضافة موقع جديد…", "+ Add a new spot…")}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute end-0 top-1.5 size-5 text-muted" />
            </div>
          </div>
          <button
            type="button"
            aria-label={t("علّم هنا", "Mark here")}
            onClick={() => setMarkOpen(true)}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-ocean/50 bg-ocean/15 px-3 text-sm font-bold text-white"
          >
            <MapPinPlus className="size-4 text-ocean" /> {t("علّم هنا", "Mark here")}
          </button>
          <button
            aria-label="GPS"
            onClick={async () => {
              setGpsErr(null);
              try {
                setGpsPt(await getGps());
                setSel(null);
              } catch (e) {
                setGpsErr((e as Error).message === "DENIED" ? t("تم رفض إذن الموقع", "Location permission denied") : t("تعذر تحديد الموقع", "Location unavailable"));
              }
            }}
            className="grid size-10 shrink-0 place-items-center rounded-full border border-line bg-surface-2"
          >
            <LocateFixed className="size-5" />
          </button>
        </div>
        {gpsErr && <p className="mt-1 text-xs text-warn">{gpsErr}</p>}
      </header>

      {/* Active trip / new trip */}
      {active ? (
        <Card className="mb-3 flex items-center justify-between gap-2 border-teal/40">
          <div className="min-w-0">
            <div className="text-xs text-teal">{t("رحلة جارية", "Active trip")}</div>
            <div className="truncate font-semibold">{active.title || (active.location_id && idx.locById.get(active.location_id)?.name) || t("رحلة صيد", "Fishing trip")}</div>
            <div className="text-xs text-muted">
              {(idx.catchesByTrip.get(active.id) ?? []).length} {t("صيدة", "catches")}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <LinkButton href={`/catch/edit?trip=${active.id}`} variant="teal">
              <Fish className="size-5" /> {t("سجّل صيدة", "Log catch")}
            </LinkButton>
            <LinkButton href={`/trip?id=${active.id}`} variant="secondary">
              {t("الرحلة", "Trip")}
            </LinkButton>
          </div>
        </Card>
      ) : null}

      {!pt ? (
        <Empty
          icon="📍"
          title={t("اختر موقع صيد", "Choose a fishing spot")}
          action={
            <LinkButton href="/spots">
              <MapPin className="size-4" /> {t("أضف موقعاً بإحداثيات", "Add a spot with coordinates")}
            </LinkButton>
          }
        >
          {t("أضف موقعك المفضل (مثل الفنطاس) من الخريطة، أو اضغط GPS بالأعلى.", "Add your favourite spot (e.g. Al-Fintas) on the map, or tap GPS above.")}
        </Empty>
      ) : !c && loading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          {res?.error && !c && (
            <Notice tone="warn">{res.error === "OFFLINE" ? t("لا يوجد اتصال ولا توجد بيانات محفوظة لهذا الموقع.", "Offline and no saved data for this spot.") : t("تعذر الاتصال بمصدر البيانات.", "Couldn't reach the data provider.")}</Notice>
          )}
          {(stale || res?.stale) && c && (
            <Notice tone="warn" className="mb-3">
              {t(`بيانات قديمة (جُلبت ${fmtDateTime(c.fetched_at, "ar")}) — تعذر التحديث.`, `Stale data (fetched ${fmtDateTime(c.fetched_at, "en")}) — refresh failed.`)}
            </Notice>
          )}

        <VerdictBanner
          v={verdict}
          unit={unit}
          lang={lang}
          when={viewing ? t(`${dayName(viewMs, lang)} · من 5 الفجر إلى 7 المغرب`, `${dayName(viewMs, lang)} · 5am–7pm`) : t("للـ 10 ساعات الجاية", "Next 10 hours")}
        />

        {turns.length ? (
          <div className="mb-2 flex gap-2">
            {[0, 1, 2].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDayOff(d);
                  setSel(null);
                }}
                className={cn("flex-1 rounded-xl border px-2 py-1.5 text-center text-xs font-semibold", dayOff === d ? "border-ocean bg-ocean/20 text-white" : "border-line bg-surface-2 text-ink-2")}
              >
                {d === 0 ? t("اليوم", "Today") : d === 1 ? t("باجر", "Tomorrow") : dayName(dayStart - dayOff * 24 * H + d * 24 * H + 12 * H, lang)}
              </button>
            ))}
          </div>
        ) : null}

          {/* Tile 1 — tide & clock */}
          <Tile
            icon={<Waves className="size-4" />}
            title={t("المد والجزر", "Tide")}
            tone={viewing ? "rise" : st.direction === "rising" ? "rise" : st.direction === "falling" ? "fall" : "warn"}
            open={open1}
            onToggle={() => setOpen1((v) => !v)}
            hint={t("اضغط للتفاصيل", "Tap for details")}
            aside={viewing ? <span className="text-sm font-bold">{dayName(viewMs, lang)}</span> : <span className="ltr font-mono text-lg font-bold tabular-nums">{clock}</span>}
          >
            {viewing ? (
              <div>
                <div className="text-xl font-extrabold">
                  {dayName(viewMs, lang)} · {fmtDate(new Date(viewMs), lang)}
                </div>
                <div className="mt-1 text-xs text-white">
                  {dayLevels.length ? (
                    <bdi>
                      {t(`أعلى منسوب ${Math.max(...dayLevels).toFixed(2)} م · أدنى منسوب ${Math.min(...dayLevels).toFixed(2)} م`, `High ${Math.max(...dayLevels).toFixed(2)} m · low ${Math.min(...dayLevels).toFixed(2)} m`)}
                    </bdi>
                  ) : (
                    t("بيانات المد غير متوفرة", "Tide data unavailable")
                  )}
                </div>
                <div className="mt-1 text-[11px] text-muted">{t("توقع لهذا اليوم — يتحدّث مع الأيام", "Forecast for this day — it updates as the day gets closer")}</div>
              </div>
            ) : st.direction ? (
              <>
              {tn && (
                <div className="mb-3 rounded-xl bg-black/25 px-3 py-2 text-base font-bold leading-snug">
                  {tn.kind === "at_high"
                    ? t("🌊 الحين مد عالي", "🌊 High tide now")
                    : tn.kind === "at_low"
                      ? t("🌊 الحين جزر", "🌊 Low tide now")
                      : tn.kind === "rising"
                        ? t("⬆️ الماي ياخذ (طالع)", "⬆️ Water taking (rising)")
                        : t("⬇️ الماي يعطي (نازل)", "⬇️ Water giving (falling)")}
                  <div className="mt-0.5 text-xs font-normal text-ink-2">
                    {tn.kind === "at_high" || tn.kind === "at_low"
                      ? t(`ذروته ${fmtTime(tn.turn.t, lang)}${tn.next ? ` · بعده ${tn.next.type === "high" ? "مد" : "جزر"} ${fmtTime(tn.next.t, lang)}` : ""}`, `Peak ${fmtTime(tn.turn.t, lang)}`)
                      : t(`${tn.next!.type === "high" ? "المد العالي" : "الجزر"} بعد ${Math.floor(tn.minutes / 60)} س ${tn.minutes % 60} د (${fmtTime(tn.next!.t, lang)})`, `${tn.next!.type === "high" ? "High tide" : "Low tide"} in ${Math.floor(tn.minutes / 60)}h ${tn.minutes % 60}m (${fmtTime(tn.next!.t, lang)})`)}
                  </div>
                </div>
              )}
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className={cn("flex items-center gap-1.5 text-4xl font-extrabold", dirColor(st.direction))}>
                    {st.direction === "rising" ? <ArrowUp className="size-9" strokeWidth={3} /> : st.direction === "falling" ? <ArrowDown className="size-9" strokeWidth={3} /> : <Timer className="size-8" />}
                    {dirLabel(st.direction)}
                  </div>
                  <div className="mt-1 text-xs text-ink-2">
                    {st.level != null && (
                      <bdi>
                        {st.level} {t("م", "m")}
                      </bdi>
                    )}
                    {st.rateCmPerH != null && (
                      <span className="text-muted">
                        {" · "}
                        <bdi>
                          {st.rateCmPerH > 0 ? "+" : ""}
                          {st.rateCmPerH} {t("سم/ساعة", "cm/h")}
                        </bdi>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-end">
                  <div className="text-[11px] text-warn">{st.direction === "waqfa" ? t("تنتهي الوقفة بعد", "Waqfa ends in") : t("الوقفة بعد", "Waqfa in")}</div>
                  {st.turn ? (
                    <div className="ltr font-mono text-2xl font-extrabold tabular-nums">{st.direction === "waqfa" && st.turn.waqfaEnd ? hms(st.turn.waqfaEnd - now) : hms((st.turn.waqfaStart ?? st.turn.t) - now)}</div>
                  ) : (
                    <div className="text-xs text-muted">{t("بيانات الوقفة غير متوفرة حالياً", "Waqfa data currently unavailable")}</div>
                  )}
                </div>
              </div>
              </>
            ) : (
              <div className="text-sm text-muted">{t("بيانات المد غير متوفرة", "Tide data unavailable")}</div>
            )}
            {turns.length ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {([
                  { type: "high" as const, l: t("أعلى مد", "High tide"), cls: "text-rise", Icon: ArrowUp },
                  { type: "low" as const, l: t("أدنى جزر", "Low tide"), cls: "text-fall", Icon: ArrowDown },
                ]).map(({ type, l, cls, Icon }) => {
                  const list = dayTurns.filter((x) => x.type === type);
                  const nextT = st.turn && st.turn.type === type ? st.turn.t : (type === "high" ? st.nextHigh : st.nextLow)?.t;
                  const nth = (i: number) => (list.length > 1 ? [t("الأول", "1st"), t("الثاني", "2nd"), t("الثالث", "3rd")][i] ?? "" : "");
                  return (
                    <div key={type} className="rounded-xl bg-surface-2 px-3 py-2">
                      <div className={cn("flex items-center gap-1 text-[11px]", cls)}>
                        <Icon className="size-3" /> {l} <span className="text-white">· {dayOff === 0 ? t("اليوم", "today") : dayOff === 1 ? t("باجر", "tomorrow") : dayName(dayStart + 12 * H, lang)}</span>
                      </div>
                      {list.length ? (
                        list.map((e, i) => {
                          const past = e.t < now;
                          return (
                            <div key={e.t} className="mt-1.5">
                              <div className="whitespace-nowrap text-lg font-bold leading-tight">{fmtTime(e.t, lang)}</div>
                              <div className={cn("text-[11px] leading-tight text-white", dayOff === 0 && !past && e.t === nextT && "font-semibold")}>
                                {nth(i)} {nth(i) ? "· " : ""}
                                {dayOff > 0 ? (e.h != null ? <bdi>{`${e.h} ${t("م", "m")}`}</bdi> : "") : past ? t("مضى", "passed") : remain(e.t - now, lang)}
                              </div>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-sm text-muted">—</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {open1 && (
              <div className="mt-3 space-y-2 border-t border-line/40 pt-3 text-sm">
                {!viewing && st.turn && (
                  <div className="text-xs text-ink-2">
                    {st.turn.type === "high" ? t("سجي ← ثبر", "Saji → Thabr") : t("ثبر ← سجي", "Thabr → Saji")} · {t("التحول", "turn")} {fmtTime(st.turn.t, lang)}
                    {st.turn.waqfaStart != null && st.turn.waqfaEnd != null ? (
                      <>
                        {" · "}
                        {t("الوقفة تقريباً", "Waqfa approx.")} {fmtTime(st.turn.waqfaStart, lang)}–{fmtTime(st.turn.waqfaEnd, lang)}
                        {st.turn.uncertaintyMin ? ` · ±${st.turn.uncertaintyMin} ${t("د", "min")}` : ""}
                      </>
                    ) : (
                      <> · {t("وقت الحدث فقط — مدة الوقفة غير معروفة", "Event time only — waqfa duration unknown")}</>
                    )}
                    <div className="text-[10px] text-warn/90">{t("وقت متوقع وليس مؤكداً", "Predicted, not guaranteed")}</div>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge>
                    {fmtDate(new Date(viewMs), lang, { weekday: "long" })} · {fmtDate(new Date(viewMs), lang)}
                  </Badge>
                  <Badge>{fmtHijri(hijri, lang)}</Badge>
                  <Badge>
                    {MOON_EMOJI[moon.phase]} {MOON_LABEL[moon.phase][lang]} {Math.round(moon.illumination * 100)}%
                  </Badge>
                  {sun?.sunrise && (
                    <Badge>
                      <Sunrise className="size-3" /> {fmtTime(sun.sunrise, lang)}
                    </Badge>
                  )}
                  {sun?.sunset && (
                    <Badge>
                      <Sunset className="size-3" /> {fmtTime(sun.sunset, lang)}
                    </Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <a href={KMC_MARINE_URL} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 px-2 text-xs text-teal underline">
                    {t("الجدول الرسمي", "Official table")} <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
            )}
          </Tile>

          {/* Tile 2 — sea state */}
          <Tile
            className="mt-2"
            icon={<Wind className="size-4" />}
            title={t("حالة البحر", "Sea state")}
            tone={seaLevel === "rough" ? "fall" : seaLevel === "moderate" ? "warn" : "rise"}
            open={open2}
            onToggle={() => setOpen2((v) => !v)}
            hint={t("اضغط للتفاصيل", "Tap for details")}
            aside={<span className={cn("rounded-full px-2.5 py-0.5 text-sm font-bold", seaLevel === "rough" ? "bg-fall/15 text-fall" : seaLevel === "moderate" ? "bg-warn/15 text-warn" : seaLevel === "calm" ? "bg-rise/15 text-rise" : "bg-surface-2 text-muted")}>{seaLabel}</span>}
          >
            {viewing && (
              <p className="mb-2 text-[11px] text-ink-2">
                {t(`التوقع عند ${fmtTime(refT, lang)} — اضغط على الجراف لتغيير الساعة`, `Forecast at ${fmtTime(refT, lang)} — tap the graph to change the hour`)}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-ocean/30 bg-ocean/10 px-2 py-2">
                <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-ocean">
                  <Wind className="size-3" /> {t("الرياح", "Wind")}
                </div>
                <div className="text-lg font-extrabold text-white">{wx?.wind != null ? fmtWind(wx.wind, unit, lang) : "—"}</div>
                <div className="text-[11px] text-ink">{wx?.wind != null ? compass(wx.dir, lang) : ""}</div>
              </div>
              <div className="rounded-xl border border-ocean/30 bg-ocean/10 px-2 py-2">
                <div className="flex items-center justify-center gap-1 text-[11px] font-medium text-ocean">
                  <Waves className="size-3" /> {t("الموج", "Waves")}
                </div>
                <div className="text-lg font-extrabold text-white">
                  {m?.wave_h != null ? (
                    <bdi>
                      {m.wave_h} {t("م", "m")}
                    </bdi>
                  ) : (
                    "—"
                  )}
                </div>
                <div className="text-[11px] text-ink">{m?.wave_dir != null ? compass(m.wave_dir, lang) : ""}</div>
              </div>
              <div className="rounded-xl border border-ocean/30 bg-ocean/10 px-2 py-2">
                <div className="text-[11px] font-medium text-ocean">{t("حرارة الماء", "Water")}</div>
                <div className="text-lg font-extrabold text-white">{m?.sst != null ? `${m.sst}°` : "—"}</div>
                <div className="text-[11px] text-ink">{wx?.temp != null ? <>{t("الجو", "Air")} <bdi>{wx.temp}°</bdi></> : ""}</div>
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-sm">
              <span className="text-[11px] font-medium text-white">{t("دورة اليوم", "Today's cycle")}</span>
              <span className="font-bold">
                <span className="text-white">{t(`${CYCLE_LABEL[cyc.cycle].ar} — اليوم`, `${CYCLE_LABEL[cyc.cycle].en} — day`)}</span>{" "}
                <span className="text-white">{cyc.day}</span>
              </span>
            </div>
            {warn.length > 0 && (
              <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-warn/10 px-3 py-2 text-xs text-warn">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>{warn.map((x) => t(x.ar, x.en)).join(" · ")}</span>
              </div>
            )}
            {open2 && (
              <div className="mt-3 space-y-2 border-t border-line/40 pt-3 text-xs text-ink-2">
                {wx?.wind != null && (
                  <div>
                    {t("هبات", "Gusts")} {fmtWind(wx.gust, unit, lang)} <KindBadge kind={cur ? "forecast" : (w?.k ?? "unavailable")} />
                  </div>
                )}
                {m?.wave_h != null && (
                  <div>
                    {m.wave_p != null ? `${t("فترة الموج", "Period")} ${m.wave_p} ${t("ث", "s")} · ` : ""}
                    {m.swell_h != null && (
                      <>
                        {t("سويل", "Swell")} {m.swell_h} {t("م", "m")} · {t("موج رياح", "wind waves")} {m.wind_wave_h ?? "—"} {t("م", "m")}
                      </>
                    )}{" "}
                    <KindBadge kind={m?.k ?? "unavailable"} />
                  </div>
                )}
                {wx?.temp != null && (
                  <div>
                    {t("الإحساس", "Feels")} {wx.feels ?? "—"}° · {t("رطوبة", "RH")} {wx.rh ?? "—"}%{w?.pprob != null ? ` · ${t("احتمال مطر", "Rain chance")} ${w.pprob}%` : ""}
                  </div>
                )}
                {m?.cur_v != null && (
                  <div>
                    {t("التيار (نموذج)", "Current (model)")} {(m.cur_v / 1.852).toFixed(1)} {t("عقدة", "kn")}
                  </div>
                )}
                <p className="text-[11px] text-muted">
                  {t("ارتفاع الموج من نموذج بحري بدقة ~٨ كم، وقد يقلّل الموج قرب الساحل الضحل في شمال الخليج؛ قارنه بالنشرة الرسمية قبل الخروج.", "Wave height comes from an ocean model at ~8 km resolution and can under-estimate waves near the shallow northern Gulf coast; compare with the official bulletin before going out.")}
                </p>
                <p className="text-[11px] text-muted">
                  {t("التصنيف: هادئ، متوسط، أو شديد حسب الرياح (٢٠ و٣٧ كم/س) والموج (٠٫٦ و١٫٥ م). هذا تقدير مبسّط وليس نشرة رسمية.", "Calm / moderate / rough from wind (20 and 37 km/h) and waves (0.6 and 1.5 m). A simple estimate, not an official bulletin.")}
                </p>
                <a href={KMC_MARINE_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-teal underline">
                  {t("النشرة البحرية الرسمية", "Official marine bulletin")} <ExternalLink className="size-3" />
                </a>
                {c && (
                  <div className="overflow-x-auto">
                    <div className="mb-1 mt-1 font-semibold text-ink">{t("الساعات القادمة", "Hour by hour")}</div>
                    <table className="w-full text-xs">
                      <thead className="text-muted">
                        <tr className="border-b border-line/50">
                          <th className="p-2 text-start font-medium">{t("الوقت", "Time")}</th>
                          <th className="p-2 font-medium">{t("المد", "Tide")}</th>
                          <th className="p-2 font-medium">{t("رياح", "Wind")}</th>
                          <th className="p-2 font-medium">{t("موج", "Wave")}</th>
                          <th className="p-2 font-medium">°C</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.weather.hours
                          .filter((h) => Date.parse(h.t) >= (viewing ? dayStart : now - H / 2) && Date.parse(h.t) <= (viewing ? dayStart + 24 * H : now + 24 * H))
                          .map((h) => {
                            const tt = Date.parse(h.t);
                            const mh = hourAt(c.marine.hours, tt);
                            const s2 = tideState(model.pts, model.turns, tt);
                            return (
                              <tr key={h.t} className="border-b border-line/30">
                                <td className="p-2">{fmtTime(tt, lang)}</td>
                                <td className={cn("p-2 text-center", dirColor(s2.direction))}>{s2.direction ? dirLabel(s2.direction) : "—"}</td>
                                <td className="p-2 text-center">
                                  {h.wind != null ? fmtWind(h.wind, unit, lang).split(" ")[0] : "—"} <span className="text-muted">{compass(h.dir, lang)}</span>
                                </td>
                                <td className="p-2 text-center">{mh?.wave_h ?? "—"}</td>
                                <td className="p-2 text-center">{h.temp ?? "—"}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </Tile>

          {/* Tile 3 — tide graph */}
          <Card className="mt-2 p-3">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{t("Graph — صعود وهبوط", "Graph — rise & fall")}{viewing ? ` — ${dayName(viewMs, lang)}` : ""}</span>
              <Link href={`/best-times?day=${dayOff}`} className="flex items-center gap-1 rounded-full border border-ocean/50 bg-ocean/10 px-2.5 py-1 text-xs font-semibold text-white">
                <Sparkles className="size-3.5 text-ocean" /> {t("أفضل الأوقات", "Best times")}
              </Link>
              {sel != null && (
                <button className="text-xs text-teal" onClick={() => setSel(null)}>
                  {t("عودة للآن", "Back to now")}
                </button>
              )}
            </div>
            {!usingManual && model.pts.length > 3 ? (
              <>
                <div className="mb-1 min-h-10 rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
                  {sel != null && selState ? (
                    <div className="flex flex-wrap items-center gap-x-3">
                      <b className="ltr">{fmtTime(sel, lang)}</b>
                      <span className={dirColor(selState.direction)}>{dirLabel(selState.direction)}</span>
                      {selState.level != null && (
                        <bdi>
                          {selState.level} {t("م", "m")}
                        </bdi>
                      )}
                      {selState.next && (
                        <span className="text-xs text-muted">
                          {selState.next.type === "high" ? t("أعلى مد", "High") : t("أدنى جزر", "Low")} {remain(selState.next.t - sel, lang)}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-muted">{t("اسحب على المنحنى لمعرفة الوقت والمد", "Drag across the curve to read time and tide")}</span>
                  )}
                </div>
                <TideChart pts={model.pts} turns={model.turns} from={chartFrom} to={chartTo} now={now} selected={sel} onSelect={setSel} />
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted">
                  <span className="flex items-center gap-1">
                    <span className="h-1 w-4 rounded-full bg-rise" /> {t("سجي (صعود)", "Saji (rising)")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-1 w-4 rounded-full bg-fall" /> {t("ثبر (هبوط)", "Thabr (falling)")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-3 w-4 rounded-sm bg-warn/20" /> {t("وقفة تقديرية", "Estimated waqfa")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-0 w-4 border-t-2 border-dashed border-warn" /> {t("الآن", "now")}
                  </span>
                </div>
              </>
            ) : usingManual ? (
              <p className="text-sm text-muted">{t("تستخدم أوقاتاً يدوية لهذا اليوم — لا يوجد منحنى مُقاس، فلا نرسم منحنى مخترعاً.", "Using manual times for today — no measured curve, so none is drawn.")}</p>
            ) : (
              <p className="text-sm text-muted">{t("بيانات مستوى البحر غير متوفرة لهذا الموقع.", "Sea-level data unavailable for this spot.")}</p>
            )}
          </Card>

        </>
      )}

      <Sheet open={setOpen} onClose={() => setSetOpen(false)} title={t("الإعدادات", "Settings")}>
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t("حالة المزامنة", "Sync status")}</span>
            <SyncBadge />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">{t("وحدة الرياح", "Wind unit")}</div>
            <Choice<WindUnit>
              value={unit}
              allowClear={false}
              onChange={(v) => {
                if (!v) return;
                setUnit(v);
                saveWindUnit(v);
              }}
              options={[
                { value: "kmh", label: t("كم/س", "km/h") },
                { value: "kn", label: t("عقدة", "knots") },
                { value: "ms", label: t("م/ث", "m/s") },
              ]}
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">{t("وحدة العمق", "Depth unit")}</div>
            <Choice<DepthUnit>
              value={depthUnit}
              allowClear={false}
              onChange={(v) => v && saveDepthUnit(v)}
              options={[
                { value: "ft", label: t("قدم", "feet") },
                { value: "m", label: t("متر", "metres") },
              ]}
            />
          </div>
          {isAdmin && (
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-medium">
              <span>{t("موضع الشعار والاسم (فوق / تحت)", "Logo & name position (up / down)")}</span>
              <button
                type="button"
                className="text-xs text-teal"
                onClick={() => {
                  setHeaderTop(36);
                  setBrandX(0);
                  setWordAr({ x: 0, y: 0 });
                  setWordEn({ x: 0, y: 0 });
                  try {
                    localStorage.removeItem("ft.wordAr");
                    localStorage.removeItem("ft.wordEn");
                  } catch {}
                  try {
                    localStorage.removeItem("ft.brandX");
                    localStorage.removeItem("ft.brandTop");
                  } catch {}
                }}
              >
                {t("إعادة", "Reset")}
              </button>
            </div>
            <input
              type="range"
              min={0}
              max={160}
              step={4}
              value={headerTop}
              aria-label={t("موضع الشعار", "Logo position")}
              onChange={(e) => {
                const v = Number(e.target.value);
                setHeaderTop(v);
                try {
                  localStorage.setItem("ft.brandTop", String(v));
                } catch {}
              }}
              className="w-full accent-[#7fb6f0]"
            />
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{t("أعلى", "Higher")}</span>
              <span>{t("أنزل", "Lower")}</span>
            </div>
            <div className="mb-1 mt-4 text-sm font-medium">{t("يمين / يسار", "Right / left")}</div>
            <input
              type="range"
              dir="ltr"
              min={-140}
              max={140}
              step={4}
              value={brandX}
              aria-label={t("يمين يسار", "Right left")}
              onChange={(e) => {
                const v = Number(e.target.value);
                setBrandX(v);
                try {
                  localStorage.setItem("ft.brandX", String(v));
                } catch {}
              }}
              className="w-full accent-[#7fb6f0]"
            />
            <div dir="ltr" className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{t("يسار", "Left")}</span>
              <span>{t("يمين", "Right")}</span>
            </div>
            <div className="mt-4 rounded-xl border border-line/60 p-3">
              <div className="mb-1 flex items-center justify-between text-sm font-medium">
                <span>{t("تقريب توقيت المد والجزر", "Tide time adjustment")}</span>
                <button
                  type="button"
                  className="text-xs text-teal"
                  onClick={() => {
                    setTideShift(TIDE_SHIFT_DEFAULT_MIN);
                    try {
                      localStorage.removeItem("ft.tideAdjust");
                    } catch {}
                  }}
                >
                  {t("إعادة", "Reset")}
                </button>
              </div>
              <div className="text-xs text-ink-2">{t(`تعديل إضافي فوق تصحيح المكان: ${tideShift > 0 ? "+" : ""}${tideShift} دقيقة`, `Extra adjustment on top of the place calibration: ${tideShift > 0 ? "+" : ""}${tideShift} min`)}</div>
              <input
                type="range"
                dir="ltr"
                min={-60}
                max={60}
                step={5}
                value={tideShift}
                aria-label={t("تقريب توقيت المد", "Tide time adjustment")}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setTideShift(v);
                  try {
                    localStorage.setItem("ft.tideAdjust", String(v));
                  } catch {}
                }}
                className="w-full accent-[#7fb6f0]"
              />
            </div>
            {(
              [
                { k: "ft.wordAr", title: t("كلمة «سجي» (عربي)", "The Arabic word «سجي»"), v: wordAr, set: setWordAr },
                { k: "ft.wordEn", title: t("كلمة SAJJI (إنجليزي)", "The English word SAJJI"), v: wordEn, set: setWordEn },
              ] as const
            ).map((w) => (
              <div key={w.k} className="mt-4 rounded-xl border border-line/60 p-3">
                <div className="mb-2 text-sm font-medium">{w.title}</div>
                <div className="text-[11px] text-muted">{t("فوق / تحت", "Up / down")}</div>
                <input
                  type="range"
                  min={-60}
                  max={120}
                  step={2}
                  value={w.v.y}
                  aria-label={`${w.title} ${t("فوق تحت", "up down")}`}
                  onChange={(e) => {
                    const nv = { ...w.v, y: Number(e.target.value) };
                    w.set(nv);
                    try {
                      localStorage.setItem(w.k, JSON.stringify(nv));
                    } catch {}
                  }}
                  className="w-full accent-[#7fb6f0]"
                />
                <div className="mt-1 text-[11px] text-muted">{t("يمين / يسار", "Right / left")}</div>
                <input
                  type="range"
                  dir="ltr"
                  min={-160}
                  max={160}
                  step={2}
                  value={w.v.x}
                  aria-label={`${w.title} ${t("يمين يسار", "right left")}`}
                  onChange={(e) => {
                    const nv = { ...w.v, x: Number(e.target.value) };
                    w.set(nv);
                    try {
                      localStorage.setItem(w.k, JSON.stringify(nv));
                    } catch {}
                  }}
                  className="w-full accent-[#7fb6f0]"
                />
                <div dir="ltr" className="mt-1 flex justify-between text-[11px] text-muted">
                  <span>{t("يسار", "Left")}</span>
                  <span>{t("يمين", "Right")}</span>
                </div>
              </div>
            ))}
          </div>
          )}
          <PushSettings spots={spots} currentId={spotId} />
          <div>
            <div className="mb-2 text-sm font-medium">{t("اللغة", "Language")}</div>
            <Choice<"ar" | "en">
              value={lang}
              allowClear={false}
              onChange={(v) => v && setLang(v)}
              options={[
                { value: "ar", label: "العربية" },
                { value: "en", label: "English" },
              ]}
            />
          </div>
          <div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={async () => {
                setUpd(t("جارٍ التحقق…", "Checking…"));
                const r = await checkForUpdate();
                if (r === "available") {
                  setSetOpen(false);
                  window.dispatchEvent(new Event("ft:update-available"));
                } else setUpd(r === "latest" ? t("أنت على آخر إصدار ✓", "You're on the latest version ✓") : t("تعذر التحقق — تحقق من الاتصال", "Couldn't check — are you online?"));
              }}
            >
              <RefreshCw className="size-4" /> {t("التحقق من التحديثات", "Check for updates")}
            </Button>
            {upd && <p className="mt-2 text-center text-xs text-ink-2">{upd}</p>}
          </div>
          <Button variant="secondary" className="w-full" onClick={() => { setSetOpen(false); window.dispatchEvent(new Event("ft:welcome")); }}>
            {t("دليل الاستخدام وتثبيت التطبيق", "Guide & install the app")}
          </Button>
          {isAdmin && (
            <Link href="/admin" className="block rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-center text-sm font-bold text-warn">
              {t("لوحة المشرف", "Admin dashboard")}
            </Link>
          )}
          <Link href="/settings" className="block rounded-xl border border-line bg-surface-2 px-4 py-3 text-center text-sm font-medium">
            {t("كل الإعدادات", "All settings")}
          </Link>
        </div>
      </Sheet>
      <SaveSpotSheet open={markOpen} onClose={() => setMarkOpen(false)} />
      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title={t("موقع جديد", "New spot")}>
        <LocationForm
          onDone={(id) => {
            setAddOpen(false);
            if (id) {
              setGpsPt(null);
              setSpotId(id);
              setSel(null);
              try {
                localStorage.setItem("ft.marineSpot", id);
              } catch {}
            }
          }}
        />
      </Sheet>
    </>
  );
}
