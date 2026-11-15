"use client";

// Building blocks of the sea screen, design v3 (docs/design/sajji-v3):
// hero card with moving waves and a bobbing boat, the 7-day strip with
// haml / fasad, and the wind / pressure / cycle tiles.

import { Camera } from "lucide-react";
import type { Cycle } from "@/lib/tidecycle";
import { cn } from "./ui";

/** Waves path repeating every `len` px across 780 px (seamless when shifted by 50%). */
function wave(amp: number, len: number, y0: number) {
  let d = `M0 ${y0}`;
  for (let x = 0; x < 780; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`;
  return `${d} V60 H0 Z`;
}
const WAVE1 = wave(9, 130, 30);
const WAVE2 = wave(6, 97.5, 38);

export function cycleTone(c: Cycle) {
  return c === "hamal" ? "bg-mint/15 text-mint" : c === "fasad" ? "bg-warn/15 text-warn" : "bg-ocean/15 text-ocean";
}
const cycleText = (c: Cycle) => (c === "hamal" ? "text-mint" : c === "fasad" ? "text-warn" : "text-ocean");

/** Moon drawn from the phase fraction (0 new → 0.5 full → 1 new). */
export function MoonIcon({ fraction, size = 18, lit = "#EEF4FF", dim = "rgb(255 255 255 / 0.14)" }: { fraction: number; size?: number; lit?: string; dim?: string }) {
  const ph = 2 * Math.PI * fraction;
  const rx = Math.abs(7 * Math.cos(ph)).toFixed(2);
  const waxing = fraction < 0.5;
  const gib = Math.cos(ph) < 0;
  const d = waxing ? `M10 3A7 7 0 0 1 10 17A${rx} 7 0 0 ${gib ? 1 : 0} 10 3Z` : `M10 3A7 7 0 0 0 10 17A${rx} 7 0 0 ${gib ? 0 : 1} 10 3Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill={dim} />
      <path d={d} fill={lit} />
    </svg>
  );
}

export function SeaHero(p: {
  kicker: string;
  title: string;
  titleTone: string;
  cycle: Cycle;
  cycleLabel: string;
  waqfaLabel: string;
  waqfaTime: string;
  waqfaSub: string;
}) {
  return (
    <section className="glass relative mb-4 overflow-hidden rounded-[26px] px-[18px] pb-[52px] pt-[18px] shadow-[0_14px_30px_rgb(0_0_0/0.28)]">
      <div className="relative z-[1] flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="sj-pulse size-2 rounded-full bg-mint" />
            <span className="truncate text-[13px] font-semibold text-muted">{p.kicker}</span>
          </div>
          <div className={cn("mt-0.5 text-4xl font-bold leading-tight", p.titleTone)}>{p.title}</div>
          <span className={cn("mt-1 inline-block rounded-[10px] px-2.5 py-0.5 text-[13px] font-bold", cycleTone(p.cycle))}>{p.cycleLabel}</span>
        </div>
        <div className="w-px self-stretch bg-white/15" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-muted">{p.waqfaLabel}</div>
          <div className="whitespace-nowrap text-3xl font-bold leading-tight text-white">{p.waqfaTime}</div>
          {p.waqfaSub && <div className="mt-1 inline-block rounded-[10px] bg-ocean/15 px-2.5 py-0.5 text-[13px] font-bold text-ocean">{p.waqfaSub}</div>}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 overflow-hidden" aria-hidden="true">
        <svg width="780" height="60" viewBox="0 0 780 60" className="sj-wave absolute -bottom-2 left-0">
          <path d={WAVE1} fill="#8CC4FF" fillOpacity="0.22" />
        </svg>
        <div className="sj-sail absolute bottom-3.5 h-[34px] w-[54px]">
          <svg width="54" height="34" viewBox="0 0 54 34" className="sj-bob block">
            <path d="M14 6h22" stroke="#DCE7F5" strokeWidth="2" strokeLinecap="round" />
            <path d="M17 6v12M33 6v12" stroke="#DCE7F5" strokeWidth="1.6" />
            <path d="M38 4l7-4M40 6l8-3" stroke="#DCE7F5" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
            <rect x="21" y="11" width="9" height="8" rx="1.5" fill="#B7C7DE" />
            <rect x="8" y="12" width="5" height="7" rx="1.5" fill="#1B2A44" />
            <path d="M3 19h47c1.5 0 2 1.5 1 2.6L46 28H9L3.5 21C2.8 20.2 2.5 19 3 19z" fill="#F4F8FF" />
            <path d="M6 24h42" stroke="#8CC4FF" strokeWidth="1.6" />
          </svg>
        </div>
        <svg width="780" height="60" viewBox="0 0 780 60" className="sj-wave-rev absolute -bottom-2 left-0">
          <path d={WAVE2} fill="#5FD3A8" fillOpacity="0.2" />
        </svg>
      </div>
    </section>
  );
}

export interface StripDay {
  off: number;
  name: string;
  num: string;
  cycle: Cycle;
  cycleLabel: string;
  moon: number;
}

export function DayStrip({ days, value, onChange, legend }: { days: StripDay[]; value: number; onChange: (off: number) => void; legend: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-[15px] font-bold [text-shadow:0_1px_10px_rgb(0_0_0/0.45)]">{legend}</div>
        <div className="text-xs [text-shadow:0_1px_10px_rgb(0_0_0/0.45)]">
          <span className="text-mint">● حمل</span> · <span className="text-warn">● فساد</span> · <span className="text-ocean">● بين</span>
        </div>
      </div>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 pt-0.5">
        {days.map((d) => {
          const on = d.off === value;
          return (
            <button
              key={d.off}
              type="button"
              onClick={() => onChange(d.off)}
              aria-pressed={on}
              className={cn(
                "flex w-[74px] shrink-0 flex-col items-center gap-0.5 rounded-[20px] border px-1 pb-2 pt-2.5 transition-transform active:scale-95",
                on ? "border-ocean bg-ocean text-abyss" : "glass text-ink-2",
              )}
            >
              <span className="text-[11px] font-semibold">{d.name}</span>
              <span className="text-[21px] font-bold leading-tight">{d.num}</span>
              <MoonIcon fraction={d.moon} lit={on ? "#0B1626" : "#EEF4FF"} dim={on ? "rgb(11 22 38 / 0.18)" : "rgb(255 255 255 / 0.14)"} />
              <span className={cn("text-center text-[10px] font-bold leading-tight", on ? "text-abyss" : cycleText(d.cycle))}>{d.cycleLabel}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function StatTiles(p: {
  wind: string;
  windSub: string;
  windDir: number | null;
  pressure: string;
  pressureSub: string;
  pressureFrac: number | null;
  cycle: Cycle;
  cycleLabel: string;
  cycleSub: string;
  moon: number;
  labels: { wind: string; pressure: string };
}) {
  const tile = "glass flex min-w-0 flex-col items-center gap-1 rounded-[22px] px-2 py-3.5 text-center";
  return (
    <section className="mb-4 grid grid-cols-3 gap-2">
      <div className={tile}>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="10.5" stroke="#2A4468" />
          {p.windDir != null && (
            <g transform={`rotate(${(p.windDir + 180) % 360} 12 12)`}>
              <path d="M12 5v14M12 5l-4 4M12 5l4 4" stroke="#8CC4FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          )}
        </svg>
        <div className="text-[11px] text-muted">{p.labels.wind}</div>
        <div className="text-lg font-bold leading-tight text-white">{p.wind}</div>
        <div className="text-[11px] text-muted">{p.windSub}</div>
      </div>
      <div className={tile}>
        <svg width="40" height="34" viewBox="0 0 36 24" fill="none" aria-hidden="true">
          <path d="M4 20A14 14 0 0 1 32 20" stroke="#2A4468" strokeWidth="4" strokeLinecap="round" />
          {p.pressureFrac != null && <path d="M4 20A14 14 0 0 1 32 20" stroke="#5FD3A8" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(p.pressureFrac * 44).toFixed(1)} 100`} />}
        </svg>
        <div className="text-[11px] text-muted">{p.labels.pressure}</div>
        <div className="text-lg font-bold leading-tight text-white">{p.pressure}</div>
        <div className="text-[11px] text-muted">{p.pressureSub}</div>
      </div>
      <div className={tile}>
        <MoonIcon fraction={p.moon} size={34} dim="#2A4468" />
        <div className={cn("text-sm font-bold leading-tight", cycleText(p.cycle))}>{p.cycleLabel}</div>
        <div className="text-[11px] text-muted">{p.cycleSub}</div>
      </div>
    </section>
  );
}

export function CaptureCTA({ onClick, title, sub }: { onClick: () => void; title: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-2 flex w-full items-center gap-3.5 rounded-[26px] bg-gradient-to-l from-mint to-ocean p-[18px] text-start text-abyss shadow-[0_14px_30px_rgb(95_211_168/0.25)] transition-transform active:scale-[0.98]"
    >
      <span className="grid size-14 shrink-0 place-items-center rounded-[18px] bg-abyss">
        <Camera className="size-7 text-ocean" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[19px] font-bold">{title}</span>
        <span className="block text-[13px] font-medium">{sub}</span>
      </span>
    </button>
  );
}
