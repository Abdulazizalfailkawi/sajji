"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Kept for old links/bookmarks; the app now has three sections. */
export default function Redirect() {
  const router = useRouter();
  useEffect(() => router.replace("/catches"), [router]);
  return null;
}
