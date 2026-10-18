"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CloudUpload, Database, Download, LogOut, RefreshCw, Sparkles, Trash2, Upload } from "lucide-react";
import { Badge, Button, Card, Choice, Notice, PageHeader, SectionTitle, Toggle, Field, Input } from "@/components/ui";
import { aiConfigured } from "@/lib/ai";
import { base64ToBlob, buildBackup, download, parseBackup } from "@/lib/backup";
import { catchesCSV, statsCSV, tripsCSV } from "@/lib/csv";
import { putBlob } from "@/lib/db/local";
import { useStore } from "@/lib/db/store";
import { upsertInto } from "@/lib/db/sync";
import { buildDemo } from "@/lib/demo";
import { fmtHijri, hijriCalendarName, toHijri } from "@/lib/hijri";
import { useI18n } from "@/lib/i18n";
import { supabaseConfigured } from "@/lib/supabase";
import { readWindUnit, saveWindUnit, type WindUnit } from "@/lib/marine/units";
import { saveDepthUnit, useDepthUnit } from "@/lib/depth";
import { DEFAULT_CYCLE, formatRanges, overlaps, parseRanges, readCycleConfig, saveCycleConfig } from "@/lib/tidecycle";
import { tripRows } from "@/lib/stats";
import { fmtDateTime, todayKey } from "@/lib/time";
import { TABLE_ORDER, type Dataset } from "@/lib/types";
import { useIsAdmin } from "@/lib/admin";

function WindUnitChoice() {
  const { t } = useI18n();
  const [u, setU] = useState<WindUnit>("kmh");
  useEffect(() => setU(readWindUnit()), []);
  return (
    <Choice
      value={u}
      allowClear={false}
      onChange={(v) => {
        if (!v) return;
        setU(v);
        saveWindUnit(v);
      }}
      options={[
        { value: "kmh", label: t("كم/س", "km/h") },
        { value: "kn", label: t("عقدة", "knots") },
        { value: "ms", label: t("م/ث", "m/s") },
      ]}
    />
  );
}

function DepthUnitChoice() {
  const { t } = useI18n();
  const u = useDepthUnit();
  return (
    <Choice
      value={u}
      allowClear={false}
      onChange={(v) => v && saveDepthUnit(v)}
      options={[
        { value: "ft", label: t("قدم", "feet") },
        { value: "m", label: t("متر", "metres") },
      ]}
    />
  );
}

function CycleSettings() {
  const { t } = useI18n();
  const [hamal, setHamal] = useState("");
  const [fasad, setFasad] = useState("");
  const [msg, setMsg] = useState<{ tone: "info" | "bad"; text: string } | null>(null);
  useEffect(() => {
    const c = readCycleConfig();
    setHamal(formatRanges(c.hamal));
    setFasad(formatRanges(c.fasad));
  }, []);
  const saveIt = () => {
    const h = parseRanges(hamal);
    const f = parseRanges(fasad);
    if (!h || !f) return setMsg({ tone: "bad", text: t("صيغة غير صحيحة — مثال: 12-19, 27-4", "Invalid format — e.g. 12-19, 27-4") });
    const cfg = { hamal: h, fasad: f };
    if (overlaps(cfg)) return setMsg({ tone: "bad", text: t("بعض الأيام موجودة في الحمل والفساد معاً", "Some days are in both Haml and Fasad") });
    saveCycleConfig(cfg);
    setMsg({ tone: "info", text: t("تم الحفظ", "Saved") });
  };
  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-muted">
        {t(
          "الحمل: أيام المد القوي قرب المحاق والبدر. الفساد: أيام المد الضعيف قرب التربيعين. تُحسب حسب اليوم الهجري (مع الإزاحة أعلاه). الأيام بين النطاقين انتقالية. عدّلها حسب العرف اللي تمشي عليه.",
          "Haml: strong-tide days near the new and full moon. Fasad: weak-tide days near the quarters. Counted by Hijri day (with the offset above). Days outside both are transitional. Adjust to the convention you follow.",
        )}
      </p>
      <Field label={t("أيام الحمل (هجري)", "Haml days (Hijri)")} hint="12-19, 27-4">
        <Input dir="ltr" value={hamal} onChange={(e) => setHamal(e.target.value)} />
      </Field>
      <Field label={t("أيام الفساد (هجري)", "Fasad days (Hijri)")} hint="5-11, 20-26">
        <Input dir="ltr" value={fasad} onChange={(e) => setFasad(e.target.value)} />
      </Field>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      <div className="flex gap-2">
        <Button className="flex-1" onClick={saveIt}>
          {t("حفظ", "Save")}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            saveCycleConfig(null);
            setHamal(formatRanges(DEFAULT_CYCLE.hamal));
            setFasad(formatRanges(DEFAULT_CYCLE.fasad));
            setMsg({ tone: "info", text: t("رجعت للافتراضي", "Reset to default") });
          }}
        >
          {t("الافتراضي", "Default")}
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const isAdmin = useIsAdmin();
  const store = useStore();
  const { ds, idx, mode, user, online, syncing, pending, failed, lastSyncAt, syncError, hijriOffset, setHijriOffset, save, remove } = store;
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const [withPhotos, setWithPhotos] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "bad" | "warn"; text: string } | null>(null);
  const [ai, setAi] = useState<boolean | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const demoCount = ds.trips.filter((x) => x.is_demo).length;

  useEffect(() => {
    void aiConfigured().then(setAi);
  }, []);

  const exportJson = async () => {
    setBusy("backup");
    try {
      const b = await buildBackup(ds, withPhotos);
      download(`fishing-backup-${todayKey()}.json`, JSON.stringify(b), "application/json");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (file: File | undefined) => {
    if (!file) return;
    setBusy("restore");
    setMsg(null);
    try {
      const b = parseBackup(await file.text());
      // Merge: restored rows overwrite same-id rows, nothing else is deleted.
      let merged: Dataset = ds;
      for (const tname of TABLE_ORDER) merged = upsertInto(merged, tname, (b.data as unknown as Record<string, Record<string, unknown>[]>)[tname]);
      if (b.photos) for (const [id, b64] of Object.entries(b.photos)) await putBlob(`${id}:full`, base64ToBlob(b64));
      await store.replaceDataset(merged, b.data);
      const n = b.data.trips.length;
      setMsg({ tone: "info", text: t(`تمت الاستعادة: ${n} رحلة و${b.data.catches.length} سمكة.`, `Restored ${n} trips and ${b.data.catches.length} catches.`) });
    } catch (e) {
      const code = (e as Error).message;
      setMsg({
        tone: "bad",
        text:
          code === "NOT_A_BACKUP" || code === "INVALID_JSON"
            ? t("الملف ليس نسخة احتياطية صالحة لهذا التطبيق.", "That file isn't a valid backup from this app.")
            : code === "NEWER_VERSION"
              ? t("النسخة من إصدار أحدث من التطبيق.", "That backup is from a newer app version.")
              : t(`تعذرت الاستعادة (${code})`, `Restore failed (${code})`),
      });
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const loadDemo = async () => {
    setBusy("demo");
    const d = buildDemo(ds);
    await save("locations", d.locations);
    await save("equipment", d.equipment);
    await save("trips", d.trips);
    await save("catches", d.catches);
    await save("trip_equipment", d.trip_equipment);
    await save("goals", d.goals);
    setBusy(null);
    setMsg({ tone: "info", text: t(`أُضيفت ${d.trips.length} رحلة تجريبية.`, `Added ${d.trips.length} demo trips.`) });
  };

  const removeDemo = async () => {
    setBusy("demo");
    await remove("trips", ds.trips.filter((x) => x.is_demo));
    await remove("catches", store.ds.catches.filter((x) => x.is_demo));
    await remove("goals", ds.goals.filter((x) => x.is_demo));
    await remove("equipment", ds.equipment.filter((x) => x.is_demo));
    await remove("locations", ds.locations.filter((x) => x.is_demo));
    // Achievement history is re-derived from the remaining real records.
    await remove("user_achievements", ds.user_achievements);
    setBusy(null);
    setMsg({ tone: "info", text: t("حُذفت البيانات التجريبية.", "Demo data removed.") });
  };

  const h = toHijri(new Date(), hijriOffset);

  return (
    <>
      <PageHeader section="stats" title={t("الإعدادات", "Settings")} />

      {msg && <Notice tone={msg.tone} className="mb-3">{msg.text}</Notice>}

      {isAdmin && (
        <Link href="/admin" className="mb-2 block rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-center text-sm font-bold text-warn">
          {t("لوحة المشرف", "Admin dashboard")}
        </Link>
      )}
      <SectionTitle>{t("الحساب", "Account")}</SectionTitle>
      <Card className="space-y-3">
        {mode === "cloud" ? (
          <>
            <div className="text-sm">
              {t("مسجل الدخول كـ", "Signed in as")} <b className="ltr">{user?.email}</b>
            </div>
            <p className="text-xs text-muted">{t("بياناتك محفوظة في Supabase (PostgreSQL) ومحمية بسياسات أمان على مستوى الصف.", "Your data is stored in Supabase (PostgreSQL) and protected by row-level security.")}</p>
            <Button
              variant="secondary"
              onClick={async () => {
                if (pending && !confirm(t(`لديك ${pending} تغيير غير متزامن سيُحذف من هذا الجهاز. متابعة؟`, `${pending} unsynced changes will be lost on this device. Continue?`))) return;
                await store.signOut();
                router.replace("/login");
              }}
            >
              <LogOut className="size-4" /> {t("تسجيل الخروج", "Sign out")}
            </Button>
          </>
        ) : (
          <>
            <div className="text-sm">{t("تستخدم التطبيق على هذا الجهاز فقط (بدون حساب).", "You're using the app on this device only (no account).")}</div>
            {supabaseConfigured && (
              <Link href="/login" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ocean px-4 text-[15px] font-medium text-black">
                <CloudUpload className="size-4" /> {t("سجّل الدخول لرفع بياناتك ومزامنتها", "Sign in to upload & sync your data")}
              </Link>
            )}
            <p className="text-xs text-muted">{t("عند تسجيل الدخول تُدمج بيانات هذا الجهاز مع حسابك.", "When you sign in, this device's data is merged into your account.")}</p>
          </>
        )}
      </Card>

      <SectionTitle>{t("اللغة", "Language")}</SectionTitle>
      <Card>
        <Choice value={lang} allowClear={false} onChange={(v) => v && setLang(v)} options={[{ value: "ar", label: "العربية" }, { value: "en", label: "English" }]} />
      </Card>

      <SectionTitle>{t("وحدة الرياح", "Wind unit")}</SectionTitle>
      <Card>
        <WindUnitChoice />
      </Card>

      <SectionTitle>{t("وحدة العمق", "Depth unit")}</SectionTitle>
      <Card>
        <DepthUnitChoice />
      </Card>

      <SectionTitle>{t("التاريخ الهجري", "Hijri date")}</SectionTitle>
      <Card className="space-y-3">
        <div className="text-sm">
          {t("اليوم:", "Today:")} <b>{fmtHijri(h, lang)}</b>
        </div>
        <Choice
          value={String(hijriOffset)}
          allowClear={false}
          onChange={(v) => v != null && void setHijriOffset(Number(v))}
          options={["-2", "-1", "0", "1", "2"].map((v) => ({ value: v, label: <span className="ltr">{Number(v) > 0 ? `+${v}` : v}</span> }))}
        />
        <p className="text-xs leading-relaxed text-muted">
          {t(
            `التواريخ تُحسب بتقويم أم القرى (${hijriCalendarName()}). إذا كان إعلان رؤية الهلال في الكويت مختلفاً، اضبط الإزاحة هنا (تؤثر على كل التواريخ المعروضة)، أو صحّح تاريخ رحلة واحدة من صفحة تعديلها.`,
            `Dates are calculated with Umm al-Qura (${hijriCalendarName()}). If Kuwait's official moon sighting differs, set an offset here (applies to all displayed dates), or correct a single trip from its edit page.`,
          )}
        </p>
      </Card>

      <SectionTitle>
        <span id="cycle">{t("الحمل والفساد", "Haml & Fasad")}</span>
      </SectionTitle>
      <Card>
        <CycleSettings />
      </Card>

      <SectionTitle>
        <span id="sync">{t("المزامنة", "Sync")}</span>
      </SectionTitle>
      <Card className="space-y-3 text-sm">
        {mode === "cloud" ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge tone={online ? "good" : "warn"}>{online ? t("متصل", "Online") : t("غير متصل", "Offline")}</Badge>
              <Badge tone={pending ? "warn" : "good"}>{t(`${pending} بانتظار الرفع`, `${pending} pending`)}</Badge>
              {failed.length > 0 && <Badge tone="bad">{t(`${failed.length} فشل`, `${failed.length} failed`)}</Badge>}
            </div>
            <div className="text-xs text-muted">
              {t("آخر مزامنة:", "Last sync:")} {lastSyncAt ? fmtDateTime(lastSyncAt, lang) : "—"}
              {syncError && syncError !== "offline" && <span className="text-bad"> · {syncError}</span>}
            </div>
            <Button variant="secondary" loading={syncing} disabled={!online} onClick={() => store.syncNow()}>
              <RefreshCw className="size-4" /> {t("مزامنة الآن", "Sync now")}
            </Button>
            {failed.length > 0 && (
              <div className="space-y-2">
                <Notice tone="bad">{t("بعض التغييرات رفضها الخادم. تبقى محفوظة على هذا الجهاز.", "Some changes were rejected by the server. They're still kept on this device.")}</Notice>
                {failed.map((f) => (
                  <div key={f.seq} className="flex items-center justify-between gap-2 rounded-xl bg-surface-2 p-2 text-xs">
                    <span className="min-w-0 truncate">
                      {f.table} · {f.op} · <span className="text-bad">{f.error}</span>
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => store.discardFailed(f.seq!)}>
                      {t("تجاهل", "Discard")}
                    </Button>
                  </div>
                ))}
                <Button size="sm" onClick={() => store.retryFailed()}>
                  {t("إعادة المحاولة", "Retry all")}
                </Button>
              </div>
            )}
            <p className="text-xs leading-relaxed text-muted">
              {t(
                "يمكنك تسجيل الرحلات والأسماك والصور بدون إنترنت. تُحفظ على الجهاز وتظهر علامة ☁︎ عليها حتى تُرفع تلقائياً عند عودة الاتصال. لكل سجل معرّف فريد، لذا إعادة المحاولة لا تنشئ نسخاً مكررة.",
                "You can log trips, fish and photos offline. They're saved on the device, marked with a ☁︎ icon until they upload automatically when you're back online. Each record has a unique ID, so retries never create duplicates.",
              )}
            </p>
          </>
        ) : (
          <p className="text-muted">{t("وضع الجهاز فقط — لا توجد مزامنة. استخدم النسخ الاحتياطي لنقل بياناتك.", "Device-only mode — no sync. Use backups to move your data.")}</p>
        )}
      </Card>

      {isAdmin && (
        <>
      <SectionTitle>{t("التعرّف بالذكاء الاصطناعي", "AI identification")}</SectionTitle>
      <Card className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-teal" />
          {ai == null ? "…" : ai ? <Badge tone="good">{t("مُفعّل", "Enabled")}</Badge> : <Badge tone="warn">{t("غير مُفعّل", "Not configured")}</Badge>}
        </div>
        {ai === false && (
          <p className="text-xs text-muted">
            {t("أضف ANTHROPIC_API_KEY في متغيرات البيئة على الخادم (Vercel) ثم أعد النشر. الاختيار اليدوي للنوع يعمل دائماً.", "Add ANTHROPIC_API_KEY to the server environment variables (Vercel) and redeploy. Manual species selection always works.")}
          </p>
        )}
        {ds.catches.some((c) => c.identification_status === "pending_ai") && (
          <Link className="text-teal" href="/gallery?unidentified=1">
            {t("أسماك بانتظار التعرّف", "Fish waiting for identification")} →
          </Link>
        )}
      </Card>

        </>
      )}

      {isAdmin && (
        <>
      <SectionTitle>
        <span id="backup">{t("النسخ الاحتياطي والاستعادة", "Backup & restore")}</span>
      </SectionTitle>
      <Card className="space-y-3">
        <Toggle checked={withPhotos} onChange={setWithPhotos} label={t("تضمين الصور الموجودة على هذا الجهاز (ملف أكبر)", "Include photos stored on this device (bigger file)")} />
        <Button className="w-full" loading={busy === "backup"} onClick={exportJson}>
          <Download className="size-4" /> {t("تنزيل نسخة احتياطية (JSON)", "Download backup (JSON)")}
        </Button>
        <Button variant="secondary" className="w-full" loading={busy === "restore"} onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> {t("استعادة من ملف", "Restore from file")}
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => restore(e.target.files?.[0])} />
        <p className="text-xs text-muted">{t("الاستعادة تدمج السجلات (لا تحذف شيئاً موجوداً). تعمل لنقل البيانات بين الأجهزة.", "Restore merges records (nothing existing is deleted). Use it to move data between devices.")}</p>
      </Card>

      {isAdmin && (
        <>
        </>
      )}

      <SectionTitle>{t("تصدير CSV", "CSV export")}</SectionTitle>
      <Card className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button variant="secondary" onClick={() => download(`trips-${todayKey()}.csv`, tripsCSV(ds, idx, hijriOffset), "text/csv")}>
          <Download className="size-4" /> {t("الرحلات", "Trips")}
        </Button>
        <Button variant="secondary" onClick={() => download(`catches-${todayKey()}.csv`, catchesCSV(ds, idx), "text/csv")}>
          <Download className="size-4" /> {t("الأسماك", "Catches")}
        </Button>
        <Button variant="secondary" onClick={() => download(`stats-${todayKey()}.csv`, statsCSV(tripRows(ds, idx), idx), "text/csv")}>
          <Download className="size-4" /> {t("الإحصائيات", "Statistics")}
        </Button>
      </Card>

        </>
      )}

      {isAdmin && (
        <>
      <SectionTitle>
        <span id="demo">{t("بيانات تجريبية", "Demo data")}</span>
      </SectionTitle>
      <Card className="space-y-2">
        <p className="text-sm text-ink-2">
          {demoCount
            ? t(`لديك ${demoCount} رحلة تجريبية معلّمة «تجريبي».`, `You have ${demoCount} demo trips (labelled “Demo”).`)
            : t("أضف ~٢٦ رحلة واقعية لتجربة التحليلات. تُحذف بضغطة واحدة دون المساس بسجلاتك.", "Add ~26 realistic trips to try the analytics. Removable in one tap without touching your records.")}
        </p>
        {demoCount ? (
          <Button variant="danger" className="w-full" loading={busy === "demo"} onClick={removeDemo}>
            <Trash2 className="size-4" /> {t("حذف البيانات التجريبية", "Remove demo data")}
          </Button>
        ) : (
          <Button variant="secondary" className="w-full" loading={busy === "demo"} onClick={loadDemo}>
            <Database className="size-4" /> {t("تحميل بيانات تجريبية", "Load demo data")}
          </Button>
        )}
      </Card>

        </>
      )}

      <SectionTitle>{t("مصادر البيانات وحدودها", "Data sources & limits")}</SectionTitle>
      <Card className="space-y-2 text-xs leading-relaxed text-muted">
        <p>• {t("الطقس: Open-Meteo (توقعات، وأرشيف توقعات منذ ٢٠٢٢، وإعادة تحليل ERA5 لما قبل). مخرجات نماذج — ليست رصداً فعلياً.", "Weather: Open-Meteo (forecasts, archived forecasts since 2022, ERA5 reanalysis before). Model output — not on-site observations.")}</p>
        <p>• {t("الموج والسويل وحرارة الماء والتيارات: Open-Meteo Marine (نماذج بدقة ~٥–٩ كم).", "Waves, swell, sea temperature & currents: Open-Meteo Marine (~5–9 km models).")}</p>
        <p>• {t("المد والجزر: نموذج مستوى البحر من Open-Meteo (ليس جدولاً رسمياً ولا للملاحة). الوقفة = الفترة التي يتغير فيها المنسوب أقل من ٥ سم/ساعة حول التحول.", "Tide: Open-Meteo sea-level model (not an official table, not for navigation). Waqfa = period where the level changes < 5 cm/h around the turn.")}</p>
        <p>• {t("بيانات الطقس والبحر: Open-Meteo.com (CC BY 4.0). كل القيم توقعات/تقديرات نماذج وليست قياسات من موقعك.", "Weather & marine data: Open-Meteo.com (CC BY 4.0). All values are forecasts/model estimates, not measurements at your spot.")}</p>
        <p>• {t("الشروق والغروب وطور القمر: حسابات فلكية (SunCalc).", "Sunrise, sunset & moon phase: astronomical calculation (SunCalc).")}</p>
        <p>• {t("الأوقات معروضة بتوقيت الكويت (UTC+3) ومخزنة بتوقيت UTC.", "Times are shown in Kuwait time (UTC+3) and stored in UTC.")}</p>
      </Card>
    </>
  );
}
