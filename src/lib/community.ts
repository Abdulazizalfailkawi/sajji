"use client";

// Community timeline client. Everything goes through the user's own Supabase
// session: rows are protected by RLS, reads by security-definer functions that
// never expose e-mails. Photos live in the private `community` bucket and are
// shown through short-lived signed URLs.

import { useEffect, useState } from "react";
import { useStore } from "./db/store";
import { processImage } from "./media";
import { supabase } from "./supabase";

export interface Post {
  id: string;
  user_id: string;
  author: string;
  body: string | null;
  species_name: string | null;
  weight_kg: number | null;
  place_label: string | null;
  photo_path: string;
  thumb_path: string | null;
  created_at: string;
  likes: number;
  comments: number;
  liked: boolean;
  mine: boolean;
  /** only returned for my own posts */
  visibility?: "public" | "private";
}

export interface Comment {
  id: string;
  user_id: string;
  author: string;
  body: string;
  created_at: string;
  mine: boolean;
}

const PAGE = 15;

function client() {
  const sb = supabase();
  if (!sb) throw new Error("NO_CLIENT");
  return sb;
}

function friendly(e: { message?: string; code?: string } | null): string {
  const m = e?.message ?? "";
  if (/daily_limit/.test(m)) return "DAILY_LIMIT";
  if (/not_signed_in|JWT/i.test(m)) return "SIGN_IN";
  return m || "ERROR";
}

export async function fetchFeed(before?: string): Promise<{ posts: Post[]; more: boolean }> {
  const { data, error } = await client().rpc("community_feed", { p_before: before ?? new Date(Date.now() + 60_000).toISOString(), p_limit: PAGE });
  if (error) throw new Error(friendly(error));
  const posts = ((data ?? []) as Post[]).map((p) => ({ ...p, likes: Number(p.likes), comments: Number(p.comments) }));
  return { posts, more: posts.length === PAGE };
}

/** Signed URLs for a set of storage paths (1 hour). */
const urlCache = new Map<string, { url: string; exp: number }>();
export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const need: string[] = [];
  for (const p of paths) {
    const hit = urlCache.get(p);
    if (hit && hit.exp > Date.now() + 60_000) out[p] = hit.url;
    else if (!need.includes(p)) need.push(p);
  }
  if (need.length) {
    const { data } = await client().storage.from("community").createSignedUrls(need, 3600);
    for (const row of data ?? []) {
      if (row.signedUrl && row.path) {
        urlCache.set(row.path, { url: row.signedUrl, exp: Date.now() + 3_500_000 });
        out[row.path] = row.signedUrl;
      }
    }
  }
  return out;
}

/** My own posts (public and private) for the profile grid. */
export async function fetchMyPosts(): Promise<Post[]> {
  const { data, error } = await client().rpc("community_my_posts", { p_limit: 200 });
  if (error) throw new Error(friendly(error));
  return ((data ?? []) as Post[]).map((p) => ({ ...p, likes: Number(p.likes), comments: Number(p.comments) }));
}

export interface NewPost {
  photo: Blob; // any image: it is resized and stripped of metadata (incl. GPS) before upload
  body: string;
  species: string;
  weight: number | null;
  place: string | null; // the label the user chose to show, or null
  catchId?: string | null;
  /** public = shown in المجتمع; private = only on my profile */
  visibility?: "public" | "private";
}

export async function createPost(userId: string, p: NewPost): Promise<void> {
  const sb = client();
  const img = await processImage(new File([p.photo], "photo.jpg", { type: p.photo.type || "image/jpeg" }));
  const id = crypto.randomUUID();
  const photo_path = `${userId}/${id}.jpg`;
  const thumb_path = `${userId}/${id}_t.jpg`;
  const up1 = await sb.storage.from("community").upload(photo_path, img.full, { contentType: "image/jpeg" });
  if (up1.error) throw new Error(up1.error.message);
  const up2 = await sb.storage.from("community").upload(thumb_path, img.thumb, { contentType: "image/jpeg" });
  const { error } = await sb.from("community_posts").insert({
    id,
    user_id: userId,
    body: p.body.trim() || null,
    species_name: p.species.trim() || null,
    weight_kg: p.weight,
    place_label: p.place?.trim() || null,
    photo_path,
    thumb_path: up2.error ? null : thumb_path,
    catch_id: p.catchId ?? null,
    visibility: p.visibility ?? "public",
  });
  if (error) {
    await sb.storage.from("community").remove([photo_path, thumb_path]);
    throw new Error(friendly(error));
  }
}

export async function deletePost(post: Post): Promise<void> {
  const sb = client();
  const { error } = await sb.from("community_posts").delete().eq("id", post.id);
  if (error) throw new Error(friendly(error));
  await sb.storage.from("community").remove([post.photo_path, ...(post.thumb_path ? [post.thumb_path] : [])]);
}

export async function setLike(userId: string, postId: string, like: boolean): Promise<void> {
  const sb = client();
  const { error } = like
    ? await sb.from("community_likes").insert({ post_id: postId, user_id: userId })
    : await sb.from("community_likes").delete().eq("post_id", postId).eq("user_id", userId);
  if (error && error.code !== "23505") throw new Error(friendly(error));
}

export async function fetchComments(postId: string): Promise<Comment[]> {
  const { data, error } = await client().rpc("community_comments", { p_post: postId });
  if (error) throw new Error(friendly(error));
  return (data ?? []) as Comment[];
}

export async function addComment(userId: string, postId: string, body: string): Promise<void> {
  const { error } = await client().from("community_comments").insert({ post_id: postId, user_id: userId, body: body.trim() });
  if (error) throw new Error(friendly(error));
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await client().from("community_comments").delete().eq("id", id);
  if (error) throw new Error(friendly(error));
}

export async function report(userId: string, target: { post?: string; comment?: string }, reason: string): Promise<void> {
  const { error } = await client().from("community_reports").insert({ user_id: userId, post_id: target.post ?? null, comment_id: target.comment ?? null, reason: reason.trim() || null });
  if (error && error.code !== "23505") throw new Error(friendly(error));
}

// ---- admin
export interface ReportRow {
  id: string;
  created_at: string;
  reason: string | null;
  post_id: string | null;
  comment_id: string | null;
  post_body: string | null;
  thumb_path: string | null;
  post_hidden: boolean | null;
  comment_body: string | null;
  comment_hidden: boolean | null;
}
export async function adminReports(): Promise<ReportRow[]> {
  const { data, error } = await client().rpc("admin_community_reports");
  if (error) throw new Error(friendly(error));
  return (data ?? []) as ReportRow[];
}
export async function adminHide(target: { post?: string | null; comment?: string | null }, hide: boolean): Promise<void> {
  const { error } = await client().rpc("community_admin_hide", { p_post: target.post ?? null, p_comment: target.comment ?? null, p_hide: hide });
  if (error) throw new Error(friendly(error));
}

// ---- activity badge (new comments / likes on my posts since I last looked)
const SEEN = "ft.communitySeen";
export function markCommunitySeen() {
  try {
    localStorage.setItem(SEEN, new Date().toISOString());
  } catch {}
  window.dispatchEvent(new Event("ft:community-seen"));
}

export function useCommunityActivity(): { comments: number; likes: number; total: number } {
  const { mode, user } = useStore();
  const [a, setA] = useState({ comments: 0, likes: 0 });
  const uid = mode === "cloud" ? user?.id ?? null : null;
  useEffect(() => {
    if (!uid) {
      setA({ comments: 0, likes: 0 });
      return;
    }
    let alive = true;
    const run = async () => {
      let since = new Date(Date.now() - 7 * 86_400_000).toISOString();
      try {
        const s = localStorage.getItem(SEEN);
        if (s) since = s;
        else localStorage.setItem(SEEN, new Date().toISOString());
      } catch {}
      const sb = supabase();
      if (!sb || !navigator.onLine) return;
      const { data } = await sb.rpc("community_activity", { p_since: since });
      if (alive && data) setA({ comments: Number((data as { comments: number }).comments) || 0, likes: Number((data as { likes: number }).likes) || 0 });
    };
    void run();
    const iv = setInterval(run, 5 * 60_000);
    const seen = () => setA({ comments: 0, likes: 0 });
    window.addEventListener("ft:community-seen", seen);
    return () => {
      alive = false;
      clearInterval(iv);
      window.removeEventListener("ft:community-seen", seen);
    };
  }, [uid]);
  return { ...a, total: a.comments + a.likes };
}
