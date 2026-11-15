"use client";

// البحر — the home screen: live tide (سجي / ثبر / الوقفة), countdown to the
// next turning point, high/low events, interactive 24 h tide chart and marine
// conditions for the selected fishing spot. All times in Asia/Kuwait.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, LocateFixed, MapPin, MapPinPlus, RefreshCw, Settings as SettingsIcon, Users } from "lucide-react";
import { LocationForm } from "@/components/LocationForm";
import { TideChart } from "@/components/TideChart";
import { Button, Card, Choice, Empty, Notice, Sheet, Spinner, cn } from "@/components/ui";
import { SyncBadge } from "@/components/SyncBadge";
import { CaptureCTA, DayStrip, SeaHero, StatTiles, type StripDay } from "@/components/SeaHome";
import { openQuickCatch } from "@/components/BottomNav";
import { moonAt } from "@/lib/astro";
import { useCommunityActivity } from "@/lib/community";
import { useStore } from "@/lib/db/store";
import { getGps } from "@/lib/gps";
import { useNow } from "@/lib/hooks/useNow";
import { useI18n } from "@/lib/i18n";
import { TIDE_SHIFT_DEFAULT_MIN, getConditions, hazards, hourAt, tideShiftMin, turnsOf, type ConditionsResult } from "@/lib/marine/client";
import { PRESET_SPOTS, presetRank } from "@/lib/marine/presets";
import { compass, fmtWind, readWindUnit, saveWindUnit, type WindUnit } from "@/lib/marine/units";
import { saveDepthUnit, useDepthUnit, type DepthUnit } from "@/lib/depth";
import { checkForUpdate } from "@/lib/update";
import { tideState, type TurnEvent } from "@/lib/marine/waqfa";
import { cycleShortLabel, readCycleConfig } from "@/lib/tidecycle";
import { dateKey, fmtDate, fmtDateTime, fmtTime } from "@/lib/time";
import { normalizeName } from "@/lib/normalize";
import { uuid } from "@/lib/ids";
import { useIsAdmin } from "@/lib/admin";
import { SaveSpotSheet } from "@/components/SaveSpotSheet";
import { PushSettings } from "@/components/PushSettings";
import { kuwaitMidnight } from "@/lib/marine/client";
import { pressureAt } from "@/lib/pressure";

const H = 3_600_000;
const STALE_MS = 6 * H;

function dayName(ms: number, lang: "ar" | "en") {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { timeZone: "Asia/Kuwait", weekday: "long" }).format(new Date(ms));
}

function remain(ms: number, lang: "ar" | "en") {
  const m = Math.max(0, Math.round(ms / 60_000));
  return lang === "ar" ? `بعد ${Math.floor(m / 60)} س ${m % 60} د` : `in ${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function MarineHome() {
  const store = useStore();
  const { ds, online, hijriOffset, ready, save, mode } = store;
  const router = useRouter();
  const activity = useCommunityActivity();
  const { t, lang, setLang } = useI18n();
  const depthUnit = useDepthUnit();
  const isAdmin = useIsAdmin();
  const [tideShift, setTideShift] = useState(TIDE_SHIFT_DEFAULT_MIN);
  useEffect(() => setTideShift(tideShiftMin()), []);
  const [setOpen, setSetOpen] = useState(false);
  const [upd, setUpd] = useState<string | null>(null);
  const now = useNow(15000);
  const [unit, setUnit] = useState<WindUnit>("kmh");
  const [spotId, setSpotId] = useState<string | null>(null);
  const [gpsPt, setGpsPt] = useState<{ lat: number; lng: number } | null>(null);
  const [res, setRes] = useState<ConditionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [markOpen, setMarkOpen] = useState(false);
  const [dayOff, setDayOff] = useState(0);
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
      setRes(await getConditions(pt.lat, pt.lng, new Date(Math.min(base - 14 * H, kuwaitMidnight(base) - 6 * H)), new Date(kuwaitMidnight(base) + 7 * 24 * H), { force }));
      setLoading(false);
    },
    [pt?.lat, pt?.lng, hourKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    void load();
  }, [load]);
  // Keep "now" fresh: re-check every 5 min while the app is open (cached for 10 min,
  // so this is cheap) and as soon as the app comes back to the foreground.
  useEffect(() => {
    if (!pt) return;
    const tick = () => document.visibilityState === "visible" && navigator.onLine && void load();
    const id = setInterval(tick, 5 * 60_000);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("online", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("online", tick);
    };
  }, [pt?.lat, pt?.lng, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const c = res?.data ?? null;
  const today = dateKey(new Date(now));
  const model = useMemo(() => (c ? turnsOf(c, tideShift) : { pts: [], turns: [] as TurnEvent[] }), [c, tideShift]);
  const usingManual = false;
  const turns = model.turns;
  const dayStart = Date.parse(`${today}T00:00:00+03:00`) + dayOff * 24 * H;
  const dayTurns = turns.filter((x) => x.t >= dayStart && x.t < dayStart + 24 * H);
  const st = tideState(usingManual ? [] : model.pts, turns, now);
  const stale = !!res?.savedAt && now - res.savedAt > STALE_MS;

  // When the last loaded turning point has passed, fetch a newer window.
  useEffect(() => {
    if (c && !usingManual && model.turns.length && !model.turns.some((x) => x.t > now) && online) void load(true);
  }, [c, usingManual, model.turns, now, online, load]);

  // The viewed day: today ("now") or a later day (its midday, or the hour tapped on the graph).
  const viewing = dayOff > 0;
  const viewMs = viewing ? dayStart + 12 * H : now;
  const refT = viewing ? sel ?? viewMs : now;
  const w = c ? hourAt(c.weather.hours, refT) : null;
  const cur = viewing || !c?.current || now - Date.parse(c.current.t) > 45 * 60_000 ? null : c.current; // a nowcast older than 45 min is not "now"
  const wx = cur ?? w;
  const pr = c ? pressureAt(c.weather.hours, refT) : null;
  const moon = moonAt(new Date(viewMs));
  const warn = c ? hazards(c, viewing ? dayStart : now, viewing ? dayStart + 24 * H : now + 24 * H) : [];
  const chartFrom = viewing ? dayStart : now - 2 * H;
  const chartTo = viewing ? dayStart + 24 * H : now + 24 * H;
  const selState = sel != null ? tideState(usingManual ? [] : model.pts, turns, sel) : null;

  const dirLabel = (d: string | null) =>
    d === "rising" ? t("سجي", "Saji · rising") : d === "falling" ? t("ثبر", "Thabr · falling") : d === "waqfa" ? t("وقفة", "Waqfa · slack") : "—";
  const dirColor = (d: string | null) => (d === "rising" ? "text-rise" : d === "falling" ? "text-fall" : "text-warn");

  const cfg = readCycleConfig();
  const spotName = gpsPt ? t("موقعي", "my location") : spot ? (lang === "ar" ? spot.name : spot.name_en || spot.name) : "";
  const hourNow = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuwait", hour: "numeric", hourCycle: "h23" }).format(new Date(now)));
  const greeting = hourNow >= 4 && hourNow < 12 ? t("صباح الخير", "Good morning") : t("مساء الخير", "Good evening");
  const dayCyc = cycleShortLabel(dateKey(new Date(viewMs)), hijriOffset, cfg);
  const strip: StripDay[] = Array.from({ length: 7 }, (_, d) => {
    const ms = Date.parse(`${today}T12:00:00+03:00`) + d * 24 * H;
    const cl = cycleShortLabel(dateKey(new Date(ms)), hijriOffset, cfg);
    return {
      off: d,
      name: d === 0 ? t("اليوم", "Today") : d === 1 ? t("باجر", "Tomorrow") : dayName(ms, lang),
      num: new Intl.DateTimeFormat(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB", { timeZone: "Asia/Kuwait", day: "numeric" }).format(new Date(ms)),
      cycle: cl.cycle,
      cycleLabel: lang === "ar" ? cl.ar : cl.en,
      moon: moonAt(new Date(ms)).fraction,
    };
  });
  const nextTurn = viewing ? dayTurns[0] ?? null : st.turn ?? null;
  const inWaqfa = !viewing && st.direction === "waqfa";
  const waqfaAt = nextTurn ? (inWaqfa ? nextTurn.waqfaEnd ?? nextTurn.t : nextTurn.waqfaStart ?? nextTurn.t) : null;
  const trendLabel =
    pr?.trend === "rising_fast" ? t("يرتفع بسرعة", "Rising fast") : pr?.trend === "rising" ? t("يرتفع", "Rising") : pr?.trend === "falling" ? t("ينخفض", "Falling") : pr?.trend === "falling_fast" ? t("ينخفض بسرعة", "Falling fast") : pr?.trend === "steady" ? t("ثابت", "Steady") : "";

  return (
    <>
      {/* Header — logo, greeting, community, spot picker, «علّم هنا» */}
      <header className="no-print mb-4 pt-[calc(var(--safe-top)+0.75rem)] [text-shadow:0_1px_10px_rgb(0_0_0/0.45)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <img src="/icons/sajji-mark.svg" alt={t("شعار سجي", "Sajji logo")} className="-m-1.5 size-[52px] shrink-0 drop-shadow-[0_4px_10px_rgb(0_0_0/0.35)]" />
            <div className="min-w-0">
              <div className="text-xl font-bold leading-tight">{t("سجي", "SAJJI")}</div>
              <div className="truncate text-xs text-muted">{greeting}</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {mode === "cloud" && (
              <Link href="/community" className="glass relative flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-bold">
                <Users className="size-4 text-mint" /> {t("المجتمع", "Community")}
                {activity.total > 0 && <span className="absolute -top-1 end-0 grid min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-bold leading-4 text-white">{activity.total}</span>}
              </Link>
            )}
            <button aria-label={t("تحديث", "Refresh")} disabled={!online || !pt || loading} onClick={() => load(true)} className="glass grid size-10 place-items-center rounded-full disabled:opacity-40">
              <RefreshCw className={cn("size-[18px]", loading && "animate-spin")} />
            </button>
            <button aria-label={t("الإعدادات", "Settings")} onClick={() => setSetOpen(true)} className="glass grid size-10 place-items-center rounded-full">
              <SettingsIcon className="size-[18px]" />
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="glass relative flex h-11 min-w-0 flex-1 items-center rounded-full ps-3">
            <MapPin className="size-4 shrink-0 text-ocean" />
            <select
              aria-label={t("موقع الصيد", "Fishing spot")}
              value={gpsPt ? "__gps" : spotId ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__gps") return;
                if (v === "__add") return setAddOpen(true);
                if (v === "__manage") return router.push("/spots");
                setGpsPt(null);
                setSpotId(v);
                setSel(null);
                try {
                  localStorage.setItem("ft.marineSpot", v);
                } catch {}
              }}
              className="h-full w-full min-w-0 appearance-none truncate bg-transparent pe-8 ps-2 text-[15px] font-bold focus:outline-none"
            >
              {gpsPt && <option value="__gps">{t("موقعي (GPS)", "My location (GPS)")}</option>}
              {!spots.length && <option value="">{t("اختر موقعاً", "Choose a spot")}</option>}
              {spots.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.is_favorite ? "★ " : ""}
                  {lang === "ar" ? s.name : s.name_en || s.name}
                </option>
              ))}
              <option value="__add">{t("＋ أضف مكان جديد…", "+ Add a new place…")}</option>
              <option value="__manage">{t("✎ تعديل الأماكن…", "✎ Edit places…")}</option>
            </select>
            <ChevronDown className="pointer-events-none absolute end-3 size-4 text-muted" />
          </div>
          <button
            type="button"
            onClick={() => setMarkOpen(true)}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-ocean/50 bg-ocean/20 px-3 text-sm font-bold text-white backdrop-blur-md"
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
            className="glass grid size-11 shrink-0 place-items-center rounded-full"
          >
            <LocateFixed className="size-5" />
          </button>
        </div>
        {gpsErr && <p className="mt-1 text-xs text-warn">{gpsErr}</p>}
      </header>

      {!pt ? (
        <Empty
          icon="📍"
          title={t("اختر مكان الصيد", "Choose a fishing spot")}
          action={
            <Button onClick={() => setAddOpen(true)}>
              <MapPin className="size-4" /> {t("أضف مكان", "Add a place")}
            </Button>
          }
        >
          {t("اختر مكانك (مثل الفنطاس) أو أضف مكان جديد وعلّمه على الخريطة، أو اضغط GPS.", "Pick your spot (e.g. Al-Fintas), add a new one on the map, or tap GPS.")}
        </Empty>
      ) : !c && loading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : (
        <>
          {res?.error && !c && (
            <Notice tone="warn" className="mb-3">
              <div className="flex items-center justify-between gap-2">
                <span>{res.error === "OFFLINE" ? t("لا يوجد اتصال ولا توجد بيانات محفوظة لهذا الموقع.", "Offline and no saved data for this spot.") : t("تعذر الاتصال بمصدر البيانات.", "Couldn't reach the data provider.")}</span>
                <button type="button" disabled={loading || !online} onClick={() => load(true)} className="shrink-0 rounded-full border border-warn/60 px-3 py-1 text-xs font-bold disabled:opacity-50">
                  {loading ? t("جاري المحاولة…", "Trying…") : t("حاول مرة ثانية", "Try again")}
                </button>
              </div>
            </Notice>
          )}
          {(stale || res?.stale) && c && (
            <Notice tone="warn" className="mb-3">
              {t(`بيانات قديمة (جُلبت ${fmtDateTime(c.fetched_at, "ar")}) — تعذر التحديث.`, `Stale data (fetched ${fmtDateTime(c.fetched_at, "en")}) — refresh failed.`)}
            </Notice>
          )}

          <SeaHero
            kicker={viewing ? fmtDate(new Date(viewMs), lang) : t(`الحين في ${spotName}`, `Now at ${spotName}`)}
            title={viewing ? dayName(viewMs, lang) : st.direction === "rising" ? t("سجي", "Saji") : st.direction === "falling" ? t("ثبر", "Thabr") : st.direction === "waqfa" ? t("وقفة", "Waqfa") : "—"}
            titleTone={viewing ? "text-white" : dirColor(st.direction)}
            cycle={dayCyc.cycle}
            cycleLabel={lang === "ar" ? dayCyc.ar : dayCyc.en}
            waqfaLabel={viewing ? t("أول وقفة", "First slack") : inWaqfa ? t("تنتهي الوقفة", "Slack ends") : t("الوقفة الجاية", "Next slack")}
            waqfaTime={waqfaAt ? fmtTime(waqfaAt, lang) : "—"}
            waqfaSub={viewing ? (nextTurn ? (nextTurn.type === "high" ? t("أعلى مد", "High tide") : t("أدنى جزر", "Low tide")) : "") : waqfaAt ? remain(waqfaAt - now, lang) : ""}
          />

          <DayStrip
            days={strip}
            value={dayOff}
            legend={t("الأيام الجاية", "Coming days")}
            onChange={(d) => {
              setDayOff(d);
              setSel(null);
            }}
          />

          {/* Tide curve */}
          <Card className="mb-4 rounded-[24px] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-base font-bold">{t("المد والجزر", "Tide")}</span>
              <span className="text-xs text-muted">
                {dayName(viewMs, lang)} · {fmtDate(new Date(viewMs), lang)}
              </span>
            </div>
            {sel != null && selState && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 rounded-xl bg-surface-2 px-3 py-1.5 text-sm">
                <b className="ltr">{fmtTime(sel, lang)}</b>
                <span className={dirColor(selState.direction)}>{dirLabel(selState.direction)}</span>
                {selState.level != null && (
                  <bdi>
                    {selState.level} {t("م", "m")}
                  </bdi>
                )}
                <button className="ms-auto text-xs text-ocean" onClick={() => setSel(null)}>
                  {t("عودة للآن", "Back to now")}
                </button>
              </div>
            )}
            {model.pts.length > 3 ? (
              <div className="mt-2">
                <TideChart pts={model.pts} turns={model.turns} from={chartFrom} to={chartTo} now={now} selected={sel} onSelect={setSel} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted">{t("بيانات مستوى البحر غير متوفرة لهذا اليوم أو المكان.", "Sea-level data unavailable for this day or place.")}</p>
            )}
            {dayTurns.length > 0 && (
              <div className="mt-3 flex gap-1.5">
                {dayTurns.map((e) => (
                  <div key={e.t} className={cn("min-w-0 flex-1 rounded-2xl bg-white/5 px-1.5 py-2.5 text-center", !viewing && e.t < now && "opacity-50")}>
                    <div className={cn("text-[11px] font-bold", e.type === "high" ? "text-rise" : "text-fall")}>{e.type === "high" ? t("▲ مد", "▲ High") : t("▼ جزر", "▼ Low")}</div>
                    <div className="whitespace-nowrap text-[15px] font-bold text-white">{fmtTime(e.t, lang)}</div>
                    {e.h != null && (
                      <div className="text-[11px] text-muted">
                        <bdi>
                          {e.h.toFixed(1)} {t("م", "m")}
                        </bdi>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <StatTiles
            labels={{ wind: t("الرياح", "Wind"), pressure: t("الضغط", "Pressure") }}
            wind={wx?.wind != null ? fmtWind(wx.wind, unit, lang) : "—"}
            windSub={wx?.wind != null ? compass(wx.dir, lang) : ""}
            windDir={wx?.wind != null && wx.dir != null ? wx.dir : null}
            pressure={pr ? String(pr.hpa) : "—"}
            pressureSub={pr ? `hPa${trendLabel ? ` · ${trendLabel}` : ""}` : ""}
            pressureFrac={pr ? Math.max(0, Math.min(1, (pr.hpa - 1000) / 30)) : null}
            cycle={dayCyc.cycle}
            cycleLabel={lang === "ar" ? dayCyc.ar : dayCyc.en}
            cycleSub={dayCyc.cycle === "hamal" ? t("تيار قوي", "Strong current") : dayCyc.cycle === "fasad" ? t("تيار خفيف", "Weak current") : t("تيار متوسط", "Moderate current")}
            moon={moon.fraction}
          />

          {(pr?.trend === "falling_fast" || warn.length > 0) && (
            <div className="mb-4 flex items-start gap-1.5 rounded-2xl bg-warn/15 px-3 py-2 text-xs text-warn backdrop-blur-md">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {pr?.trend === "falling_fast" ? t(`الضغط نزل ${Math.abs(pr.delta3h ?? 0)} هكتوباسكال خلال 3 ساعات — الجو ممكن يتغير. `, `Pressure dropped ${Math.abs(pr.delta3h ?? 0)} hPa in 3 h — the weather may change. `) : ""}
                {warn.map((x) => t(x.ar, x.en)).join(" · ")}
              </span>
            </div>
          )}

          <CaptureCTA onClick={openQuickCatch} title={t("سجّل صيدة", "Log a catch")} sub={t("صوّرها والباقي ينحفظ تلقائي", "Snap it — the rest is saved for you")} />
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
            <div className="rounded-xl border border-line/60 p-3">
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
