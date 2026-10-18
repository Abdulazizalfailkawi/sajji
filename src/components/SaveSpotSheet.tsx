"use client";

// «علّم هنا» — store the coordinate you are standing on right now (e.g. where you
// just caught a fish). It goes to the separate «إحداثياتي» list; it is NOT added
// to the spots used for trips and catches.

import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, LocateFixed, MapPinPlus } from "lucide-react";
import { useStore } from "@/lib/db/store";
import { depthWord, fromUnit, toUnit, useDepthUnit } from "@/lib/depth";
import { getGps } from "@/lib/gps";
import { uuid } from "@/lib/ids";
import { useI18n } from "@/lib/i18n";
import { fmtDate, fmtTime } from "@/lib/time";
import type { Mark } from "@/lib/types";
import { Button, Field, Input, NumberInput, Notice, Sheet, Spinner, Textarea } from "./ui";

export function SaveSpotSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved?: (id: string) => void }) {
  const { save } = useStore();
  const { t, lang } = useI18n();
  const du = useDepthUnit();
  const [pt, setPt] = useState<{ lat: number; lng: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [depth, setDepth] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState<Mark | null>(null);
  const [copied, setCopied] = useState(false);

  const locate = async () => {
    setBusy(true);
    setErr(null);
    try {
      setPt(await getGps());
    } catch (e) {
      setErr((e as Error).message === "DENIED" ? t("تم رفض إذن الموقع — فعّله من إعدادات المتصفح ثم جرّب.", "Location permission denied — allow it in your browser settings and try again.") : t("تعذر تحديد موقعك. تأكد إن الـGPS شغّال وجرّب مرة ثانية.", "Couldn't get your location. Make sure GPS is on and try again."));
    } finally {
      setBusy(false);
    }
  };

  // Every time the sheet opens: reset and ask the phone where we are.
  useEffect(() => {
    if (!open) return;
    setPt(null);
    setSaved(null);
    setCopied(false);
    setNotes("");
    setDepth(null);
    setName("");
    void locate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const coords = pt ? `${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}` : "";
  const mapsUrl = pt ? `https://www.google.com/maps?q=${pt.lat},${pt.lng}` : "#";

  const doSave = async () => {
    if (!pt) return;
    const ts = new Date().toISOString();
    const mark: Mark = {
      id: uuid(),
      name: name.trim() || `${t("علامة", "Mark")} ${fmtDate(new Date(), lang, { year: undefined })} ${fmtTime(new Date(), lang)}`,
      lat: pt.lat,
      lng: pt.lng,
      depth_m: fromUnit(depth, du),
      notes: notes.trim() || null,
      created_at: ts,
      updated_at: ts,
    };
    await save("marks", mark);
    setSaved(mark);
    onSaved?.(mark.id);
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("علّم هنا — تخزين الإحداثية", "Mark here — save this coordinate")}>
      <div className="space-y-4">
        {saved ? (
          <div className="space-y-3 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-full bg-good/15 text-good">
              <Check className="size-8" strokeWidth={3} />
            </div>
            <div className="text-lg font-bold">{t("انحفظت الإحداثية", "Coordinate saved")}</div>
            <div className="text-sm text-ink-2">{saved.name}</div>
            <div className="ltr rounded-xl bg-surface-2 px-3 py-2 font-mono text-sm">{coords}</div>
            <p className="text-xs text-muted">{t("تلقاها في «رحلاتي وصيدي ← إحداثياتي».", "Find it under Trips & catches → My coordinates.")}</p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(coords);
                    setCopied(true);
                  } catch {}
                }}
              >
                <Copy className="size-4" /> {copied ? t("✓ اننسخت", "✓ Copied") : t("نسخ الإحداثية", "Copy coordinate")}
              </Button>
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium">
                <ExternalLink className="size-4" /> {t("فتح في الخرائط", "Open in Maps")}
              </a>
            </div>
            <Button className="w-full" onClick={onClose}>
              {t("تم", "Done")}
            </Button>
          </div>
        ) : (
          <>
            {busy && !pt && (
              <div className="flex items-center justify-center gap-3 rounded-xl bg-surface-2 py-6 text-sm text-ink-2">
                <Spinner /> {t("جاري تحديد موقعك…", "Finding your location…")}
              </div>
            )}
            {err && (
              <div className="space-y-2">
                <Notice tone="warn">{err}</Notice>
                <Button variant="secondary" className="w-full" onClick={locate}>
                  <LocateFixed className="size-4" /> {t("حاول مرة ثانية", "Try again")}
                </Button>
              </div>
            )}
            {pt && (
              <>
                <Field label={t("اسم المكان اللي أنت فيه", "Name of the place you're at")}>
                  <Input value={name} maxLength={60} autoFocus placeholder={t("مثلاً: عند الجسر، قدام الشاليهات…", "e.g. by the pier, in front of the chalets…")} onChange={(e) => setName(e.target.value)} />
                </Field>
                <div className="rounded-xl border border-ocean/40 bg-ocean/10 px-3 py-3 text-center">
                  <div className="text-xs font-medium text-ocean">{t("إحداثيتك الحالية", "Your current coordinate")}</div>
                  <div className="ltr mt-1 font-mono text-lg font-bold">{coords}</div>
                  <button type="button" onClick={locate} className="mt-1 text-xs text-teal underline">
                    {busy ? t("جاري التحديث…", "Updating…") : t("تحديث الموقع", "Refresh position")}
                  </button>
                </div>
                <Field label={t(`العمق (${depthWord(du, lang)}) — اختياري`, `Depth (${depthWord(du, lang)}) — optional`)}>
                  <NumberInput value={toUnit(depth, du)} onChange={(v) => setDepth(fromUnit(v, du))} />
                </Field>
                <Field label={t("ملاحظة (اختياري)", "Note (optional)")}>
                  <Textarea rows={2} value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} placeholder={t("مثلاً: صدت بالول هنا", "e.g. caught a Balool here")} />
                </Field>
                <Button size="lg" className="w-full" onClick={doSave}>
                  <MapPinPlus className="size-5" /> {t("خزّن الإحداثية", "Save coordinate")}
                </Button>
              </>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
