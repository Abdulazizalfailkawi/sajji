"use client";

// المجتمع — a timeline of fish photos from signed-in users, with likes and comments.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { CommunityComposer } from "@/components/CommunityComposer";
import { useToast } from "@/components/Toast";
import { PostCard } from "@/components/PostCard";
import { Button, Card, Empty, LinkButton, Notice, PageHeader, Spinner } from "@/components/ui";
import { fetchFeed, markCommunitySeen, signedUrls, useCommunityActivity, type Post } from "@/lib/community";
import { useIsAdmin } from "@/lib/admin";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";

export default function CommunityPage() {
  const { mode, user } = useStore();
  const { t, lang } = useI18n();
  const toast = useToast();
  const isAdmin = useIsAdmin();
  const activity = useCommunityActivity();
  const [posts, setPosts] = useState<Post[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [compose, setCompose] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    async (before?: string) => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetchFeed(before);
        setPosts((cur) => (before ? [...cur, ...r.posts] : r.posts));
        setMore(r.more);
        const u = await signedUrls(r.posts.map((p) => p.photo_path));
        setUrls((cur) => ({ ...cur, ...u }));
      } catch (e) {
        setErr((e as Error).message === "SIGN_IN" ? t("سجّل الدخول لعرض المجتمع", "Sign in to see the community") : navigator.onLine ? t("تعذر تحميل المنشورات", "Couldn't load posts") : t("ما فيه إنترنت", "You're offline"));
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  useEffect(() => {
    if (mode !== "cloud") return;
    void load();
    markCommunitySeen();
  }, [mode, load]);

  if (mode !== "cloud" || !user) {
    return (
      <>
        <PageHeader title={t("المجتمع", "Community")} />
        <Card className="space-y-3 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-full border border-ocean/40 bg-ocean/10">
            <Users className="size-8 text-ocean" />
          </div>
          <div className="text-lg font-bold">{t("مجتمع سجي", "SAJJI community")}</div>
          <p className="text-sm text-ink-2">{t("شارك صيدتك مع باقي الصيادين، وشوف صيدهم وعلّق وأعجب. يحتاج حساب.", "Share your catch with other fishermen, see theirs, comment and like. Needs an account.")}</p>
          <LinkButton href="/login?next=/community" size="lg" className="w-full">
            {t("تسجيل الدخول / إنشاء حساب", "Sign in / Create account")}
          </LinkButton>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("المجتمع", "Community")} />
      {activity.total > 0 && (
        <Notice tone="info" className="mb-3">
          {t(`على منشوراتك: ${activity.comments} تعليق جديد و${activity.likes} إعجاب`, `On your posts: ${activity.comments} new comments and ${activity.likes} likes`)}
        </Notice>
      )}
      <Button size="lg" className="mb-3 w-full" onClick={() => setCompose(true)}>
        <Plus className="size-5" /> {t("منشور جديد", "New post")}
      </Button>
      {err && <Notice tone="warn">{err}</Notice>}
      {!posts.length && loading && (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}
      {!posts.length && !loading && !err && (
        <Empty icon="🐟" title={t("ما فيه منشورات بعد", "No posts yet")}>
          {t("كن أول من ينشر صيدته!", "Be the first to share a catch!")}
        </Empty>
      )}
      <div className="space-y-3">
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            url={urls[p.photo_path]}
            userId={user.id}
            isAdmin={isAdmin}
            expanded={open === p.id}
            onToggle={() => setOpen(open === p.id ? null : p.id)}
            onChange={(np) => setPosts((cur) => cur.map((x) => (x.id === np.id ? np : x)))}
            onGone={() => setPosts((cur) => cur.filter((x) => x.id !== p.id))}
            toast={toast}
          />
        ))}
      </div>
      {more && (
        <Button variant="secondary" className="mt-3 w-full" loading={loading} onClick={() => load(posts[posts.length - 1]?.created_at)}>
          {t("عرض المزيد", "Load more")}
        </Button>
      )}
      <CommunityComposer
        open={compose}
        onClose={() => setCompose(false)}
        onPosted={() => {
          toast(t("تم نشر صيدتك", "Posted"));
          void load();
        }}
      />
      <p className="mt-4 text-center text-[11px] text-muted">
        <Link href="/settings">{t("أنت تشارك باسمك المعروض في حسابي", "You post under the name shown in My account")}</Link>
      </p>
    </>
  );
}
