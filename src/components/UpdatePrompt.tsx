"use client";

// Small bar above the tab bar: "a new version is available" + an update button.
// Checks when the app is opened/brought back to the foreground and every 15 minutes.

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { applyUpdate, checkForUpdate } from "@/lib/update";

export function UpdatePrompt() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      if (!navigator.onLine) return;
      if ((await checkForUpdate()) === "available" && alive) setShow(true);
    };
    const t0 = setTimeout(run, 4000);
    const iv = setInterval(run, 15 * 60_000);
    const vis = () => document.visibilityState === "visible" && void run();
    const manual = () => setShow(true);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("ft:update-available", manual);
    return () => {
      alive = false;
      clearTimeout(t0);
      clearInterval(iv);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("ft:update-available", manual);
    };
  }, []);

  if (!show) return null;
  return (
    <div role="alert" className="no-print fixed inset-x-0 bottom-[calc(var(--safe-bottom)+4.25rem)] z-[70] flex justify-center px-3">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl border border-ocean/50 bg-[#0a1220] py-2 pe-2 ps-4 shadow-2xl">
        <div className="min-w-0 flex-1 text-sm font-semibold">{t("يوجد تحديث جديد", "A new version is available")}</div>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void applyUpdate();
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-ocean px-3.5 py-2 text-sm font-bold text-black disabled:opacity-60"
        >
          <RefreshCw className={busy ? "size-4 animate-spin" : "size-4"} strokeWidth={2.4} /> {t("تحديث", "Update")}
        </button>
      </div>
    </div>
  );
}
