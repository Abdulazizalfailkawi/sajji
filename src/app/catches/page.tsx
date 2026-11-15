"use client";

// صيدي — the new landing of the second tab: your numbers, a fish picker, the
// "when does this fish bite for you" card (from your own catches only) and the
// catch cards. Trips, calendar, spots, gear and photos stay one tap away in the
// tabs under the title.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, SlidersHorizontal } from "lucide-react";
import { Photo } from "@/components/common";
import { FilterBar } from "@/components/Filters";
import { SpeciesChips } from "@/components/SpeciesChips";
import { Empty, Input, PageHeader, cn } from "@/components/ui";
import { findSpeciesByName } from "@/lib/commonFish";
import { useStore } from "@/lib/db/store";
import { hijriForDateKey, parseHijri } from "@/lib/hijri";
import { useI18n } from "@/lib/i18n";
import { catchEnv } from "@/lib/marine/env";
import { matches } from "@/lib/normalize";
import { BAND_LABEL, WATER_LABEL, insightFor, waterOfTide } from "@/lib/speciesInsight";
import { catchLocation, catchTechnique, type Filters } from "@/lib/stats";
import { cycleShortLabel, readCycleConfig, type Cycle } from "@/lib/tidecycle";
import { dateKey, fmtDate, fmtTime } from "@/lib/time";

const cycleTone = (c: Cycle) => (c === "hamal" ? "bg-mint/15 text-mint" : c === "fasad" ? "bg-warn/15 text-warn" : "bg-ocean/15 text-ocean");

export default function CatchHistoryPage() {
  const { ds, idx, hijriOffset } = useStore();
  const { t, lang, name } = useI18n();
  const [f, setF] = useState<Filters>({});
  const [fish, setFish] = useState("");
  const [sort, setSort] = useState<"new" | "old">("new");
  const [unlinked, setUnlinked] = useState(false);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("unlinked")) setUnlinked(true);
  }, []);

  const cfg = useMemo(() => readCycleConfig(), []);
  const fishSpecies = fish ? findSpeciesByName(ds.species, fish) : null;

  const all = useMemo(() => ds.catches.map((c) => ({ c, env: catchEnv(ds, c), cyc: cycleShortLabel(dateKey(c.caught_at), hijriOffset, cfg) })), [ds, hijriOffset, cfg]);

  const items = useMemo(() => {
    return all
      .filter(({ c, env }) => {
        if (unlinked && c.trip_id) return false;
        if (fish && (!fishSpecies || c.species_id !== fishSpecies.id)) return false;
        const day = dateKey(c.caught_at);
        if (f.from && day < f.from) return false;
        if (f.to && day > f.to) return false;
        if (!fish && f.speciesId && c.species_id !== f.speciesId) return false;
        if (f.techniqueId && catchTechnique(c, idx) !== f.techniqueId) return false;
        if (f.locationId && catchLocation(c, idx) !== f.locationId) return false;
        if (f.moon && env.moon?.value !== f.moon) return false;
        if (f.tide && env.tidePhase?.value !== f.tide) return false;
        if (f.hijriMonth) {
          const h = parseHijri(c.hijri_date_override) ?? hijriForDateKey(day, hijriOffset);
          if (h.month !== f.hijriMonth) return false;
        }
        if (f.q) {
          const sp = c.species_id ? idx.speciesById.get(c.species_id) : null;
          if (!matches(f.q, sp?.name_ar, sp?.name_en, ...(sp?.aliases ?? []), c.notes, c.lure_bait, idx.tripById.get(c.trip_id ?? "")?.notes)) return false;
        }
        return true;
      })
      .sort((a, b) => (sort === "new" ? b.c.caught_at.localeCompare(a.c.caught_at) : a.c.caught_at.localeCompare(b.c.caught_at)));
  }, [all, f, fish, fishSpecies, sort, hijriOffset, unlinked, idx]);

  // numbers
  const speciesCount = new Set(ds.catches.map((c) => c.species_id).filter(Boolean)).size;
  const topTech = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of ds.catches) {
      const id = catchTechnique(c, idx);
      if (id) m.set(id, (m.get(id) ?? 0) + 1);
    }
    const best = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return best ? name(idx.techById.get(best[0])) : "—";
  }, [ds.catches, idx, name]);

  // other fish the user has caught become buttons too
  const extra = useMemo(() => {
    const ids = new Set(ds.catches.map((c) => c.species_id).filter((x): x is string => !!x));
    return [...ids].map((id) => idx.speciesById.get(id)?.name_ar).filter((x): x is string => !!x);
  }, [ds.catches, idx]);

  const insight = useMemo(
    () => (fishSpecies ? insightFor(all.filter(({ c }) => c.species_id === fishSpecies.id).map(({ c, env, cyc }) => ({ at: c.caught_at, cycle: cyc.cycle, tide: env.tidePhase?.value ?? null }))) : null),
    [all, fishSpecies],
  );

  const Stat = ({ n, label }: { n: string | number; label: string }) => (
    <div className="glass rounded-[18px] px-2 py-3 text-center">
      <div className="truncate text-xl font-bold leading-tight text-white">{n}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );

  return (
    <>
      <PageHeader section="trips" title={t("صيدي", "My catches")} subtitle={t(`${ds.catches.length} صيدة`, `${ds.catches.length} catches`)} />

      <div className="space-y-3.5">
        <div className="grid grid-cols-3 gap-2">
          <Stat n={ds.catches.length} label={t("صيدة", "Catches")} />
          <Stat n={speciesCount} label={t("أنواع", "Species")} />
          <Stat n={topTech} label={t("أكثر طريقة", "Top method")} />
        </div>

        <SpeciesChips value={fish} onChange={setFish} extra={extra} allowAll />

        {fish && insight && (
          <section className="rounded-3xl border border-mint/45 bg-gradient-to-br from-mint/20 to-mint/5 p-4 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <Sparkles className="size-[18px] text-mint" />
              <div className="text-[15px] font-bold">{t(`متى يطلع لك ${fish}؟`, `When do you catch ${fish}?`)}</div>
            </div>
            <div className="mt-3 space-y-2.5">
              {(
                [
                  { l: t("حمل", "Haml"), v: insight.hamal, bar: "bg-mint" },
                  { l: t("فساد", "Fasad"), v: insight.fasad, bar: "bg-warn" },
                  { l: t("بين الحمل والفساد", "Between"), v: insight.between, bar: "bg-ocean" },
                ] as const
              )
                .filter((r) => r.v > 0)
                .map((r) => (
                  <div key={r.l}>
                    <div className="flex justify-between text-[13px]">
                      <span>{r.l}</span>
                      <span className="font-bold">{r.v}%</span>
                    </div>
                    <div className="mt-1 h-2 rounded bg-white/10">
                      <div className={cn("h-2 rounded", r.bar)} style={{ width: `${r.v}%` }} />
                    </div>
                  </div>
                ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[14px] bg-abyss/50 px-3 py-2.5">
                <div className="text-[11px] text-muted">{t("أغلبها مع", "Most often on")}</div>
                <div className="text-base font-bold">{insight.water ? WATER_LABEL[insight.water.key][lang] : "—"}</div>
              </div>
              <div className="rounded-[14px] bg-abyss/50 px-3 py-2.5">
                <div className="text-[11px] text-muted">{t("أغلبها وقت", "Most often at")}</div>
                <div className="text-base font-bold">{insight.band ? BAND_LABEL[insight.band.key][lang] : "—"}</div>
              </div>
            </div>
            <div className="mt-2.5 text-xs text-muted">
              {t(`محسوبة من ${insight.count} ${insight.count === 1 ? "صيدة" : "صيدات"} فقط`, `Based on ${insight.count} catch${insight.count === 1 ? "" : "es"} only`)}
              {insight.count < 5 ? t(" — قليلة، كل ما سجّلت أكثر تصير أدق", " — few so far; it gets better as you log more") : ""}
              {insight.waterKnown < insight.count ? t(` · حالة الماي معروفة لـ${insight.waterKnown} منها`, ` · tide known for ${insight.waterKnown}`) : ""}
            </div>
          </section>
        )}
        {fish && !insight && (
          <div className="glass rounded-2xl border-dashed p-4 text-center text-sm text-ink-2">{t(`ما عندك صيدات ${fish} للحين — أول ما تسجل وحدة تطلع هني`, `No ${fish} catches yet — your first one will show up here`)}</div>
        )}
        {!fish && <div className="glass rounded-2xl border-dashed p-3 text-sm text-muted">{t("اختر سمكة من فوق، وأقولك أفضل وقت تطلع لك فيه", "Pick a fish above and I'll show when it bites for you")}</div>}

        <div className="flex items-center gap-2">
          <Input placeholder={t("ابحث بالنوع أو الملاحظات…", "Search species or notes…")} value={f.q ?? ""} onChange={(e) => setF({ ...f, q: e.target.value || undefined })} />
          <button type="button" aria-expanded={more} aria-label={t("تصفية", "Filter")} onClick={() => setMore((v) => !v)} className={cn("glass grid size-12 shrink-0 place-items-center rounded-2xl", more && "border-ocean")}>
            <SlidersHorizontal className="size-5" />
          </button>
        </div>
        {more && (
          <div className="space-y-3">
            <FilterBar value={f} onChange={setF} />
            <div className="flex gap-1.5">
              {(["new", "old"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setSort(k)} className={cn("h-9 rounded-full border px-4 text-sm font-bold", sort === k ? "border-ocean bg-ocean text-abyss" : "glass text-ink-2")}>
                  {k === "new" ? t("الأحدث", "Newest") : t("الأقدم", "Oldest")}
                </button>
              ))}
            </div>
          </div>
        )}
        {unlinked && (
          <button className="text-xs text-warn underline" onClick={() => setUnlinked(false)}>
            {t("تعرض الصيدات غير المرتبطة برحلة فقط — إظهار الكل", "Showing catches without a trip only — show all")}
          </button>
        )}

        {items.length === 0 ? (
          <div className="mt-6">
            <Empty icon="🐟" title={t("لا توجد صيدات", "No catches")}>
              {t("اضغط زر الكاميرا تحت وسجّل أول صيدة", "Tap the camera button below and log your first catch")}
            </Empty>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map(({ c, env, cyc }) => {
              const sp = c.species_id ? idx.speciesById.get(c.species_id) : null;
              const locId = catchLocation(c, idx);
              const techId = catchTechnique(c, idx);
              const w = waterOfTide(env.tidePhase?.value);
              return (
                <Link key={c.id} href={`/catch?id=${c.id}`} className="glass flex gap-3 rounded-[22px] p-2.5 transition-transform active:scale-[0.99]">
                  <Photo mediaId={c.photo_media_id} className="h-[100px] w-[84px] shrink-0 rounded-2xl" />
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[17px] font-bold">{sp ? name(sp) : t("غير محدد", "Unidentified")}</span>
                      <span className={cn("ms-auto shrink-0 rounded-[9px] px-2 py-0.5 text-[11px] font-bold", cycleTone(cyc.cycle))}>{lang === "ar" ? cyc.ar : cyc.en}</span>
                    </div>
                    <div className="text-xs text-muted">
                      {fmtDate(c.caught_at, lang)} · {fmtTime(c.caught_at, lang)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {w && <span className="rounded-lg bg-ocean/12 px-2 py-0.5 text-[11px]">{WATER_LABEL[w][lang]}</span>}
                      {techId && <span className="rounded-lg bg-ocean/12 px-2 py-0.5 text-[11px]">{name(idx.techById.get(techId))}</span>}
                      {locId && <span className="rounded-lg bg-ocean/12 px-2 py-0.5 text-[11px]">{lang === "ar" ? idx.locById.get(locId)?.name : idx.locById.get(locId)?.name_en || idx.locById.get(locId)?.name}</span>}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
