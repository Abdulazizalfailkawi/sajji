"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { evaluateAchievements } from "@/lib/achievements";
import { StoreProvider, useStore } from "@/lib/db/store";
import { I18nProvider } from "@/lib/i18n";
import { backfillPressureCatch, backfillPressureTrip, catchesNeedingSnapshot, recordsNeedingPressure, snapshotCatch } from "@/lib/marine/snapshots";
import { tripRows } from "@/lib/stats";
import { BottomNav } from "./BottomNav";
import { QuickCatch } from "./QuickCatch";
import { ToastProvider } from "./Toast";
import { UpdatePrompt } from "./UpdatePrompt";
import { Welcome } from "./Welcome";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <StoreProvider>
        <ToastProvider>
          <Shell>{children}</Shell>
        </ToastProvider>
      </StoreProvider>
    </I18nProvider>
  );
}

const PUBLIC = ["/login"];

function Shell({ children }: { children: React.ReactNode }) {
  const { ready, mode } = useStore();
  const path = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC.includes(path);

  useEffect(() => {
    if (ready && !mode && !isPublic) router.replace("/login");
  }, [ready, mode, isPublic, router]);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then(async () => {
          // Refresh the offline copy of every page at most every 6 hours.
          const KEY = "ft.swWarm";
          let last = 0;
          try {
            last = Number(localStorage.getItem(KEY) ?? 0);
          } catch {}
          if (navigator.onLine && Date.now() - last > 6 * 3600_000) {
            const reg = await navigator.serviceWorker.ready;
            reg.active?.postMessage("warm");
            try {
              localStorage.setItem(KEY, String(Date.now()));
            } catch {}
          }
        })
        .catch(() => undefined);
    }
  }, []);

  if (!ready || (!mode && !isPublic)) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex flex-col items-center gap-3 text-muted">
          <img src="/icons/sajji-mark.svg" alt="" className="size-24" />
          <div className="text-sm">…</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <main className="mx-auto w-full max-w-3xl px-4 pb-[calc(var(--safe-bottom)+6.5rem)]">{children}</main>
      {mode && !isPublic && (
        <>
          <BottomNav />
          <QuickCatch />
          <UpdatePrompt />
          <Welcome />
          <AchievementRecorder />
          <SnapshotFiller />
        </>
      )}
    </>
  );
}

/**
 * Attaches environmental snapshots to catches that don't have one for their
 * current timestamp (e.g. saved offline, or time edited). A few per minute.
 */
function SnapshotFiller() {
  const store = useStore();
  const ref = useRef(store);
  ref.current = store;
  useEffect(() => {
    let busy = false;
    const run = async () => {
      if (busy || !navigator.onLine) return;
      busy = true;
      try {
        const todo = catchesNeedingSnapshot(ref.current.ds).slice(0, 3);
        for (const c of todo) await snapshotCatch(ref.current, c);
        // pressure for older records (a few per minute, newest first)
        const need = recordsNeedingPressure(ref.current.ds);
        for (const c of need.catches.slice(0, 2)) await backfillPressureCatch(ref.current, c);
        for (const x of need.trips.slice(0, 2)) await backfillPressureTrip(ref.current, x);
      } finally {
        busy = false;
      }
    };
    const first = setTimeout(run, 4000);
    const iv = setInterval(run, 60_000);
    window.addEventListener("online", run);
    return () => {
      clearTimeout(first);
      clearInterval(iv);
      window.removeEventListener("online", run);
    };
  }, []);
  return null;
}

/** Persists first-unlock dates of achievements derived from the records. */
function AchievementRecorder() {
  const { ds, idx, save } = useStore();
  const rows = useMemo(() => tripRows(ds, idx), [ds, idx]);
  const busy = useRef(false);
  useEffect(() => {
    if (busy.current) return;
    const known = new Set(ds.user_achievements.map((a) => a.achievement_code));
    const fresh = evaluateAchievements(ds, idx, rows).filter((s) => s.unlocked && s.unlockedAt && !known.has(s.def.code));
    if (!fresh.length) return;
    busy.current = true;
    const t = setTimeout(() => {
      void save(
        "user_achievements",
        fresh.map((s) => ({
          achievement_code: s.def.code,
          unlocked_at: s.unlockedAt!,
          context: null,
          created_at: new Date().toISOString(),
        })),
      ).finally(() => (busy.current = false));
    }, 1500);
    return () => {
      clearTimeout(t);
      busy.current = false;
    };
  }, [ds, idx, rows, save]);
  return null;
}
