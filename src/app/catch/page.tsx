"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Pencil, Sparkles, Trash2 } from "lucide-react";
import { AiPanel } from "@/components/AiPanel";
import { CatchSummaryCard } from "@/components/CatchSummaryCard";
import { EnvPanel } from "@/components/EnvPanel";
import { DualDate, MeasureTag, Photo } from "@/components/common";
import { Badge, Button, Card, Empty, PageHeader, SectionTitle, Sheet } from "@/components/ui";
import { MOON_EMOJI } from "@/lib/astro";
import { useStore } from "@/lib/db/store";
import { MOON_LABEL, TIDE_LABEL, label, useI18n } from "@/lib/i18n";
import { catchDepth, catchLocation, catchTechnique } from "@/lib/stats";
import { fmtDateTime } from "@/lib/time";
import { ShareCatch } from "@/components/ShareCatch";

export default function Page() {
  return (
    <Suspense>
      <CatchDetail />
    </Suspense>
  );
}

function CatchDetail() {
  const id = useSearchParams().get("id");
  const { ds, idx, save, remove } = useStore();
  const { t, lang, name } = useI18n();
  const router = useRouter();
  const [del, setDel] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const c = ds.catches.find((x) => x.id === id);
  if (!c)
    return (
      <>
        <PageHeader title={t("الصيدة", "Catch")} back />
        <Empty icon="🔍" title={t("غير موجودة", "Not found")} />
      </>
    );
  const sp = c.species_id ? idx.speciesById.get(c.species_id) : null;
  const extraPhotos = ds.catch_media.filter((x) => x.catch_id === c.id).sort((a, b) => a.sort_order - b.sort_order).map((x) => x.media_id);
  const trip = idx.tripById.get(c.trip_id ?? "");
  const locId = catchLocation(c, idx);
  const techId = catchTechnique(c, idx);
  const depth = catchDepth(c, idx);
  const gear = ds.catch_equipment.filter((x) => x.catch_id === c.id).map((x) => ds.equipment.find((e) => e.id === x.equipment_id)?.name).filter(Boolean);

  const Row = ({ k, v }: { k: React.ReactNode; v: React.ReactNode }) => (
    <div className="flex items-start justify-between gap-3 py-2 text-sm">
      <span className="text-muted">{k}</span>
      <span className="text-end">{v}</span>
    </div>
  );

  return (
    <>
      <PageHeader
        title={sp ? name(sp) : t("سمكة غير محددة", "Unidentified fish")}
        subtitle={<DualDate iso={c.caught_at} />}
        back
        actions={
          <Link href={`/catch/edit?id=${c.id}`} className="grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="edit">
            <Pencil className="size-5" />
          </Link>
        }
      />
      {c.photo_media_id && <Photo mediaId={c.photo_media_id} variant="full" className="mb-3 max-h-[60dvh] w-full rounded-[var(--radius-card)] object-contain bg-black/30" />}
      {extraPhotos.length > 0 && (
        <div className="mb-3 grid grid-cols-4 gap-1.5">
          {extraPhotos.map((m) => (
            <button key={m} onClick={() => setViewer(m)} className="aspect-square overflow-hidden rounded-xl">
              <Photo mediaId={m} className="size-full" />
            </button>
          ))}
        </div>
      )}
      <div className="mb-3">
        <CatchSummaryCard c={c} />
        <ShareCatch c={c} />
      </div>

      {!c.species_id && c.photo_media_id && (
        <Card className="mb-3">
          <AiPanel
            photoMediaId={c.photo_media_id}
            suggestion={c.ai_suggestion}
            onSuggestion={(s) => void save("catches", { ...c, ai_suggestion: s })}
            onPick={(speciesId, status) =>
              void save("catches", { ...c, species_id: speciesId, identification_status: status, ai_species_id: status === "ai_confirmed" ? speciesId : c.ai_species_id })
            }
          />
        </Card>
      )}

      <Card className="divide-y divide-line/40 py-1">
        <Row
          k={t("النوع", "Species")}
          v={
            sp ? (
              <Link href={`/species?id=${sp.id}`} className="text-teal">
                {name(sp)} {sp.scientific_name && <i className="text-xs text-muted">({sp.scientific_name})</i>}
              </Link>
            ) : (
              "—"
            )
          }
        />
        <Row
          k={t("التعرّف", "Identification")}
          v={
            {
              manual: t("يدوي", "Manual"),
              ai_confirmed: t("اقتراح AI مؤكد", "AI suggestion confirmed"),
              ai_corrected: t("مصحح بعد اقتراح AI", "Corrected after AI"),
              pending_ai: t("بانتظار AI", "Waiting for AI"),
              unidentified: t("غير محدد", "Unidentified"),
            }[c.identification_status]
          }
        />
        <Row k={t("الوقت", "Time")} v={fmtDateTime(c.caught_at, lang)} />
        <Row
          k={t("الوزن", "Weight")}
          v={
            c.weight_kg != null ? (
              <span className="flex items-center gap-2">
                <span>{c.weight_kg} {t("كغ", "kg")}</span> <MeasureTag estimate={c.weight_is_estimate} />
              </span>
            ) : (
              "—"
            )
          }
        />
        <Row
          k={t("الطول", "Length")}
          v={
            c.length_cm != null ? (
              <span className="flex items-center gap-2">
                <span>{c.length_cm} {t("سم", "cm")}</span> <MeasureTag estimate={c.length_is_estimate} />
              </span>
            ) : (
              "—"
            )
          }
        />
        <Row k={t("الحالة", "Kept / released")} v={c.released ? t("أُطلقت", "Released") : t("احتُفظ بها", "Kept")} />
        <Row
          k={t("الرحلة", "Trip")}
          v={
            trip ? (
              <Link className="text-teal" href={`/trip?id=${trip.id}`}>
                {trip.title || (trip.location_id && idx.locById.get(trip.location_id)?.name) || t("فتح الرحلة", "Open trip")}
              </Link>
            ) : (
              <select
                aria-label={t("اربط برحلة", "Link to a trip")}
                value=""
                onChange={(e) => e.target.value && void save("catches", { ...c, trip_id: e.target.value })}
                className="max-w-48 rounded-lg border border-warn/40 bg-surface-2 px-2 py-1 text-xs text-warn"
              >
                <option value="">{t("غير مرتبطة — اربطها برحلة", "Not linked — link to a trip")}</option>
                {[...ds.trips]
                  .filter((x) => x.status !== "cancelled")
                  .sort((a, b) => b.started_at.localeCompare(a.started_at))
                  .slice(0, 30)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title || (x.location_id && idx.locById.get(x.location_id)?.name) || t("رحلة", "Trip")} · {fmtDateTime(x.started_at, lang)}
                    </option>
                  ))}
              </select>
            )
          }
        />
        <Row k={t("الموقع", "Spot")} v={locId ? idx.locById.get(locId)?.name : "—"} />
        <Row k={t("الطريقة", "Technique")} v={techId ? name(idx.techById.get(techId)) : "—"} />
        <Row k={t("العمق", "Depth")} v={depth ? `${depth.depth} ${t("م", "m")}${depth.fromTrip ? t(" (من الرحلة)", " (trip)") : ""}` : "—"} />
        <Row k={t("الخيط", "Line")} v={[c.line_type, c.pe_rating ? `PE${c.pe_rating}` : null].filter(Boolean).join(" · ") || "—"} />
        <Row k={t("الطُعم", "Lure / bait")} v={c.lure_bait ?? "—"} />
        {c.rod_reel && <Row k={t("العصا والمكينة", "Rod & reel")} v={c.rod_reel} />}
        {c.leader && <Row k={t("الليدر", "Leader")} v={c.leader} />}
        {c.hook && <Row k={t("الميدار", "Hook")} v={c.hook} />}
        {c.lat != null && <Row k="GPS" v={<span className="ltr">{c.lat}, {c.lng}</span>} />}
        {gear.length > 0 && <Row k={t("المعدات", "Gear")} v={gear.join("، ")} />}
      </Card>

      <SectionTitle>{t("الظروف وقت الصيد", "Conditions at catch time")}</SectionTitle>
      <EnvPanel trip={trip ?? null} c={c} />

      {c.ai_suggestion && c.species_id && (
        <>
          <SectionTitle>{t("سجل اقتراح الذكاء الاصطناعي", "AI suggestion record")}</SectionTitle>
          <Card className="space-y-1 text-sm">
            <div className="flex items-center gap-2 text-muted">
              <Sparkles className="size-4" /> {c.ai_suggestion.model}
            </div>
            {c.ai_suggestion.candidates.map((x, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span>{lang === "ar" ? x.name_ar : x.name_en}</span>
                <Badge>{Math.round(x.confidence * 100)}%</Badge>
              </div>
            ))}
          </Card>
        </>
      )}

      {c.notes && (
        <>
          <SectionTitle>{t("ملاحظات", "Notes")}</SectionTitle>
          <Card className="whitespace-pre-wrap text-sm">{c.notes}</Card>
        </>
      )}

      <Button variant="danger" className="mt-8 w-full" onClick={() => setDel(true)}>
        <Trash2 className="size-4" /> {t("حذف الصيدة", "Delete catch")}
      </Button>
      <Sheet open={!!viewer} onClose={() => setViewer(null)} title={t("صورة", "Photo")}>
        {viewer && <Photo mediaId={viewer} variant="full" className="max-h-[75dvh] w-full rounded-xl object-contain" />}
      </Sheet>
      <Sheet open={del} onClose={() => setDel(false)} title={t("حذف هذه الصيدة؟", "Delete this catch?")}>
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            onClick={async () => {
              await remove("catches", c);
              router.replace(trip ? `/trip?id=${trip.id}` : "/catches");
            }}
          >
            {t("حذف", "Delete")}
          </Button>
          <Button variant="secondary" onClick={() => setDel(false)}>
            {t("إلغاء", "Cancel")}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
