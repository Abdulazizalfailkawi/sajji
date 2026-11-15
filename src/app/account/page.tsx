"use client";

// حسابي — sign in (when there's no account yet) or, once signed in, the user's
// profile: photo, name, short bio and a few light extras.

import Link from "next/link";
import { useRef, useState } from "react";
import { BadgeCheck, BarChart3, Camera, CircleUserRound, Cloud, KeyRound, LogIn, LogOut, Map as MapIcon, Settings, Smartphone, Trash2, Users } from "lucide-react";
import { Photo } from "@/components/common";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Field, Input, LinkButton, Notice, PageHeader, Textarea } from "@/components/ui";
import { useIsAdmin } from "@/lib/admin";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { useProfile } from "@/lib/profile";

/** Pages that used to sit in the bottom bar (design v3 keeps only البحر · صيدي · حسابي). */
function AccountLinks({ community = false }: { community?: boolean }) {
  const { t } = useI18n();
  const items = [
    ...(community ? [{ href: "/community", Icon: Users, l: t("المجتمع", "Community"), tone: "text-mint" }] : []),
    { href: "/stats", Icon: BarChart3, l: t("إحصائياتي والتحليلات", "Stats & analytics"), tone: "text-ocean" },
    { href: "/map", Icon: MapIcon, l: t("الخريطة", "Map"), tone: "text-ocean" },
  ];
  return (
    <div className="mt-3 grid grid-cols-1 gap-2">
      {items.map(({ href, Icon, l, tone }) => (
        <Link key={href} href={href} className="flex items-center gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-3 text-sm font-semibold backdrop-blur-md">
          <Icon className={`size-5 ${tone}`} /> {l}
        </Link>
      ))}
    </div>
  );
}

export default function AccountPage() {
  const store = useStore();
  const { ds, user, addPhoto } = store;
  const { t } = useI18n();
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const { profile, save, signedIn } = useProfile();
  const fail = t("تعذر الحفظ، جرّب مرة ثانية", "Couldn't save, try again");
  const [name, setName] = useState<string | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  if (!signedIn) {
    return (
      <>
        <PageHeader title={t("تسجيل دخول", "Sign in")} />
        <Card className="space-y-4 text-center">
          <div className="mx-auto grid size-20 place-items-center rounded-full border border-ocean/40 bg-ocean/10">
            <CircleUserRound className="size-10 text-ocean" />
          </div>
          <div>
            <div className="text-lg font-bold">{t("سجّل دخولك في سجي", "Sign in to SAJJI")}</div>
            <p className="mt-1 text-sm text-ink-2">{t("التطبيق يشتغل بنفس الشكل بحساب أو بدون. الحساب يحفظ بياناتك.", "The app works the same with or without an account. An account keeps your data.")}</p>
          </div>
          <ul className="space-y-2 text-start text-sm">
            <li className="flex items-start gap-2">
              <Cloud className="mt-0.5 size-4 shrink-0 text-ocean" /> {t("رحلاتك وصيدك وصورك تنحفظ ولا تضيع لو غيّرت الجوال.", "Your trips, catches and photos are saved even if you change phones.")}
            </li>
            <li className="flex items-start gap-2">
              <Smartphone className="mt-0.5 size-4 shrink-0 text-ocean" /> {t("تفتحها من أي جهاز بنفس الحساب.", "Open them from any device with the same account.")}
            </li>
            <li className="flex items-start gap-2">
              <BadgeCheck className="mt-0.5 size-4 shrink-0 text-ocean" /> {t("ملف شخصي: اسمك ونبذة عنك وصورة بروفايل.", "A profile: your name, a short bio and a profile photo.")}
            </li>
          </ul>
          <LinkButton href="/login?next=/account" size="lg" className="w-full">
            <LogIn className="size-5" /> {t("تسجيل الدخول / إنشاء حساب", "Sign in / Create account")}
          </LinkButton>
          <p className="text-xs text-muted">{t("بدون رسالة تأكيد — تسجّل وتدخل مباشرة.", "No confirmation email — sign up and you're in.")}</p>
        </Card>
        <AccountLinks />
      </>
    );
  }

  const shownName = name ?? profile.display_name ?? "";
  const shownBio = bio ?? profile.bio ?? "";
  const dirty = shownName !== (profile.display_name ?? "") || shownBio !== (profile.bio ?? "");
  const trips = ds.trips.filter((x) => x.status !== "cancelled").length;
  const species = new Set(ds.catches.map((c) => c.species_id).filter(Boolean)).size;

  const onPhoto = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true);
    setErr(null);
    try {
      const m = await addPhoto(f);
      const ok = await save({ avatar_media_id: m.id });
      if (!ok) setErr(fail);
      else toast(t("تم تحديث صورتك", "Photo updated"));
    } catch {
      setErr(t("تعذرت قراءة الصورة، جرّب صورة ثانية", "Couldn't read that photo, try another"));
    } finally {
      setBusy(false);
      if (pick.current) pick.current.value = "";
    }
  };

  const Stat = ({ n, label }: { n: number; label: string }) => (
    <div className="rounded-2xl border border-ocean/30 bg-ocean/10 p-3 text-center">
      <div className="text-2xl font-extrabold text-white">{n}</div>
      <div className="text-xs text-ocean">{label}</div>
    </div>
  );

  return (
    <>
      <PageHeader title={t("حسابي", "My account")} />
      <Card className="space-y-4">
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <div className="grid size-28 place-items-center overflow-hidden rounded-full border-2 border-ocean/60 bg-surface-2">
              {profile.avatar_media_id ? <Photo mediaId={profile.avatar_media_id} variant="full" className="size-28 rounded-full object-cover" /> : <CircleUserRound className="size-16 text-ocean" />}
            </div>
            <button type="button" aria-label={t("تغيير الصورة", "Change photo")} disabled={busy} onClick={() => pick.current?.click()} className="absolute -bottom-1 -end-1 grid size-10 place-items-center rounded-full border border-white/20 bg-black text-white">
              <Camera className="size-5" />
            </button>
            <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => onPhoto(e.target.files)} />
          </div>
          {profile.avatar_media_id && (
            <button
              type="button"
              className="flex items-center gap-1 text-xs text-bad"
              onClick={async () => {
                const ok = await save({ avatar_media_id: null });
                if (!ok) setErr(fail);
              }}
            >
              <Trash2 className="size-3.5" /> {t("حذف الصورة", "Remove photo")}
            </button>
          )}
          <div className="ltr text-sm text-ink-2">{user?.email}</div>
          {isAdmin && <Badge tone="warn">{t("مشرف", "Admin")}</Badge>}
        </div>

        <Field label={t("الاسم", "Name")}>
          <Input value={shownName} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={t("اسمك أو لقبك (اختياري)", "Your name or nickname (optional)")} />
        </Field>
        <Field label={t("نبذة عنك", "About you")} hint={`${shownBio.length}/300`}>
          <Textarea value={shownBio} maxLength={300} rows={3} onChange={(e) => setBio(e.target.value)} placeholder={t("اكتب شيء عنك أو عن صيدك (اختياري)", "Write something about you or your fishing (optional)")} />
        </Field>
        {err && <Notice tone="bad">{err}</Notice>}
        <Button
          className="w-full"
          disabled={!dirty}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const ok = await save({ display_name: shownName.trim() || null, bio: shownBio.trim() || null });
            setBusy(false);
            if (!ok) setErr(fail);
            else {
              setErr(null);
              setName(null);
              setBio(null);
              toast(t("تم حفظ ملفك", "Profile saved"));
            }
          }}
        >
          {t("حفظ", "Save")}
        </Button>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat n={trips} label={t("رحلات", "Trips")} />
        <Stat n={ds.catches.length} label={t("صيدات", "Catches")} />
        <Stat n={species} label={t("أنواع", "Species")} />
      </div>

      <AccountLinks community />

      <div className="mt-3 space-y-2">
        <Link href="/settings" className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm font-medium">
          <Settings className="size-5 text-ocean" /> {t("الإعدادات", "Settings")}
        </Link>
        <Link href="/reset-password" className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 text-sm font-medium">
          <KeyRound className="size-5 text-ocean" /> {t("تغيير كلمة المرور", "Change password")}
        </Link>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-2xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm font-medium text-bad"
          onClick={async () => {
            if (!confirm(t("تسجيل الخروج؟ بياناتك تبقى محفوظة في حسابك.", "Sign out? Your data stays saved in your account."))) return;
            await store.signOut();
          }}
        >
          <LogOut className="size-5" /> {t("تسجيل الخروج", "Sign out")}
        </button>
      </div>
    </>
  );
}
