"use client";

import { useMemo, useState } from "react";
import { InlineBar } from "./charts";
import { Card, Choice, N, Notice, SectionTitle, cn } from "./ui";
import { PRESSURE_BANDS, TURN_BINS, catchPressure, catchTidePhases, tripStartPressureTrend, catchesByTurn, depthBins, lurePerformance, speciesBySpot, targetPerformance, targetVsActual, tripStartPhase } from "@/lib/analyticsExtra";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { MIN_SAMPLE, groupRows, pct, type TripRow } from "@/lib/stats";
import type { Catch } from "@/lib/types";
import { depthWord, toUnit, useDepthUnit } from "@/lib/depth";

export function AnalyticsExtra({ rows, catches }: { rows: TripRow[]; catches: Catch[] }) {
  const { ds, idx } = useStore();
  const { t, name, num } = useI18n();
  const du = useDepthUnit();
  const dw = depthWord(du, "ar");
  const [binSize, setBinSize] = useState<"5" | "10" | "20" | "50">("10");
  const perf = useMemo(() => targetPerformance(ds, rows), [ds, rows]);
  const depth = useMemo(() => depthBins(catches, Number(binSize), du), [catches, binSize, du]);
  const tva = useMemo(() => targetVsActual(catches, idx, du === "ft" ? 0.9144 : 1), [catches, idx, du]);
  const lures = useMemo(() => lurePerformance(idx, catches, rows), [idx, catches, rows]);
  const phases = useMemo(() => catchTidePhases(ds, catches), [ds, catches]);
  const turns = useMemo(() => catchesByTurn(ds, catches), [ds, catches]);
  const startPhase = useMemo(() => groupRows(rows, (r) => tripStartPhase(ds, r)), [ds, rows]);
  const matrix = useMemo(() => speciesBySpot(catches, idx), [catches, idx]);
  const press = useMemo(() => catchPressure(ds, catches), [ds, catches]);
  const pressTrips = useMemo(() => groupRows(rows, (r) => tripStartPressureTrend(ds, r)), [ds, rows]);
  const trendLabel = (k: string) => ({ falling: t("ينخفض", "Falling"), steady: t("ثابت", "Steady"), rising: t("يرتفع", "Rising") })[k] ?? k;
  const phaseLabel = (k: string) => ({ rising: t("سجي", "Saji (rising)"), falling: t("ثبر", "Thabr (falling)"), waqfa: t("وقفة", "Waqfa") })[k] ?? k;
  const maxDepth = Math.max(1, ...depth.bins.map((b) => b.count));
  const phaseTotal = phases.counts.rising + phases.counts.falling + phases.counts.waqfa;

  return (
    <>
      <SectionTitle>{t("أداء الأنواع المستهدفة", "Target-species performance")}</SectionTitle>
      {perf.length ? (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr className="border-b border-line/50">
                <th className="p-2.5 text-start font-medium">{t("النوع", "Species")}</th>
                <th className="p-2.5 font-medium">{t("رحلات", "Trips")}</th>
                <th className="p-2.5 font-medium">{t("صيد المستهدف", "Caught target")}</th>
                <th className="p-2.5 font-medium">{t("بلا صيد", "Zero")}</th>
                <th className="p-2.5 font-medium">{t("لكل رحلة", "Per trip")}</th>
              </tr>
            </thead>
            <tbody>
              {perf.map((p) => (
                <tr key={p.speciesId} className={cn("border-b border-line/30", !p.sufficient && "text-ink-2/70")}>
                  <td className="p-2.5">
                    {name(idx.speciesById.get(p.speciesId))}
                    {!p.sufficient && <div className="text-[10px] text-warn">{t("عينة صغيرة", "small sample")}</div>}
                  </td>
                  <td className="p-2.5 text-center">{p.trips}</td>
                  <td className="p-2.5 text-center">
                    {pct(p.rate)}
                    <div className="text-[10px] text-muted">
                      {p.successful}/{p.trips}
                    </div>
                  </td>
                  <td className="p-2.5 text-center">{p.zeroCatch}</td>
                  <td className="p-2.5 text-center">{num(p.perTrip, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-muted">
            {t(
              "المقام = الرحلات المنتهية التي كان النوع ضمن أهدافها. «صيد المستهدف» = صيد واحدة منه على الأقل. الرحلة متعددة الأهداف تُحسب لكل نوع على حدة. «لكل رحلة» = عدد صيدات هذا النوع ÷ رحلاته.",
              "Denominator = completed trips with the species among their targets. “Caught target” = at least one caught. Multi-target trips count for each target separately. “Per trip” = catches of the species ÷ its trips.",
            )}
          </p>
        </Card>
      ) : (
        <Notice>{t("لا توجد رحلات منتهية بنوع مستهدف بعد.", "No completed trips with a target species yet.")}</Notice>
      )}

      <SectionTitle>{t("العمق الفعلي للصيد", "Actual catch depth")}</SectionTitle>
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">{t("حجم الفئة (م)", "Bin size (m)")}</span>
          <Choice value={binSize} allowClear={false} onChange={(v) => v && setBinSize(v as "5" | "10" | "20" | "50")} options={(du === "ft" ? ["10", "20", "50"] : ["5", "10", "20"]).map((v) => ({ value: v, label: v }))} />
        </div>
        {depth.bins.map((b) => (
          <div key={b.label} className="text-sm">
            <div className="flex justify-between gap-2">
              <span className="ltr">{b.label} m</span>
              <span className="text-muted">
                {b.count} ·{" "}
                {Object.entries(b.bySpecies)
                  .sort((a, b2) => b2[1] - a[1])
                  .slice(0, 3)
                  .map(([s, n]) => `${s === "none" ? t("غير محدد", "unid.") : name(idx.speciesById.get(s))} ${n}`)
                  .join("، ")}
              </span>
            </div>
            <InlineBar value={b.count} max={maxDepth} />
          </div>
        ))}
        <p className="text-xs text-muted">
          {t(`${depth.known} صيدة بعمق مسجل، ${depth.missing} بدون عمق (مستبعدة، لا تُحسب صفراً).`, `${depth.known} catches with a recorded depth, ${depth.missing} without (excluded, not zero).`)}
          {tva.n > 0 &&
            t(
              ` المخطط مقابل الفعلي: ${tva.within} من ${tva.n} داخل النطاق المخطط (±${du === "ft" ? 3 : 1} ${dw})، والفرق المتوسط ${num(toUnit(tva.avgDiff, du), 1)} ${dw}.`,
              ` Planned vs actual: ${tva.within} of ${tva.n} inside the planned range (±${du === "ft" ? 3 : 1} ${dw}), average difference ${num(toUnit(tva.avgDiff, du), 1)} ${dw}.`,
            )}
        </p>
      </Card>

      <SectionTitle>{t("الطُعم والجك", "Lures & jigs")}</SectionTitle>
      <Card className="space-y-2 text-sm">
        {lures.lures.slice(0, 12).map((l) => (
          <div key={l.key} className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate font-medium">{l.label}</div>
              <div className="truncate text-xs text-muted">
                {Object.entries(l.species)
                  .map(([s, n]) => `${s === "none" ? t("غير محدد", "unid.") : name(idx.speciesById.get(s))} ${n}`)
                  .join("، ")}
              </div>
            </div>
            <div className="shrink-0 text-end text-xs">
              <div>
                {l.catches} {t("صيدة", "catches")}
              </div>
              <div className="text-muted">{l.tripsUsed ? t(`${l.tripsSuccessful}/${l.tripsUsed} رحلات ناجحة`, `${l.tripsSuccessful}/${l.tripsUsed} trips successful`) : t("الاستخدام غير مسجل", "usage not recorded")}</div>
            </div>
          </div>
        ))}
        {!lures.lures.length && <p className="text-muted">{t("لا يوجد طُعم مسجل.", "No lures recorded.")}</p>}
        <p className="text-xs text-muted">
          {t(
            `${lures.missing} صيدة بدون طُعم مسجل. عدد الصيد وحده لا يعني أن الطُعم أفضل — يعتمد على كم مرة استخدمته (يُحسب فقط عندما تسجّله في خطة الرحلة).`,
            `${lures.missing} catches without a recorded lure. More catches alone doesn't mean a better lure — it depends on how often you used it (counted only when recorded in the trip plan).`,
          )}
        </p>
      </Card>

      <SectionTitle>{t("المد والوقفة", "Tide & waqfa")}</SectionTitle>
      <Card className="space-y-3 text-sm">
        <div>
          <div className="mb-1 text-xs text-muted">{t("الصيدات حسب حالة الماء وقت الصيد", "Catches by tide at catch time")}</div>
          {(["rising", "falling", "waqfa"] as const).map((k) => (
            <div key={k} className="mb-1">
              <div className="flex justify-between">
                <span className={k === "rising" ? "text-rise" : k === "falling" ? "text-fall" : "text-warn"}>{phaseLabel(k)}</span>
                <span className="text-muted">
                  {phases.counts[k]} {phaseTotal ? `· ${pct(phases.counts[k] / phaseTotal)}` : ""}
                </span>
              </div>
              <InlineBar value={phases.counts[k]} max={Math.max(1, phaseTotal)} />
            </div>
          ))}
          <p className="text-xs text-muted">
            {t(`من ${phaseTotal} صيدة لها بيانات مد (${phases.manual} يدوية)، و${phases.missing} بدون بيانات. الوقفة أقصر من السجي والثبر، فالمقارنة بعدد الصيدات وحده غير عادلة.`, `From ${phaseTotal} catches with tide data (${phases.manual} manual); ${phases.missing} without. The waqfa is shorter than rising/falling periods, so raw counts aren't a fair comparison.`)}
          </p>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">{t("الصيدات حسب الوقت من أقرب أعلى مد / أدنى جزر", "Catches by time from nearest high / low tide")}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="p-1 text-start font-medium" />
                  {TURN_BINS.map((b) => (
                    <th key={b} className="ltr p-1 font-medium">
                      {b}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["high", "low"] as const).map((k) => (
                  <tr key={k}>
                    <td className={cn("p-1", k === "high" ? "text-rise" : "text-fall")}>{k === "high" ? t("أعلى مد", "High") : t("أدنى جزر", "Low")}</td>
                    {TURN_BINS.map((b) => (
                      <td key={b} className="p-1 text-center">
                        {turns[k][b] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted">{t(`سالب = قبل الحدث. ${turns.missing} صيدة بدون بيانات توقيت.`, `Negative = before the event. ${turns.missing} catches without timing data.`)}</p>
        </div>
        <div>
          <div className="mb-1 text-xs text-muted">{t("نجاح الرحلات حسب حالة الماء عند البداية", "Trip success by tide at trip start")}</div>
          {startPhase.groups.map((g) => (
            <div key={g.key} className="flex justify-between">
              <span>{phaseLabel(g.key)}</span>
              <span className="text-muted">
                {pct(g.successRate)} ({g.successful}/{g.trips}) {!g.sufficient && <span className="text-[10px] text-warn">{t("عينة صغيرة", "small")}</span>}
              </span>
            </div>
          ))}
          <p className="text-xs text-muted">{t(`${startPhase.missing} رحلة بدون بيانات مد عند البداية. يلزم ${MIN_SAMPLE} رحلات لكل فئة قبل استنتاج نمط، وحتى حينها هو ارتباط وليس سبباً.`, `${startPhase.missing} trips without tide data at start. ${MIN_SAMPLE}+ trips per group are needed before reading a pattern — and even then it's correlation, not cause.`)}</p>
        </div>
      </Card>

      <SectionTitle>{t("الضغط الجوي", "Barometric pressure")}</SectionTitle>
      <Card className="space-y-3 text-sm">
        {press.withLevel === 0 ? (
          <p className="text-xs text-muted">{t(`ما فيه ضغط جوي مسجّل للصيدات بعد${press.missing ? ` (${press.missing} صيدة قيد التعبئة تلقائياً)` : ""}. يتخزن مع كل صيدة جديدة تلقائياً.`, `No pressure recorded for catches yet${press.missing ? ` (${press.missing} being filled in automatically)` : ""}. It is saved automatically with every new catch.`)}</p>
        ) : (
          <>
            <div>
              <div className="mb-1 text-xs text-muted">{t("الصيدات حسب اتجاه الضغط وقت الصيد (آخر 3 ساعات)", "Catches by pressure trend at catch time (previous 3 h)")}</div>
              {(["falling", "steady", "rising"] as const).map((k) => (
                <div key={k} className="mb-1.5">
                  <div className="flex justify-between">
                    <span>{trendLabel(k)}</span>
                    <b>{press.trend[k]}</b>
                  </div>
                  <InlineBar value={press.trend[k]} max={Math.max(1, press.withTrend)} />
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">{t("الصيدات حسب مستوى الضغط (هكتوباسكال)", "Catches by pressure level (hPa)")}</div>
              {PRESSURE_BANDS.map((k) => (
                <div key={k} className="mb-1.5">
                  <div className="flex justify-between">
                    <span className="ltr">{k}</span>
                    <b>{press.bands[k]}</b>
                  </div>
                  <InlineBar value={press.bands[k]} max={Math.max(1, press.withLevel)} />
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs text-muted">{t("نجاح الرحلات حسب اتجاه الضغط عند البداية", "Trip success by pressure trend at trip start")}</div>
              {pressTrips.groups.map((g) => (
                <div key={g.key} className="flex justify-between">
                  <span>{trendLabel(g.key)}</span>
                  <span className="text-muted">
                    {pct(g.successRate)} ({g.successful}/{g.trips}) {!g.sufficient && <span className="text-[10px] text-warn">{t("عينة صغيرة", "small")}</span>}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted">
              {t(
                `من ${press.withLevel} صيدة لها ضغط (${press.missing} بدون). الضغط من نموذج جوي مو قياس من موقعك. توزيع صيداتك لا يعني إن الضغط هو السبب: يلزم ${MIN_SAMPLE} رحلات لكل فئة قبل ما تعتمد على النسب، وحتى بعدها هذا ارتباط مو سبب.`,
                `${press.withLevel} catches have pressure (${press.missing} without). Pressure is a weather-model value, not measured at your spot. The spread of your catches does not show pressure is the cause: you need ${MIN_SAMPLE} trips per group before trusting the rates, and even then it is correlation, not cause.`,
              )}
            </p>
          </>
        )}
      </Card>

      {matrix.spots.length > 0 && matrix.species.length > 0 && (
        <>
          <SectionTitle>{t("الأنواع حسب الموقع", "Species by spot")}</SectionTitle>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-xs">
              <thead className="text-muted">
                <tr className="border-b border-line/50">
                  <th className="p-2 text-start font-medium">{t("النوع", "Species")}</th>
                  {matrix.spots.map((l) => (
                    <th key={l} className="p-2 font-medium">
                      {idx.locById.get(l)?.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.species.map((s) => (
                  <tr key={s} className="border-b border-line/30">
                    <td className="p-2">{name(idx.speciesById.get(s))}</td>
                    {matrix.spots.map((l) => (
                      <td key={l} className="p-2 text-center">
                        {matrix.cell(s, l) || "·"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-muted">
              {t("عدد الصيدات فقط — لا يأخذ بالاعتبار كم مرة صدت في كل موقع.", "Catch counts only — doesn't account for how often you fished each spot.")} <N n={catches.length} />
            </p>
          </Card>
        </>
      )}
    </>
  );
}
