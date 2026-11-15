"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fish, Flag, MapPinned, Play, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useNow } from "@/lib/hooks/useNow";
import { activeTrip, elapsed, finishTrip, startTrip, targetsOf } from "@/lib/trips";
import { isActiveStatus } from "@/lib/types";
import { TripCard } from "@/components/common";
import { FilterBar } from "@/components/Filters";
import { Button, Card, Choice, Empty, Input, LinkButton, N, PageHeader } from "@/components/ui";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { matches } from "@/lib/normalize";
import { pct, summarize, tripRows, type Filters } from "@/lib/stats";
import { fmtDate, monthKey } from "@/lib/time";

export default function TripsPage() {
  const store = useStore();
  const { ds, idx, hijriOffset } = store;
  const { t, lang, name } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const now = useNow(30_000);
  const [f, setF] = useState<Filters>({});
  const [result, setResult] = useState<"all" | "success" | "blank">("all");

  const rows = useMemo(() => {
    const r = tripRows(ds, idx, f, hijriOffset, true).reverse();
    return r.filter((x) => {
      if (result === "success" && !x.success) return false;
      if (x.trip.status === "planned" || isActiveStatus(x.trip.status)) return false; // shown above
      if (result === "blank" && (x.success || x.trip.status !== "completed")) return false;
      // Species filter: trips that caught it or targeted it ("success" = caught that species).
      if (f.speciesId && !x.success && !targetsOf(ds, x.trip).includes(f.speciesId)) return false;
      if (f.q) {
        const loc = x.trip.location_id ? idx.locById.get(x.trip.location_id)?.name : "";
        const sp = x.allCatches.map((c) => (c.species_id ? `${idx.speciesById.get(c.species_id)?.name_ar} ${idx.speciesById.get(c.species_id)?.name_en}` : "")).join(" ");
        const tech = x.trip.technique_id ? name(idx.techById.get(x.trip.technique_id)) : "";
        if (!matches(f.q, x.trip.title, x.trip.notes, loc, sp, tech, x.trip.lure_bait, ...x.allCatches.map((c) => c.notes))) return false;
      }
      return true;
    });
  }, [ds, idx, f, hijriOffset, result, name]);

  const completed = rows.filter((r) => r.trip.status === "completed");
  const active = activeTrip(ds);
  const planned = ds.trips.filter((x) => x.status === "planned").sort((a, b) => a.started_at.localeCompare(b.started_at));
  const unlinked = ds.catches.filter((c) => !c.trip_id).length;
  const s = summarize(completed);
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = monthKey(r.trip.started_at);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }

  return (
    <>
      <PageHeader section="trips"
        title={t("الرحلات", "Trips")}
        subtitle={t(`${s.trips} رحلة · ${s.catches} سمكة · نجاح ${pct(s.successRate)}`, `${s.trips} trips · ${s.catches} fish · ${pct(s.successRate)} success`)}
        actions={
          active ? (
            <LinkButton href="/trip/edit" size="sm" className="!px-2.5" aria-label="new">
              <Plus className="size-5" />
            </LinkButton>
          ) : undefined
        }
      />
      <Link href="/marks" className="mb-3 flex items-center gap-3 rounded-2xl border border-ocean/50 bg-ocean/10 px-4 py-3">
        <MapPinned className="size-6 shrink-0 text-ocean" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">{t("إحداثياتي", "My coordinates")}</span>
          <span className="block text-xs text-ink-2">{ds.marks.length ? t(`${ds.marks.length} إحداثية مخزّنة — اضغط لعرضها كلها`, `${ds.marks.length} saved — tap to see them all`) : t("لسه ما خزّنت شيء — استخدم زر «علّم هنا» في صفحة البحر", "Nothing saved yet — use “Mark here” on the sea page")}</span>
        </span>
      </Link>
      {active ? (
        <Card className="mb-3 space-y-3 border-teal/40">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-teal">{t("الرحلة الجارية", "Active trip")}</div>
            <span className="text-xs text-warn">{elapsed(active.started_at, now, lang)}</span>
          </div>
          <TripCard trip={active} />
          <div className="flex gap-2">
            <LinkButton href={`/catch/edit?trip=${active.id}`} variant="teal" size="lg" className="flex-1">
              <Fish className="size-5" /> {t("سجّل صيدة", "Log catch")}
            </LinkButton>
            <Button
              size="lg"
              variant="secondary"
              onClick={async () => {
                await finishTrip(store, active);
                toast(t("انتهت الرحلة", "Trip finished"));
                router.push(`/trip?id=${active.id}`);
              }}
            >
              <Flag className="size-5" /> {t("أنهِ الرحلة", "Finish")}
            </Button>
          </div>
        </Card>
      ) : (
        <LinkButton href="/trip/edit" size="lg" className="mb-3 w-full">
          <Plus className="size-5" /> {t("رحلة جديدة", "New trip")}
        </LinkButton>
      )}
      {planned.length > 0 && (
        <div className="mb-3 space-y-2">
          <div className="px-1 text-sm font-semibold text-ink-2">{t("رحلات مخططة", "Planned trips")}</div>
          {planned.map((p) => (
            <div key={p.id} className="space-y-1">
              <TripCard trip={p} />
              {!active && (
                <Button
                  size="sm"
                  variant="teal"
                  className="w-full"
                  onClick={async () => {
                    await startTrip(store, p);
                    toast(t("بدأت الرحلة — بالتوفيق!", "Trip started — good luck!"));
                    router.push(`/trip?id=${p.id}`);
                  }}
                >
                  <Play className="size-4" /> {t("ابدأ الرحلة", "Start trip")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <LinkButton href="/catch/edit" variant="secondary" size="sm">
          <Fish className="size-4" /> {t("صيدة بدون رحلة", "Catch without a trip")}
        </LinkButton>
        {unlinked > 0 && (
          <Link href="/catches?unlinked=1" className="text-xs text-warn underline">
            {t(`${unlinked} صيدة غير مرتبطة برحلة`, `${unlinked} catches not linked to a trip`)}
          </Link>
        )}
      </div>

      <div className="space-y-3">
        <Input placeholder={t("بحث في الرحلات والملاحظات والمواقع…", "Search trips, notes, spots…")} value={f.q ?? ""} onChange={(e) => setF({ ...f, q: e.target.value || undefined })} />
        <FilterBar value={f} onChange={setF} />
        <Choice
          value={result}
          allowClear={false}
          onChange={(v) => v && setResult(v)}
          options={[
            { value: "all", label: t("الكل", "All") },
            { value: "success", label: t("ناجحة", "Successful") },
            { value: "blank", label: t("بدون صيد", "No catch") },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6">
          <Empty icon="🛶" title={ds.trips.length ? t("لا توجد نتائج", "No matching trips") : t("لا توجد رحلات بعد", "No trips yet")} action={undefined} />
        </div>
      ) : (
        [...groups.entries()].map(([k, list]) => {
          const ms = summarize(list.filter((r) => r.trip.status === "completed"));
          return (
            <section key={k} className="mt-5">
              <div className="sticky top-[calc(var(--safe-top)+4.25rem)] z-10 -mx-4 mb-2 flex items-baseline justify-between bg-abyss/80 px-5 py-1.5 backdrop-blur">
                <h2 className="font-semibold">{fmtDate(`${k}-15T12:00:00Z`, lang, { day: undefined, month: "long", year: "numeric" })}</h2>
                <span className="text-xs text-muted">
                  {ms.catches} {t("سمكة", "fish")} · {pct(ms.successRate)} <N n={ms.trips} />
                </span>
              </div>
              <div className="space-y-2">
                {list.map((r) => (
                  <TripCard key={r.trip.id} trip={r.trip} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
