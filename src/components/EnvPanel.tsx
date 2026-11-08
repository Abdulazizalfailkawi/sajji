"use client";

import { useMemo, useState } from "react";
import { CloudDownload, ExternalLink, History, PencilLine, Sunrise, Sunset } from "lucide-react";
import { MOON_EMOJI } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { uuid } from "@/lib/ids";
import { MOON_LABEL, TIDE_LABEL, useI18n } from "@/lib/i18n";
import { catchEnv, tripEnv, type Prov, type ResolvedEnv } from "@/lib/marine/env";
import { coordsForCatch, coordsForTrip, snapshotCatch, takeSnapshot } from "@/lib/marine/snapshots";
import { KMC_MARINE_URL } from "@/lib/marine/stations";
import { compass, fmtWind, readWindUnit } from "@/lib/marine/units";
import { fmtDateTime, fmtTime, fromLocalInput, toLocalInput } from "@/lib/time";
import { TIDES, type Catch, type EnvKind, type EnvironmentObservation, type Tide, type Trip } from "@/lib/types";
import { Badge, Button, Choice, Field, Input, NumberInput, Notice, Select, Sheet } from "./ui";

export function KindBadge({ kind }: { kind: EnvKind | "entered" }) {
  const { t } = useI18n();
  const map: Record<string, [string, string, "good" | "warn" | "ocean" | "default" | "teal" | "bad"]> = {
    observation: ["رصد فعلي", "Observed", "good"],
    forecast: ["توقعات", "Forecast", "warn"],
    archived_forecast: ["تقدير نموذج تاريخي", "Historical model", "default"],
    reanalysis: ["إعادة تحليل", "Reanalysis", "default"],
    model: ["نموذج", "Model", "default"],
    calculated: ["محسوب", "Calculated", "ocean"],
    manual: ["يدوي", "Manual", "teal"],
    entered: ["يدوي", "Manual", "teal"],
    unavailable: ["غير متوفر", "Unavailable", "bad"],
  };
  const [ar, en, tone] = map[kind] ?? [kind, kind, "default"];
  return <Badge tone={tone}>{t(ar, en)}</Badge>;
}

function Line({ label, p, render }: { label: string; p: Prov<unknown> | null; render: () => React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="text-muted">{label}</span>
      {p ? (
        <span className="flex flex-wrap items-center justify-end gap-1.5 text-end">
          {render()} <KindBadge kind={p.kind} />
        </span>
      ) : (
        <span className="text-muted">—</span>
      )}
    </div>
  );
}

/**
 * Environmental context of a trip or catch with provenance for every value,
 * the list of stored snapshots, re-fetch and manual correction.
 */
export function EnvPanel({ trip, c }: { trip: Trip | null; c?: Catch }) {
  const store = useStore();
  const { ds, save, online } = store;
  const { t, lang } = useI18n();
  const unit = readWindUnit();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [manual, setManual] = useState(false);
  const [hist, setHist] = useState(false);
  const env: ResolvedEnv = useMemo(() => (c ? catchEnv(ds, c) : tripEnv(ds, trip!)), [ds, c, trip]);
  const at = c?.caught_at ?? trip!.started_at;
  const coords = c ? coordsForCatch(ds, c) : coordsForTrip(ds, trip!);
  const isPast = Date.parse(at) < Date.now() - 3_600_000;
  const all = ds.environment_observations.filter((e) => (c ? e.catch_id === c.id : e.trip_id === trip!.id && !e.catch_id));
  const groups = useMemo(() => {
    const m = new Map<string, EnvironmentObservation[]>();
    for (const e of all) m.set(e.snapshot_id ?? e.id, [...(m.get(e.snapshot_id ?? e.id) ?? []), e]);
    return [...m.values()].sort((a, b) => b[0].fetched_at.localeCompare(a[0].fetched_at));
  }, [all]);
  const hasAny = env.wind || env.wave || env.tidePhase || env.seaTemp || env.pressure;

  const refetch = async () => {
    setBusy(true);
    setMsg(null);
    const r = c
      ? await snapshotCatch(store, c)
      : await takeSnapshot(store, { at: new Date(at), tripId: trip!.id, catchId: null, purpose: Date.parse(at) > Date.now() + 3_600_000 ? "planned" : "trip_start", coords });
    setBusy(false);
    if (!r.ok)
      setMsg(
        r.error === "NO_COORDINATES"
          ? t("لا توجد إحداثيات — أضفها للموقع أو للصيدة.", "No coordinates — add them to the spot or catch.")
          : r.error === "OFFLINE"
            ? t("لا يوجد اتصال — سيُحاول لاحقاً.", "Offline — will retry later.")
            : t("تعذر جلب البيانات.", "Couldn't fetch data."),
      );
  };

  const tideTxt = (v: Tide) => TIDE_LABEL[v][lang];

  return (
    <div className="space-y-3">
      <div className="divide-y divide-line/40 rounded-[var(--radius-card)] border border-line/70 bg-surface/80 px-4 py-1">
        <Line label={t("القمر", "Moon")} p={env.moon} render={() => <>{MOON_EMOJI[env.moon!.value]} {MOON_LABEL[env.moon!.value][lang]}{env.moonIllum ? ` · ${env.moonIllum.value}%` : ""}</>} />
        <Line
          label={t("المد والجزر", "Tide")}
          p={env.tidePhase}
          render={() => (
            <>
              {tideTxt(env.tidePhase!.value)}
              {env.tideHeight ? (
                <span className="text-muted">
                  {" · "}
                  <bdi>
                    {env.tideHeight.value} {t("م", "m")}
                  </bdi>
                </span>
              ) : null}
            </>
          )}
        />
        {(env.nextHigh || env.nextLow) && (
          <div className="flex justify-between gap-2 py-2 text-xs text-ink-2">
            <span>{env.nextHigh ? `${t("المد التالي", "Next high")}: ${fmtTime(env.nextHigh.value, lang)}` : ""}</span>
            <span>{env.nextLow ? `${t("الجزر التالي", "Next low")}: ${fmtTime(env.nextLow.value, lang)}` : ""}</span>
          </div>
        )}
        <Line
          label={t("الرياح", "Wind")}
          p={env.wind}
          render={() => (
            <>
              {env.windDir ? compass(env.windDir.value, lang) + " " : ""}
              {fmtWind(env.wind!.value, unit, lang)}
              {env.gust ? <span className="text-muted"> · {t("هبات", "gusts")} {fmtWind(env.gust.value, unit, lang)}</span> : null}
            </>
          )}
        />
        <Line label={t("الموج", "Waves")} p={env.wave} render={() => <bdi>{env.wave!.value} {t("م", "m")}{env.wavePeriod ? ` · ${env.wavePeriod.value} ${t("ث", "s")}` : ""}</bdi>} />
        <Line label={t("حرارة الماء", "Sea temp")} p={env.seaTemp} render={() => <>{env.seaTemp!.value}°C</>} />
        <Line label={t("حرارة الجو", "Air temp")} p={env.airTemp} render={() => <>{env.airTemp!.value}°C</>} />
        <Line
          label={t("الضغط الجوي", "Pressure")}
          p={env.pressure}
          render={() => (
            <bdi>
              {Math.round(env.pressure!.value)} hPa
              {env.pressureChange ? ` ${env.pressureChange.value < -0.9 ? "↓" : env.pressureChange.value > 0.9 ? "↑" : "→"} ${env.pressureChange.value > 0 ? "+" : ""}${env.pressureChange.value}` : ""}
            </bdi>
          )}
        />
        {(env.sunrise || env.sunset) && (
          <div className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className="flex items-center gap-1">
              <Sunrise className="size-4 text-warn" /> {env.sunrise ? fmtTime(env.sunrise.value, lang) : "—"}
            </span>
            <span className="flex items-center gap-1">
              <Sunset className="size-4 text-warn" /> {env.sunset ? fmtTime(env.sunset.value, lang) : "—"}
            </span>
          </div>
        )}
      </div>

      {!hasAny && all.length > 0 && (
        <Notice tone="warn">
          {isPast ? t("البيانات التاريخية غير متوفرة لهذا الوقت والمكان.", "Historical data unavailable for this time and place.") : t("البيانات غير متوفرة.", "Data unavailable.")}
        </Notice>
      )}
      {env.unavailable.includes("tide") && !env.tidePhase && <Notice>{t("بيانات المد والجزر غير متوفرة.", "Tide data unavailable.")}</Notice>}
      {msg && <Notice tone="warn">{msg}</Notice>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" loading={busy} disabled={!online} onClick={refetch}>
          <CloudDownload className="size-4" /> {c ? t("جلب الظروف لوقت الصيدة", "Fetch conditions for catch time") : t("تسجيل الظروف", "Record conditions")}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setManual(true)}>
          <PencilLine className="size-4" /> {t("إدخال / تصحيح يدوي", "Manual entry / correction")}
        </Button>
        {groups.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setHist((v) => !v)}>
            <History className="size-4" /> {t(`السجل (${groups.length})`, `History (${groups.length})`)}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted">
        {t(
          "الظروف تُجلب لوقت ومكان السجل نفسه وتُحفظ معه. الجلب من جديد يضيف لقطة جديدة ولا يحذف القديمة. لا نستخدم طقس اليوم لرحلة قديمة أبداً.",
          "Conditions are fetched for this record's own time and place and saved with it. Re-fetching adds a new snapshot and keeps the old one. Today's weather is never used for an older record.",
        )}
      </p>

      {hist && (
        <div className="space-y-2">
          {groups.map((g) => (
            <div key={g[0].snapshot_id ?? g[0].id} className="rounded-xl bg-surface-2 p-3 text-xs">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-ink-2">
                <b>
                  {{ planned: t("تخطيط", "Planned"), trip_start: t("بداية الرحلة", "Trip start"), catch: t("وقت الصيدة", "Catch time"), manual: t("يدوي", "Manual"), refresh: t("تحديث", "Refresh"), legacy: t("قديم", "Legacy") }[g[0].purpose ?? "legacy"]}
                </b>
                <span>
                  {t("جُلب", "fetched")} {fmtDateTime(g[0].fetched_at, lang)}
                </span>
              </div>
              {g.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-1.5 py-0.5">
                  <KindBadge kind={e.kind} />
                  <span className="text-muted">{e.category ?? ""}</span>
                  <span className="truncate">{e.source}</span>
                  <span className="text-muted">· {t("صالح لـ", "valid")} {fmtDateTime(e.valid_at, lang)}</span>
                  {e.kind === "unavailable" && <span className="text-bad">({String(e.data?.reason ?? "")})</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <Sheet open={manual} onClose={() => setManual(false)} title={t("إدخال يدوي", "Manual entry")}>
        <ManualEnvForm
          at={at}
          tripId={trip?.id ?? null}
          catchId={c?.id ?? null}
          onDone={async (row) => {
            if (row) await save("environment_observations", row);
            setManual(false);
          }}
        />
      </Sheet>
    </div>
  );
}

function ManualEnvForm({ at, tripId, catchId, onDone }: { at: string; tripId: string | null; catchId: string | null; onDone: (row: EnvironmentObservation | null) => void }) {
  const { t, lang } = useI18n();
  const unit = readWindUnit();
  const [tide, setTide] = useState<Tide | null>(null);
  const [station, setStation] = useState<string | null>("shuwaikh");
  const [highs, setHighs] = useState<{ at: string; h: number | null }[]>([{ at: "", h: null }, { at: "", h: null }]);
  const [lows, setLows] = useState<{ at: string; h: number | null }[]>([{ at: "", h: null }, { at: "", h: null }]);
  const [wind, setWind] = useState<number | null>(null);
  const [windDir, setWindDir] = useState<number | null>(null);
  const [wave, setWave] = useState<number | null>(null);
  const [sst, setSst] = useState<number | null>(null);
  const dayStart = toLocalInput(at).slice(0, 10);

  const submit = () => {
    const toIso = (v: string) => (v ? fromLocalInput(v) : null);
    const hs = highs.map((x) => ({ at: toIso(x.at), h: x.h })).filter((x) => x.at);
    const ls = lows.map((x) => ({ at: toIso(x.at), h: x.h })).filter((x) => x.at);
    const t0 = Date.parse(at);
    const nextOf = (arr: { at: string | null }[]) => arr.map((x) => x.at!).filter((x) => Date.parse(x) > t0).sort()[0] ?? null;
    const kmh = wind == null ? null : unit === "kn" ? wind * 1.852 : unit === "ms" ? wind * 3.6 : wind;
    const data: Record<string, unknown> = {
      observed_tide: tide,
      station: hs.length || ls.length ? station : null,
      highs: hs,
      lows: ls,
      next_high_at: nextOf(hs),
      next_low_at: nextOf(ls),
      wind_speed_kmh: kmh == null ? null : Math.round(kmh * 10) / 10,
      wind_dir_deg: windDir,
      wave_height_m: wave,
      sea_temp_c: sst,
    };
    if (Object.values(data).every((v) => v == null || (Array.isArray(v) && !v.length))) return onDone(null);
    const ts = new Date().toISOString();
    onDone({
      id: uuid(),
      trip_id: tripId,
      catch_id: catchId,
      snapshot_id: uuid(),
      purpose: "manual",
      category: "weather",
      kind: "manual",
      source: station && (hs.length || ls.length) ? `manual (${station === "other" ? "other" : `KMC ${station}`})` : "manual",
      method: "entered by the user",
      valid_at: at,
      fetched_at: ts,
      lat: null,
      lng: null,
      data: data as EnvironmentObservation["data"],
      created_at: ts,
      updated_at: ts,
    });
  };

  const timeRow = (list: typeof highs, set: typeof setHighs, i: number) => (
    <div key={i} className="grid grid-cols-[2fr_1fr] gap-2">
      <Input type="datetime-local" value={list[i].at || ""} placeholder={dayStart} onChange={(e) => set(list.map((x, j) => (j === i ? { ...x, at: e.target.value } : x)))} />
      <NumberInput value={list[i].h} onChange={(v) => set(list.map((x, j) => (j === i ? { ...x, h: v } : x)))} placeholder="m" />
    </div>
  );

  return (
    <div className="space-y-3">
      <Field label={t("المد الملاحظ وقت الصيد", "Observed tide at the time")}>
        <Choice value={tide} onChange={setTide} options={TIDES.map((x) => ({ value: x, label: TIDE_LABEL[x][lang] }))} />
      </Field>
      <div className="space-y-2 rounded-xl border border-line p-3">
        <div className="text-sm font-medium">{t("أوقات المد والجزر الرسمية (اختياري)", "Official tide times (optional)")}</div>
        <Select
          value={station}
          onChange={setStation}
          options={[
            { value: "shuwaikh", label: t("الشويخ", "Shuwaikh") },
            { value: "shuaiba", label: t("الشعيبة", "Shuaiba") },
            { value: "other", label: t("مصدر آخر", "Other source") },
          ]}
        />
        <div className="text-xs text-muted">{t("المد العالي (الوقت، الارتفاع م)", "High tide (time, height m)")}</div>
        {[0, 1].map((i) => timeRow(highs, setHighs, i))}
        <div className="text-xs text-muted">{t("الجزر (الوقت، الارتفاع م)", "Low tide (time, height m)")}</div>
        {[0, 1].map((i) => timeRow(lows, setLows, i))}
        <a className="text-xs text-teal underline" href={KMC_MARINE_URL} target="_blank" rel="noreferrer">
          {t("جدول المد الرسمي — الأرصاد الجوية الكويتية", "Official tide table — Kuwait Meteorological Center")}
        </a>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t(`الرياح (${unit === "kn" ? "عقدة" : unit === "ms" ? "م/ث" : "كم/س"})`, `Wind (${unit})`)}>
          <NumberInput value={wind} onChange={setWind} />
        </Field>
        <Field label={t("اتجاه الرياح (من، درجات)", "Wind from (degrees)")}>
          <NumberInput value={windDir} onChange={(v) => setWindDir(v == null ? null : Math.max(0, Math.min(360, v)))} />
        </Field>
        <Field label={t("ارتفاع الموج (م)", "Wave height (m)")}>
          <NumberInput value={wave} onChange={setWave} />
        </Field>
        <Field label={t("حرارة الماء (°م)", "Sea temp (°C)")}>
          <NumberInput value={sst} onChange={setSst} />
        </Field>
      </div>
      <p className="text-xs text-muted">{t("تُحفظ كقيم يدوية وتأخذ الأولوية على بيانات النماذج، وتبقى اللقطات الأصلية محفوظة.", "Saved as manual values that take priority over model data; original snapshots are kept.")}</p>
      <Button className="w-full" onClick={submit}>
        {t("حفظ", "Save")}
      </Button>
    </div>
  );
}
