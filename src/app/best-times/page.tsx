"use client";

// أفضل أوقات الصيد — a rule-based score for each half hour of the chosen day,
// built from the tide graph (moving water), dawn/dusk light, sea state and a
// rough per-species preference. Transparent and clearly labelled as an estimate.

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, Moon, Sunrise, Sunset, Waves } from "lucide-react";
import { Badge, Card, Empty, Notice, PageHeader, Select, Spinner, cn } from "@/components/ui";
import { MAIN_SPECIES, MIN_PERSONAL, profileFor, scoreDay, type BestWindow, type Why } from "@/lib/besttimes";
import { catchTidePhases } from "@/lib/analyticsExtra";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { getConditions, hourAt, turnsOf, type ConditionsResult } from "@/lib/marine/client";
import { dateKey, fmtTime } from "@/lib/time";
import { kuwaitMidnight } from "@/lib/marine/client";

const H = 3_600_000;

function dayName(ms: number, lang: "ar" | "en") {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-KW" : "en-GB", { timeZone: "Asia/Kuwait", weekday: "long" }).format(new Date(ms));
}

export default function Page() {
  return (
    <Suspense>
      <BestTimes />
    </Suspense>
  );
}

function BestTimes() {
  const { ds, idx } = useStore();
  const { t, lang, name } = useI18n();
  const router = useRouter();
  const sp = useSearchParams();
  const [dayOff, setDayOff] = useState(Math.min(2, Math.max(0, Number(sp.get("day")) || 0)));
  const [spotId, setSpotId] = useState<string | null>(null);
  const [speciesId, setSpeciesId] = useState<string | null>(null);
  const [res, setRes] = useState<ConditionsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [how, setHow] = useState(false);
  const [now] = useState(() => Date.now());

  const spots = useMemo(() => ds.locations.filter((l) => l.lat != null && l.lng != null).sort((a, b) => a.name.localeCompare(b.name, "ar")), [ds.locations]);
  const spot = spots.find((s) => s.id === spotId) ?? null;

  // spot: the one chosen on the sea screen
  useEffect(() => {
    if (spotId || !spots.length) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("ft.marineSpot");
    } catch {}
    setSpotId(spots.find((s) => s.id === saved)?.id ?? spots[0].id);
  }, [spots, spotId]);

  // species: the main Kuwaiti fish first
  const main = useMemo(() => MAIN_SPECIES.map((n) => ds.species.find((s) => s.name_ar === n)).filter((s): s is NonNullable<typeof s> => !!s), [ds.species]);
  useEffect(() => {
    if (speciesId || !ds.species.length) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("ft.bestSpecies");
    } catch {}
    setSpeciesId(ds.species.find((s) => s.id === saved)?.id ?? main[0]?.id ?? ds.species[0].id);
  }, [ds.species, main, speciesId]);
  const species = speciesId ? idx.speciesById.get(speciesId) ?? null : null;

  const hourKey = Math.floor(now / H);
  useEffect(() => {
    if (!spot) return;
    let alive = true;
    setLoading(true);
    const base = hourKey * H;
    void getConditions(spot.lat!, spot.lng!, new Date(Math.min(base - 14 * H, kuwaitMidnight(base) - 6 * H)), new Date(base + 80 * H)).then((r) => {
      if (alive) {
        setRes(r);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [spot, hourKey]);

  const c = res?.data ?? null;
  const model = useMemo(() => (c ? turnsOf(c) : { pts: [], turns: [] }), [c]);
  const todayKey = dateKey(new Date(now));
  const dayStart = Date.parse(`${todayKey}T00:00:00+03:00`) + dayOff * 24 * H;

  const personal = useMemo(() => {
    if (!species) return null;
    const mine = ds.catches.filter((x) => x.species_id === species.id);
    const { counts } = catchTidePhases(ds, mine);
    const n = counts.rising + counts.falling + counts.waqfa;
    return { rising: counts.rising, falling: counts.falling, waqfa: counts.waqfa, n };
  }, [ds, species]);

  const result = useMemo(() => {
    if (!spot || !c || !model.pts.length) return null;
    return scoreDay({
      dayStart,
      pts: model.pts,
      turns: model.turns,
      lat: spot.lat!,
      lng: spot.lng!,
      profile: profileFor(species?.name_ar),
      cond: (tt) => ({ windKmh: hourAt(c.weather.hours, tt)?.wind ?? null, waveM: hourAt(c.marine.hours, tt)?.wave_h ?? null }),
      personal,
    });
  }, [spot, c, model, dayStart, species, personal]);

  const WHY: Record<Why, string> = {
    moving: t("مياه متحركة", "Moving water"),
    rising: t("سجي (صعود)", "Rising tide"),
    falling: t("ثبر (هبوط)", "Falling tide"),
    slack: t("وقفة الماء 🎯", "Slack water 🎯"),
    dawn: t("فجر", "Dawn"),
    dusk: t("غروب", "Dusk"),
    night: t("ليل", "Night"),
    rough: t("⚠️ بحر مرتفع", "⚠️ Rough sea"),
  };
  const RATING = { excellent: t("ممتاز", "Excellent"), good: t("جيد", "Good"), fair: t("متوسط", "Fair") };
  const ratingTone = { excellent: "bg-good/15 text-good border-good/40", good: "bg-ocean/15 text-ocean border-ocean/40", fair: "bg-surface-2 text-ink-2 border-line" };
  const range = (w: BestWindow) => `${fmtTime(w.from, lang)} – ${fmtTime(w.to, lang)}`;

  const slot = result && sel != null ? result.slots[Math.max(0, Math.min(result.slots.length - 1, sel))] : null;

  // chart geometry
  const W = 340;
  const HT = 170;
  const x = (tt: number) => ((tt - dayStart) / (24 * H)) * W;
  let curve = "";
  if (result) {
    const inDay = model.pts.filter((p) => p.t >= dayStart - H && p.t <= dayStart + 25 * H);
    if (inDay.length > 2) {
      const lo = Math.min(...inDay.map((p) => p.h));
      const hi = Math.max(...inDay.map((p) => p.h));
      const y = (h: number) => 14 + (1 - (h - lo) / Math.max(0.1, hi - lo)) * (HT - 34);
      curve = inDay.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)} ${y(p.h).toFixed(1)}`).join(" ");
    }
  }
  const inWindow = (tt: number) => !!result?.windows.some((w) => tt >= w.from && tt < w.to);

  return (
    <>
      <PageHeader title={t("أفضل أوقات الصيد", "Best fishing times")} back="/" />

      {!spots.length ? (
        <Empty icon="📍" title={t("اختر موقعاً أول", "Choose a spot first")}>
          {t("افتح شاشة البحر وحدد موقع الصيد.", "Open the sea screen and pick a fishing spot.")}
        </Empty>
      ) : (
        <>
          <div className="mb-3">
            <Select value={spotId} onChange={(v) => setSpotId(v)} options={spots.map((s) => ({ value: s.id, label: lang === "ar" ? s.name : s.name_en || s.name }))} />
          </div>

          <div className="mb-3 flex gap-2">
            {[0, 1, 2].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDayOff(d);
                  setSel(null);
                  router.replace(`/best-times?day=${d}`);
                }}
                className={cn("flex-1 rounded-xl border px-2 py-1.5 text-center text-xs font-semibold", dayOff === d ? "border-ocean bg-ocean/20 text-white" : "border-line bg-surface-2 text-ink-2")}
              >
                {d === 0 ? t("اليوم", "Today") : d === 1 ? t("باجر", "Tomorrow") : dayName(dayStart - dayOff * 24 * H + d * 24 * H + 12 * H, lang)}
              </button>
            ))}
          </div>

          <div className="mb-1 text-xs text-ink-2">{t("السمكة", "Fish")}</div>
          <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto pb-1">
            {main.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSpeciesId(s.id);
                  try {
                    localStorage.setItem("ft.bestSpecies", s.id);
                  } catch {}
                }}
                className={cn("shrink-0 rounded-full border px-3.5 py-1.5 text-sm", speciesId === s.id ? "border-ocean bg-ocean/20 font-bold text-white" : "border-line bg-surface-2 text-ink-2")}
              >
                {name(s)}
              </button>
            ))}
          </div>
          <Select
            value={main.some((m) => m.id === speciesId) ? null : speciesId}
            onChange={(v) => {
              if (!v) return;
              setSpeciesId(v);
              try {
                localStorage.setItem("ft.bestSpecies", v);
              } catch {}
            }}
            placeholder={t("نوع ثاني…", "Another fish…")}
            options={[...ds.species].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).map((s) => ({ value: s.id, label: name(s) }))}
          />

          {loading && !c ? (
            <div className="grid place-items-center py-16">
              <Spinner />
            </div>
          ) : !result ? (
            <Notice tone="warn" className="mt-3">
              {res?.error === "OFFLINE" ? t("لا يوجد اتصال ولا توجد بيانات محفوظة.", "Offline and no saved data.") : t("بيانات المد غير متوفرة لهذا الموقع.", "Tide data unavailable for this spot.")}
            </Notice>
          ) : (
            <>
              <div className="mt-4 space-y-2">
                <div className="text-sm font-semibold">
                  {t(`أفضل أوقات صيد ${species ? name(species) : ""}`, `Best times for ${species ? name(species) : "this fish"}`)} · {dayOff === 0 ? t("اليوم", "today") : dayOff === 1 ? t("باجر", "tomorrow") : dayName(dayStart + 12 * H, lang)}
                </div>
                {result.windows.map((w) => (
                  <Card key={w.from} className={cn("p-3.5", w.rating === "excellent" && "border-good/40")}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xl font-extrabold">
                        <bdi>{range(w)}</bdi>
                      </div>
                      <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold", ratingTone[w.rating])}>
                        {RATING[w.rating]} · <bdi>{w.score}</bdi>
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {w.turn && (
                        <Badge>
                          {w.turn.type === "high" ? t("ساعتين حول أعلى مد", "±2 h around high tide") : t("ساعتين حول أدنى جزر", "±2 h around low tide")} · <bdi>{fmtTime(w.turn.t, lang)}</bdi>
                        </Badge>
                      )}
                      {w.peak?.kind === "slack" && (
                        <Badge>
                          {WHY.slack} <bdi>{fmtTime(w.peak.from, lang)}–{fmtTime(w.peak.to, lang)}</bdi>
                        </Badge>
                      )}
                      {w.peak?.kind === "start" && (
                        <Badge>
                          {t("رشة الماء 🌊 (أنشط وقت)", "Start of the run 🌊 (peak)")} <bdi>{fmtTime(w.peak.from, lang)}–{fmtTime(w.peak.to, lang)}</bdi>
                        </Badge>
                      )}
                      {w.why.map((k) => (
                        <Badge key={k}>{WHY[k]}</Badge>
                      ))}
                    </div>
                  </Card>
                ))}
                {!result.windows.length && <Notice tone="info">{t("ما فيه وقت بارز اليوم — المياه هادية والضوء ضعيف.", "No standout time today — slow water and weak light.")}</Notice>}
              </div>

              <Card className="mt-3 p-3">
                <div className="mb-1 text-sm font-semibold">{t("التقييم على الجراف", "Score on the tide graph")}</div>
                <div className="mb-1 min-h-9 rounded-xl bg-surface-2 px-3 py-1.5 text-xs">
                  {slot ? (
                    <span className="flex flex-wrap items-center gap-x-3 text-white">
                      <b className="ltr">{fmtTime(slot.t, lang)}</b>
                      <span>
                        {t("التقييم", "Score")} <bdi>{slot.score}</bdi>/100
                      </span>
                      <span>{slot.dir === "rising" ? t("سجي", "Rising") : slot.dir === "falling" ? t("ثبر", "Falling") : slot.dir === "waqfa" ? t("وقفة", "Slack") : ""}</span>
                      {slot.rateCm != null && (
                        <span>
                          <bdi>{Math.round(Math.abs(slot.rateCm))}</bdi> {t("سم/س", "cm/h")}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="text-muted">{t("المس الجراف لتشوف تقييم أي ساعة", "Touch the graph to see any hour's score")}</span>
                  )}
                </div>
                <svg
                  viewBox={`0 0 ${W} ${HT}`}
                  className="w-full touch-pan-y select-none"
                  role="img"
                  aria-label="best times chart"
                  onPointerDown={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setSel(Math.floor(((e.clientX - r.left) / r.width) * result.slots.length));
                  }}
                  onPointerMove={(e) => {
                    if (e.buttons === 0 && e.pointerType === "mouse") return;
                    const r = e.currentTarget.getBoundingClientRect();
                    setSel(Math.floor(((e.clientX - r.left) / r.width) * result.slots.length));
                  }}
                >
                  {result.slots.map((s) => {
                    const h = (s.score / 100) * (HT - 40);
                    const good = inWindow(s.t);
                    return <rect key={s.t} x={x(s.t) + 0.5} y={HT - 22 - h} width={W / result.slots.length - 1} height={h} rx={2} fill={good ? "#34d399" : "#3b8cf0"} opacity={good ? 0.85 : 0.35} />;
                  })}
                  {curve && <path d={curve} fill="none" stroke="#e4e4e7" strokeWidth="1.6" opacity="0.8" />}
                  {result.sunrise != null && <line x1={x(result.sunrise)} x2={x(result.sunrise)} y1={8} y2={HT - 22} stroke="#fbbf24" strokeDasharray="3 3" opacity="0.6" />}
                  {result.sunset != null && <line x1={x(result.sunset)} x2={x(result.sunset)} y1={8} y2={HT - 22} stroke="#fb923c" strokeDasharray="3 3" opacity="0.6" />}
                  {sel != null && <line x1={x(dayStart) + ((Math.min(sel, result.slots.length - 1) + 0.5) * W) / result.slots.length} x2={x(dayStart) + ((Math.min(sel, result.slots.length - 1) + 0.5) * W) / result.slots.length} y1={4} y2={HT - 22} stroke="#fff" strokeWidth="1.5" />}
                  {[0, 3, 6, 9, 12, 15, 18, 21].map((hr) => (
                    <text key={hr} x={x(dayStart + hr * H)} y={HT - 6} fontSize="9" fill="#e4e4e7" textAnchor="start">
                      {String(hr).padStart(2, "0")}:00
                    </text>
                  ))}
                </svg>
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-ink-2">
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-3 rounded-sm bg-good" /> {t("أفضل الأوقات", "Best windows")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2.5 w-3 rounded-sm bg-ocean/50" /> {t("باقي اليوم", "Rest of the day")}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-0 w-3 border-t-2 border-white/70" /> {t("منسوب المد", "Tide level")}
                  </span>
                  <span className="flex items-center gap-1">
                    <Sunrise className="size-3 text-warn" /> <Sunset className="size-3 text-orange-400" /> {t("شروق / غروب", "Sunrise / sunset")}
                  </span>
                </div>
              </Card>

              {personal && species && (
                <Card className="mt-3 p-3 text-sm">
                  <div className="flex items-center gap-2 font-semibold">
                    <Waves className="size-4 text-ocean" /> {t("من صيدك أنت", "From your own catches")}
                  </div>
                  {personal.n >= 5 ? (
                    <p className="mt-1 text-xs leading-relaxed text-ink-2">
                      {t(
                        `${personal.n} صيدة ${name(species)} مسجّلة بحالة المد: ${personal.rising} وقت السجي، ${personal.falling} وقت الثبر، ${personal.waqfa} وقت الوقفة.`,
                        `${personal.n} ${name(species)} catches with a tide state: ${personal.rising} rising, ${personal.falling} falling, ${personal.waqfa} slack.`,
                      )}{" "}
                      {personal.n >= MIN_PERSONAL ? t("التقييم أعلاه يأخذ صيدك بالحسبان.", "The scores above take your history into account.") : t(`لما توصل ${MIN_PERSONAL} صيدات يبدأ التقييم يعتمد عليها.`, `Scores start using it at ${MIN_PERSONAL} catches.`)}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs leading-relaxed text-ink-2">{t(`سجّل صيدك (يحتاج ${MIN_PERSONAL} صيدات من ${name(species)}) وهذي الصفحة تتعلم متى تصيد أنت.`, `Log your catches (needs ${MIN_PERSONAL} of ${name(species)}) and this page learns when you catch.`)}</p>
                  )}
                </Card>
              )}

              {result.slots.some((s) => s.cond < 0.8) && (
                <Notice tone="warn" className="mt-3">
                  <span className="flex items-start gap-1.5">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {t("فيه ساعات رياحها أو موجها مرتفع اليوم — التقييم نازل فيها.", "Some hours have strong wind or waves — their scores are lowered.")}
                  </span>
                </Notice>
              )}

              <button type="button" onClick={() => setHow((v) => !v)} className="mt-3 flex w-full items-center justify-between rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm font-semibold">
                {t("كيف نحسب؟", "How is it calculated?")} <ChevronDown className={cn("size-4 transition-transform", how && "rotate-180")} />
              </button>
              {how && (
                <Card className="mt-2 space-y-2 p-3.5 text-xs leading-relaxed text-ink-2">
                  <p>{t("لكل مد وجزر في اليوم نافذة أربع ساعات: ساعتين قبل الوقفة وساعتين بعدها. وجوّا النافذة نحدد أنشط وقت:", "Every high and low tide gets a four-hour window: two hours before and two hours after the slack. Inside it we mark the peak:")}</p>
                  <p>
                    <b className="text-white">{t("أغلب الأسماك (السبيطي والشعم والنويبي…): ", "Most fish (sobaity, shaam, nuwaibi…): ")}</b>
                    {t("أنشط وقت في بداية المد بعد الوقفة (رشة الماء)، وتنشط مع الثبر (هبوط الماء)، وتحب الشروق.", "peak at the start of the run after the slack, active in the falling tide, and keen at sunrise.")}
                  </p>
                  <p>
                    <b className="text-white">{t("البالول والهامور: ", "Balool & hamour: ")}</b>
                    {t("القمة عند الوقفة نفسها (٣٠ دقيقة قبل وبعد)، والضوء يعطي بس شوي. والبالول يضاف له كمان وقت الغروب (ساعة قبل وساعة بعد).", "the peak is the slack itself (30 min either side); light adds only a little. Balool also gets sunset (an hour either side).")}
                  </p>
                  <p>{t("بعدها ننزّل التقييم لو الرياح فوق ٢٥ كم/س أو الموج فوق ٠٫٨ م. ولو عندك ٨ صيدات أو أكثر من نفس النوع، نأخذ حالة المد وقت صيدك بالحسبان. ممكن تصيد بأوقات ثانية، لكن هذي القاعدة المجرّبة.", "Then we lower it for wind above 25 km/h or waves above 0.8 m. With 8+ catches of the same fish, your own tide history is blended in. You can still catch at other times — this is the tested rule.")}</p>
                  <p className="text-warn">{t("هذا تقدير مبني على قواعد عامة ومد تقديري من نموذج، مو ضمان للصيد. استخدمه كدليل وجرّب بنفسك.", "This is an estimate from general rules and a modelled tide — not a guarantee. Use it as a guide.")}</p>
                </Card>
              )}
              <p className="mt-3 flex items-center justify-center gap-1 text-center text-[11px] text-muted">
                <Moon className="size-3" /> {t("تقدير — وليس ضماناً", "An estimate, not a guarantee")}
              </p>
            </>
          )}
        </>
      )}
    </>
  );
}
