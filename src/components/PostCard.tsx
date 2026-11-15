"use client";

// One community post (photo, fish, caption, like, comments, report / delete) —
// shared by the community feed and the profile grid.

import { useEffect, useState } from "react";
import { Flag, Lock, MessageCircle, Send, ThumbsUp, Trash2 } from "lucide-react";
import { Button, Card, Input, Spinner, cn } from "@/components/ui";
import { addComment, adminHide, deleteComment, deletePost, fetchComments, report, setLike, type Comment, type Post } from "@/lib/community";
import { useI18n } from "@/lib/i18n";

function ago(iso: string, lang: "ar" | "en"): string {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  const m = Math.round(s / 60);
  if (m < 1) return lang === "ar" ? "الحين" : "now";
  if (m < 60) return lang === "ar" ? `قبل ${m} دقيقة` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return lang === "ar" ? `قبل ${h} ساعة` : `${h} h ago`;
  const d = Math.round(h / 24);
  return lang === "ar" ? `قبل ${d} يوم` : `${d} d ago`;
}

export function PostCard({
  post,
  url,
  userId,
  isAdmin,
  expanded,
  onToggle,
  onChange,
  onGone,
  toast,
}: {
  post: Post;
  url?: string;
  userId: string;
  isAdmin: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (p: Post) => void;
  onGone: () => void;
  toast: (m: string) => void;
}) {
  const { t, lang } = useI18n();
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (expanded && comments == null) void fetchComments(post.id).then(setComments, () => setComments([]));
  }, [expanded, comments, post.id]);

  const like = async () => {
    const next = { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) };
    onChange(next);
    try {
      await setLike(userId, post.id, next.liked);
    } catch {
      onChange(post);
    }
  };
  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await addComment(userId, post.id, text);
      setText("");
      setComments(await fetchComments(post.id));
      onChange({ ...post, comments: post.comments + 1 });
    } catch (e) {
      toast((e as Error).message === "DAILY_LIMIT" ? t("وصلت حد التعليقات اليومي", "Daily comment limit reached") : t("تعذر إرسال التعليق", "Couldn't send the comment"));
    } finally {
      setBusy(false);
    }
  };
  const doReport = async (target: { post?: string; comment?: string }) => {
    const reason = prompt(t("سبب البلاغ (اختياري):", "Reason for the report (optional):")) ?? null;
    if (reason === null) return;
    try {
      await report(userId, target, reason);
      toast(t("وصل بلاغك، شكراً", "Report sent, thank you"));
    } catch {
      toast(t("تعذر إرسال البلاغ", "Couldn't send the report"));
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-full bg-ocean/20 text-sm font-bold text-ocean">{post.author.replace("صياد ", "").slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{post.author}</div>
          <div className="text-[11px] text-muted">
            {ago(post.created_at, lang)}
            {post.place_label ? ` · ${post.place_label}` : ""}
            {post.visibility === "private" && (
              <span className="ms-1.5 inline-flex items-center gap-0.5 text-warn">
                <Lock className="size-3" /> {t("أنا بس", "Only me")}
              </span>
            )}
          </div>
        </div>
        {post.mine ? (
          <button
            type="button"
            aria-label={t("حذف", "Delete")}
            className="grid size-9 place-items-center rounded-full text-bad"
            onClick={async () => {
              if (!confirm(t("حذف منشورك؟", "Delete your post?"))) return;
              try {
                await deletePost(post);
                onGone();
              } catch {
                toast(t("تعذر الحذف", "Couldn't delete"));
              }
            }}
          >
            <Trash2 className="size-4" />
          </button>
        ) : (
          <button type="button" aria-label={t("إبلاغ", "Report")} className="grid size-9 place-items-center rounded-full text-muted" onClick={() => doReport({ post: post.id })}>
            <Flag className="size-4" />
          </button>
        )}
        {isAdmin && !post.mine && (
          <button
            type="button"
            className="rounded-lg border border-warn/50 px-2 py-1 text-[11px] text-warn"
            onClick={async () => {
              if (!confirm(t("إخفاء هذا المنشور؟", "Hide this post?"))) return;
              try {
                await adminHide({ post: post.id }, true);
                onGone();
              } catch {
                toast(t("تعذر الإخفاء", "Couldn't hide"));
              }
            }}
          >
            {t("إخفاء", "Hide")}
          </button>
        )}
      </div>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={post.species_name ?? ""} loading="lazy" className="aspect-[4/3] w-full bg-surface-2 object-cover" />
      ) : (
        <div className="grid aspect-[4/3] w-full place-items-center bg-surface-2">
          <Spinner />
        </div>
      )}
      <div className="space-y-2 px-3.5 py-3">
        {(post.species_name || post.weight_kg != null) && (
          <div className="flex flex-wrap gap-1.5 text-xs">
            {post.species_name && <span className="rounded-full border border-ocean/40 bg-ocean/10 px-2.5 py-1 font-semibold text-white">🐟 {post.species_name}</span>}
            {post.weight_kg != null && (
              <span className="rounded-full border border-line px-2.5 py-1 text-white">
                <bdi>{post.weight_kg}</bdi> {t("كغ", "kg")}
              </span>
            )}
          </div>
        )}
        {post.body && <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.body}</p>}
        <div className="flex items-center gap-4 pt-1 text-sm">
          <button type="button" onClick={like} className={cn("flex items-center gap-1.5", post.liked ? "text-ocean" : "text-ink-2")}>
            <ThumbsUp className={cn("size-5", post.liked && "fill-ocean/30")} /> <span className="text-white">{post.likes}</span>
          </button>
          <button type="button" onClick={onToggle} className="flex items-center gap-1.5 text-ink-2">
            <MessageCircle className="size-5" /> <span className="text-white">{post.comments}</span>
          </button>
        </div>
        {expanded && (
          <div className="space-y-2 border-t border-line/40 pt-3">
            {comments == null ? (
              <Spinner />
            ) : (
              comments.map((c) => (
                <div key={c.id} className="rounded-xl bg-surface-2 px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                    <span className="font-semibold text-ink-2">{c.author}</span>
                    <span className="flex items-center gap-2">
                      {ago(c.created_at, lang)}
                      {c.mine ? (
                        <button
                          type="button"
                          aria-label="delete comment"
                          onClick={async () => {
                            try {
                              await deleteComment(c.id);
                              setComments((cur) => (cur ?? []).filter((x) => x.id !== c.id));
                              onChange({ ...post, comments: Math.max(0, post.comments - 1) });
                            } catch {
                              toast(t("تعذر الحذف", "Couldn't delete"));
                            }
                          }}
                        >
                          <Trash2 className="size-3.5 text-bad" />
                        </button>
                      ) : (
                        <button type="button" aria-label="report comment" onClick={() => doReport({ comment: c.id })}>
                          <Flag className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="mt-0.5 whitespace-pre-wrap">{c.body}</div>
                </div>
              ))
            )}
            <div className="flex items-center gap-2">
              <Input value={text} maxLength={300} placeholder={t("اكتب تعليق…", "Write a comment…")} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void send()} />
              <Button type="button" aria-label="send" loading={busy} onClick={send}>
                <Send className="size-5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
