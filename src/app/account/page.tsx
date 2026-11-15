"use client";

// حسابي — sign in (when there's no account yet) or, once signed in, the user's
// profile: photo, name, short bio and a few light extras.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, BarChart3, Camera, CircleUserRound, Cloud, KeyRound, Lock, LogIn, LogOut, Map as MapIcon, Plus, Settings, Smartphone, Trash2, Users } from "lucide-react";
import { Photo } from "@/components/common";
import { CommunityComposer } from "@/components/CommunityComposer";
import { PostCard } from "@/components/PostCard";
import { useToast } from "@/components/Toast";
import { Badge, Button, Card, Field, Input, LinkButton, Notice, PageHeader, Sheet, Textarea } from "@/components/ui";
import { useIsAdmin } from "@/lib/admin";
import { fetchMyPosts, signedUrls, type Post } from "@/lib/community";
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
  const idx = store.idx;
  const [edit, setEdit] = useState(false);
  const [compose, setCompose] = useState(false);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [postsErr, setPostsErr] = useState<string | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const loadPosts = useCallback(async () => {
    setPostsErr(null);
    try {
      const list = await fetchMyPosts();
      setPosts(list);
      const u = await signedUrls(list.map((p) => p.thumb_path ?? p.photo_path));
      setUrls((cur) => ({ ...cur, ...u }));
    } catch {
      setPosts((cur) => cur ?? []);
      setPostsErr(typeof navigator !== "undefined" && !navigator.onLine ? t("ما فيه إنترنت — صورك تظهر لما يرجع الاتصال", "You're offline — your photos show when you're back online") : t("تعذر تحميل صورك", "Couldn't load your photos"));
    }
  }, [t]);
  useEffect(() => {
    if (signedIn) void loadPosts();
  }, [signedIn, loadPosts]);

  const opened = posts?.find((p) => p.id === openId) ?? null;
  const openPost = (p: Post) => {
    setCommentsOpen(false);
    setOpenId(p.id);
    void signedUrls([p.photo_path]).then((u) => setUrls((cur) => ({ ...cur, ...u })));
  };

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
  const species = new Set(ds.catches.map((c) => c.species_id).filter(Boolean)).size;
  const topFish = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of ds.catches) if (c.species_id) m.set(c.species_id, (m.get(c.species_id) ?? 0) + 1);
    const best = [...m.entries()].sort((x, y) => y[1] - x[1])[0];
    return best ? idx.speciesById.get(best[0])?.name_ar ?? null : null;
  }, [ds.catches, idx]);

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

  const displayName = profile.display_name?.trim() || t("صيّاد سجي", "SAJJI angler");

  return (
    <>
      <PageHeader
        title={displayName}
        actions={
          <button type="button" aria-label={t("أضف صورة", "Add a photo")} onClick={() => setCompose(true)} className="glass grid size-11 place-items-center rounded-2xl">
            <Plus className="size-6" />
          </button>
        }
      />

      <div className="flex items-center gap-4">
        <div className="size-[92px] shrink-0 rounded-full bg-[conic-gradient(#8cc4ff,#5fd3a8,#f5c453,#ff8fa3,#8cc4ff)] p-[3px]">
          <div className="grid size-full place-items-center overflow-hidden rounded-full border-[3px] border-abyss bg-surface-2">
            {profile.avatar_media_id ? <Photo mediaId={profile.avatar_media_id} variant="full" className="size-full object-cover" /> : <CircleUserRound className="size-12 text-ocean" />}
          </div>
        </div>
        <div className="grid flex-1 grid-cols-3 text-center">
          <div>
            <div className="text-xl font-bold">{posts ? posts.length : "—"}</div>
            <div className="text-xs text-muted">{t("صورة", "Photos")}</div>
          </div>
          <div>
            <div className="text-xl font-bold">{ds.catches.length}</div>
            <div className="text-xs text-muted">{t("صيدة", "Catches")}</div>
          </div>
          <div>
            <div className="text-xl font-bold">{species}</div>
            <div className="text-xs text-muted">{t("أنواع", "Species")}</div>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center gap-2">
          <div className="text-base font-bold">{displayName}</div>
          {isAdmin && <Badge tone="warn">{t("مشرف", "Admin")}</Badge>}
        </div>
        {profile.bio ? <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-2">{profile.bio}</p> : <p className="mt-0.5 text-sm text-muted">{t("أضف نبذة عنك من «تعديل البروفايل»", "Add a short bio from “Edit profile”")}</p>}
        {topFish && <span className="mt-2 inline-block rounded-[10px] bg-mint/15 px-2.5 py-1 text-xs font-semibold text-mint">{t(`أكثر سمكة: ${topFish}`, `Top fish: ${topFish}`)}</span>}
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2">
        <button type="button" onClick={() => setEdit(true)} className="glass h-10 rounded-xl text-sm font-semibold">
          {t("تعديل البروفايل", "Edit profile")}
        </button>
        <button type="button" onClick={() => setCompose(true)} className="h-10 rounded-xl bg-ocean text-sm font-bold text-abyss">
          {t("+ صورة مع صيدتك", "+ Photo with your catch")}
        </button>
      </div>

      <div className="mt-4 border-b border-line/50" />
      {postsErr && (
        <Notice tone="warn" className="mt-3">
          {postsErr}
        </Notice>
      )}
      {posts && posts.length === 0 && !postsErr && (
        <div className="py-10 text-center">
          <div className="text-4xl">📸</div>
          <div className="mt-2 text-[15px] font-bold">{t("ما نشرت صور للحين", "No photos yet")}</div>
          <p className="mt-1 text-sm text-muted">{t("انزل صورة تذكارية مع صيدتك، للكل أو لك بس", "Post a souvenir photo with your catch, for everyone or just you")}</p>
          <Button className="mt-3" onClick={() => setCompose(true)}>
            <Plus className="size-4" /> {t("أضف صورة", "Add a photo")}
          </Button>
        </div>
      )}
      {posts && posts.length > 0 && (
        <div className="-mx-4 mt-0.5 grid grid-cols-3 gap-0.5">
          {posts.map((p) => (
            <button key={p.id} type="button" onClick={() => openPost(p)} className="relative aspect-square overflow-hidden bg-surface-2 transition-transform active:scale-[0.98]">
              {urls[p.thumb_path ?? p.photo_path] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={urls[p.thumb_path ?? p.photo_path]} alt={p.species_name ?? ""} loading="lazy" className="size-full object-cover" />
              )}
              {p.species_name && <span className="absolute bottom-1.5 end-1.5 rounded-lg bg-abyss/70 px-1.5 py-0.5 text-[11px] font-bold">{p.species_name}</span>}
              {p.visibility === "private" && (
                <span className="absolute start-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-abyss/70">
                  <Lock className="size-3.5 text-warn" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

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
        <div className="ltr pb-2 text-center text-xs text-muted">{user?.email}</div>
      </div>

      <Sheet open={edit} onClose={() => setEdit(false)} title={t("تعديل البروفايل", "Edit profile")}>
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-2">
            <div className="relative">
              <div className="grid size-24 place-items-center overflow-hidden rounded-full border-2 border-ocean/60 bg-surface-2">
                {profile.avatar_media_id ? <Photo mediaId={profile.avatar_media_id} variant="full" className="size-24 rounded-full object-cover" /> : <CircleUserRound className="size-14 text-ocean" />}
              </div>
              <button type="button" aria-label={t("تغيير الصورة", "Change photo")} disabled={busy} onClick={() => pick.current?.click()} className="absolute -bottom-1 -end-1 grid size-10 place-items-center rounded-full border border-white/20 bg-abyss text-white">
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
                setEdit(false);
                toast(t("تم حفظ ملفك", "Profile saved"));
              }
            }}
          >
            {t("حفظ", "Save")}
          </Button>
        </div>
      </Sheet>

      <Sheet open={!!openId} onClose={() => setOpenId(null)} title={t("صورة", "Photo")}>
        {opened && user && (
          <PostCard
            post={opened}
            url={urls[opened.photo_path]}
            userId={user.id}
            isAdmin={isAdmin}
            expanded={commentsOpen}
            onToggle={() => setCommentsOpen((v) => !v)}
            onChange={(np) => setPosts((cur) => (cur ?? []).map((x) => (x.id === np.id ? { ...np, visibility: x.visibility } : x)))}
            onGone={() => {
              setPosts((cur) => (cur ?? []).filter((x) => x.id !== opened.id));
              setOpenId(null);
            }}
            toast={toast}
          />
        )}
      </Sheet>

      <CommunityComposer
        open={compose}
        onClose={() => setCompose(false)}
        onPosted={() => {
          toast(t("انحفظت صورتك ✓", "Photo posted ✓"));
          void loadPosts();
        }}
      />
    </>
  );
}
