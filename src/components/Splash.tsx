"use client";

// Loading screen: calm night sea, a slowly breathing logo, two slow waves, a
// little boat and a rotating fishing tip. Tap anywhere to send a ripple (and
// the next tip). Slow, low-contrast motion only — nothing flashes — and
// prefers-reduced-motion switches the animation off (see globals.css).

import { useEffect, useRef, useState } from "react";

const TIPS = [
  "اللهم ارزقنا رزقاً حلالاً طيباً مباركاً",
  "توكّل على الله وابذل الأسباب، والرزق على الله",
  "راجع الرياح قبل لا تطلع — سلامتك أول",
];

interface Ripple {
  id: number;
  x: number;
  y: number;
}

export function Splash() {
  const [tip, setTip] = useState(0);
  const [ripples, setRipples] = useState<Ripple[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const iv = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 4200);
    return () => clearInterval(iv);
  }, []);

  function tap(e: React.PointerEvent<HTMLDivElement>) {
    const id = ++idRef.current;
    setRipples((r) => [...r.slice(-4), { id, x: e.clientX, y: e.clientY }]);
    setTip((n) => (n + 1) % TIPS.length);
    setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 1800);
  }

  return (
    <div
      onPointerDown={tap}
      role="status"
      aria-live="polite"
      aria-label="جاري التحميل"
      className="sj-fade relative grid min-h-dvh select-none place-items-center overflow-hidden"
    >
      {ripples.map((r) => (
        <span key={r.id} className="sj-ripple pointer-events-none fixed size-6 rounded-full border border-ocean/60" style={{ left: r.x - 12, top: r.y - 12 }} />
      ))}

      <div className="relative z-[1] flex flex-col items-center px-8 text-center">
        <div className="sj-breathe relative grid size-32 place-items-center">
          <span className="absolute inset-0 rounded-full bg-ocean/10 blur-2xl" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/sajji-mark.svg" alt="" className="relative size-24" />
        </div>
        <div className="mt-3 text-2xl font-bold tracking-wide text-white">سجي</div>

        <div className="mt-8 h-1 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="sj-load h-full w-1/3 rounded-full bg-gradient-to-l from-mint to-ocean" />
        </div>

        <div className="mt-6 w-[19rem] max-w-full rounded-[22px] border border-white/15 bg-[#0b1626]/85 px-4 py-4 shadow-[0_10px_30px_rgb(0_0_0/0.35)]">
          <p key={tip} className="sj-rise min-h-12 text-base font-semibold leading-relaxed text-white">
            {TIPS[tip]}
          </p>
          <div className="mx-auto my-3 h-px w-16 bg-white/20" />
          <div className="space-y-1 text-[15px] font-bold">
            <div className="text-[#7eecc2]">سجي - صعود الماء</div>
            <div className="text-[#ffd873]">ثبر - نزول الماء</div>
          </div>
        </div>
        <p className="mt-4 text-xs font-medium text-white [text-shadow:0_1px_8px_rgb(0_0_0/0.7)]">المس الشاشة لتحريك الموج</p>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 overflow-hidden" aria-hidden="true">
        <svg width="780" height="60" viewBox="0 0 780 60" className="sj-wave absolute bottom-0 left-0">
          <path d={wave(9, 130, 30)} fill="#8CC4FF" fillOpacity="0.16" />
        </svg>
        <div className="sj-sail absolute bottom-6 h-[34px] w-[54px]">
          <svg width="54" height="34" viewBox="0 0 54 34" className="sj-bob block">
            <path d="M14 6h22" stroke="#DCE7F5" strokeWidth="2" strokeLinecap="round" />
            <path d="M17 6v12M33 6v12" stroke="#DCE7F5" strokeWidth="1.6" />
            <rect x="21" y="11" width="9" height="8" rx="1.5" fill="#B7C7DE" />
            <rect x="8" y="12" width="5" height="7" rx="1.5" fill="#1B2A44" />
            <path d="M3 19h47c1.5 0 2 1.5 1 2.6L46 28H9L3.5 21C2.8 20.2 2.5 19 3 19z" fill="#F4F8FF" />
            <path d="M6 24h42" stroke="#8CC4FF" strokeWidth="1.6" />
          </svg>
        </div>
        <svg width="780" height="60" viewBox="0 0 780 60" className="sj-wave-rev absolute bottom-0 left-0">
          <path d={wave(6, 97.5, 38)} fill="#5FD3A8" fillOpacity="0.14" />
        </svg>
      </div>
    </div>
  );
}

function wave(amp: number, len: number, y0: number) {
  let d = `M0 ${y0}`;
  for (let x = 0; x < 780; x += len) d += ` q${len / 4} ${-amp} ${len / 2} 0 t${len / 2} 0`;
  return `${d} V60 H0 Z`;
}
