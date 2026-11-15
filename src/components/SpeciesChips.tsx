"use client";

// Fish picker used on the catch screen and as the filter on «صيدي»:
// the common fish as buttons, then «نوع ثاني» → search / pick / type a new name.

import { Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { COMMON_FISH, findSpeciesByName } from "@/lib/commonFish";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { matches, normalizeName } from "@/lib/normalize";
import { cn } from "./ui";

export function SpeciesChips({
  value,
  onChange,
  extra = [],
  allowAll,
  allowTyped,
}: {
  /** the chosen species name ("" = nothing / all) */
  value: string;
  onChange: (name: string) => void;
  /** more names to show as buttons (e.g. other fish the user has caught) */
  extra?: string[];
  /** show an «الكل» button that clears the choice (filters) */
  allowAll?: boolean;
  /** let the user add a name that is not in the list (catch screen) */
  allowTyped?: boolean;
}) {
  const { ds } = useStore();
  const { t, name } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const names: string[] = [...COMMON_FISH];
  const seen = new Set(names.map(normalizeName));
  for (const n of [...extra, value]) {
    const k = normalizeName(n);
    if (n && !seen.has(k)) {
      seen.add(k);
      names.push(n);
    }
  }

  const list = [...ds.species].sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar")).filter((s) => !q.trim() || matches(q, s.name_ar, s.name_en, ...(s.aliases ?? [])));
  const typed = q.trim();
  const canAddTyped = !!allowTyped && !!typed && !findSpeciesByName(ds.species, typed);

  const chip = (on: boolean) =>
    cn("h-10 rounded-full border px-4 text-sm font-bold transition-transform active:scale-95", on ? "border-ocean bg-ocean text-abyss" : "glass text-ink-2");

  const pick = (n: string) => {
    onChange(n);
    setOpen(false);
    setQ("");
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {allowAll && (
          <button type="button" onClick={() => pick("")} className={chip(!value)}>
            {t("الكل", "All")}
          </button>
        )}
        {names.map((n) => (
          <button key={n} type="button" onClick={() => pick(n)} className={chip(normalizeName(n) === normalizeName(value))}>
            {n}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn("flex h-10 items-center gap-1.5 rounded-full border border-dashed px-3.5 text-sm font-bold", open ? "border-ocean text-ocean" : "border-white/30 text-ink-2")}
        >
          <Plus className="size-3.5" /> {t("نوع ثاني", "Other")}
        </button>
      </div>

      {open && (
        <div className="glass mt-2.5 space-y-2.5 rounded-2xl p-3">
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-muted">{allowTyped ? t("اكتب اسم السمكة أو اختر", "Type the fish name or pick one") : t("اختر السمكة", "Pick a fish")}</span>
            <button type="button" aria-label={t("إغلاق", "Close")} onClick={() => setOpen(false)} className="grid size-8 place-items-center rounded-full bg-white/10">
              <X className="size-3.5" />
            </button>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute end-3 top-3.5 size-4 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
              aria-label={t("اسم السمكة", "Fish name")}
              placeholder={t("ابحث…", "Search…")}
              className="h-12 w-full rounded-[14px] border border-ocean/30 bg-abyss pe-10 ps-3.5 text-[15px] text-ink outline-none focus:border-ocean"
            />
          </div>
          <div className="flex max-h-44 flex-wrap gap-1.5 overflow-y-auto">
            {list.map((s) => (
              <button key={s.id} type="button" onClick={() => pick(s.name_ar)} className="h-9 rounded-full border border-white/15 bg-abyss/60 px-3.5 text-[13px] font-semibold text-ink-2">
                {name(s)}
              </button>
            ))}
            {!list.length && !canAddTyped && <span className="text-xs text-muted">{t("ما لقيت", "No match")}</span>}
          </div>
          {canAddTyped && (
            <button type="button" onClick={() => pick(typed)} className="h-11 w-full rounded-[14px] bg-ocean/15 text-sm font-bold text-ocean">
              {t(`أضف «${typed}»`, `Add “${typed}”`)}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
