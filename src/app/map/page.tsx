"use client";

// الخريطة — browse the map: saved spots, your catches/trips, live wind & waves
// around Kuwait. Tap anywhere (or a marker) to see what the sea is like there.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, LayerGroup } from "leaflet";
import { useStore } from "@/lib/db/store";
import { useI18n } from "@/lib/i18n";
import { Card, Spinner, cn } from "@/components/ui";
import { getConditions } from "@/lib/marine/client";
import { PRESET_SPOTS } from "@/lib/marine/presets";
import { fmtWind, compass, readWindUnit, type WindUnit } from "@/lib/marine/units";
import { turnsOf } from "@/lib/marine/client";
import { tideNow } from "@/lib/marine/waqfa";
import { verdictFor, type Verdict } from "@/lib/verdict";
import { waveLight, windLight, type Light } from "@/config/marine";
import { fmtTime } from "@/lib/time";

interface GridPt {
  lat: number;
  lng: number;
  wind: number | null;
  gust: number | null;
  dir: number | null;
  wave: number | null;
}
interface Picked {
  lat: number;
  lng: number;
  name: string | null;
  spotId?: string;
}
const COLOR: Record<Light, string> = { green: "#22c55e", yellow: "#fbbf24", red: "#ef4444" };
const H = 3_600_000;

export default function MapPage() {
  const { ds } = useStore();
  const { t, lang } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layers = useRef<Record<string, LayerGroup>>({});
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState({ spots: true, catches: true, sea: true });
  const [grid, setGrid] = useState<GridPt[] | null>(null);
  const [gridErr, setGridErr] = useState(false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [info, setInfo] = useState<{ v: Verdict | null; tide: string | null; err: boolean } | null>(null);
  const [unit, setUnit] = useState<WindUnit>("kmh");
  useEffect(() => setUnit(readWindUnit()), []);

  const spots = useMemo(() => {
    const own = ds.locations.filter((l) => l.lat != null && l.lng != null).map((l) => ({ id: l.id, name: l.name, lat: l.lat as number, lng: l.lng as number }));
    const has = (n: string) => own.some((o) => o.name === n);
    return [...own, ...PRESET_SPOTS.filter((p) => !has(p.name)).map((p) => ({ id: "", name: p.name, lat: p.lat, lng: p.lng }))];
  }, [ds.locations]);
  const catches = useMemo(() => ds.catches.filter((c) => c.lat != null && c.lng != null).map((c) => ({ lat: c.lat as number, lng: c.lng as number, at: c.caught_at })), [ds.catches]);

  // --- map
  useEffect(() => {
    let dead = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (dead || !el.current || map.current) return;
      const m = L.map(el.current, { zoomControl: true }).setView([29.25, 48.2], 9);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(m);
      for (const k of ["spots", "catches", "sea", "pin"]) layers.current[k] = L.layerGroup().addTo(m);
      m.on("click", (e) => setPicked({ lat: Math.round(e.latlng.lat * 1e4) / 1e4, lng: Math.round(e.latlng.lng * 1e4) / 1e4, name: null }));
      map.current = m;
      setTimeout(() => m.invalidateSize(), 80);
      setReady(true);
    })();
    return () => {
      dead = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // --- wind & wave grid
  useEffect(() => {
    let dead = false;
    fetch("/api/map-grid")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => !dead && setGrid(j.points))
      .catch(() => !dead && setGridErr(true));
    return () => {
      dead = true;
    };
  }, []);

  // --- draw layers
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const g = layers.current;
      g.spots.clearLayers();
      g.catches.clearLayers();
      g.sea.clearLayers();
      if (show.spots)
        for (const s of spots) {
          const mk = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "", html: '<div style="font-size:26px;line-height:26px;filter:drop-shadow(0 1px 2px #000)">📍</div>', iconSize: [26, 26], iconAnchor: [13, 24] }) });
          mk.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            setPicked({ lat: s.lat, lng: s.lng, name: s.name, spotId: s.id || undefined });
          });
          mk.bindTooltip(s.name, { direction: "top", offset: [0, -22] });
          mk.addTo(g.spots);
        }
      if (show.catches)
        for (const c of catches) L.circleMarker([c.lat, c.lng], { radius: 5, color: "#fff", weight: 1, fillColor: "#7fb6f0", fillOpacity: 0.9 }).bindTooltip("🐟 " + new Date(c.at).toLocaleDateString(lang === "ar" ? "ar-KW-u-nu-latn" : "en-GB")).addTo(g.catches);
      if (show.sea && grid)
        for (const p of grid) {
          const light = (windLight(p.wind, p.gust) && waveLight(p.wave) ? [windLight(p.wind, p.gust), waveLight(p.wave)] : [windLight(p.wind, p.gust) ?? waveLight(p.wave)]).filter(Boolean) as Light[];
          const worst: Light = light.includes("red") ? "red" : light.includes("yellow") ? "yellow" : "green";
          const rot = p.dir != null ? (p.dir + 180) % 360 : 0; // arrow points where the wind blows to
          const html = `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;transform:translate(-50%,-50%)"><div style="width:30px;height:30px;border-radius:50%;background:${COLOR[worst]};opacity:.92;display:grid;place-items:center;border:2px solid #0b1b33"><div style="transform:rotate(${rot}deg);color:#0b1b33;font-weight:900;font-size:18px;line-height:18px">${p.dir != null ? "↑" : "•"}</div></div><div style="background:#0b1b33cc;color:#fff;border-radius:6px;padding:0 4px;font-size:10px;white-space:nowrap">${p.wind != null ? Math.round(p.wind) : "—"} · ${p.wave != null ? p.wave.toFixed(1) + "م" : "—"}</div></div>`;
          const mk = L.marker([p.lat, p.lng], { icon: L.divIcon({ className: "", html, iconSize: [0, 0] }) });
          mk.on("click", (e) => {
            L.DomEvent.stopPropagation(e);
            setPicked({ lat: p.lat, lng: p.lng, name: null });
          });
          mk.addTo(g.sea);
        }
    })();
  }, [ready, show, spots, catches, grid, lang]);

  // --- pin on the picked point
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import("leaflet")).default;
      layers.current.pin.clearLayers();
      if (picked) L.circleMarker([picked.lat, picked.lng], { radius: 10, color: "#7fb6f0", weight: 3, fillOpacity: 0.25 }).addTo(layers.current.pin);
    })();
  }, [ready, picked]);

  // --- what is the sea like at the picked point
  useEffect(() => {
    if (!picked) return;
    let dead = false;
    setInfo(null);
    const now = Date.now();
    getConditions(picked.lat, picked.lng, new Date(now - 6 * H), new Date(now + 36 * H)).then((r) => {
      if (dead) return;
      if (!r.data) return setInfo({ v: null, tide: null, err: true });
      const v = verdictFor(r.data, now, now + 10 * H);
      const tn = tideNow(turnsOf(r.data).turns, now);
      const tide = !tn
        ? null
        : tn.kind === "at_high"
          ? t("الحين مد عالي", "High tide now")
          : tn.kind === "at_low"
            ? t("الحين جزر", "Low tide now")
            : `${tn.kind === "rising" ? t("صعود الماء", "Water rising") : t("نزول الماء", "Water falling")} · ${tn.next!.type === "high" ? t("المد", "high") : t("الجزر", "low")} ${fmtTime(tn.next!.t, lang)}`;
      setInfo({ v, tide, err: false });
    });
    return () => {
      dead = true;
    };
  }, [picked, t, lang]);

  const chip = (k: keyof typeof show, label: string) => (
    <button type="button" onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))} aria-pressed={show[k]} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", show[k] ? "border-ocean bg-ocean/20 text-white" : "border-line bg-surface-2 text-ink-2")}>
      {label}
    </button>
  );
  const verdictText = (l: Light) => (l === "green" ? t("✅ البحر زين للطلعة", "✅ Good to go out") : l === "yellow" ? t("⚠️ انتبه، الجو متوسط", "⚠️ Careful, moderate") : t("⛔ لا تطلع", "⛔ Don't go out"));

  return (
    <div className="space-y-3 pb-4 pt-[calc(var(--safe-top)+0.75rem)]">
      <h1 className="text-xl font-bold">{t("الخريطة", "Map")}</h1>
      <div className="flex flex-wrap gap-2">
        {chip("spots", t("📍 المواقع", "📍 Spots"))}
        {chip("catches", t("🐟 صيدي", "🐟 My catches"))}
        {chip("sea", t("🌬️ الريح والموج", "🌬️ Wind & waves"))}
      </div>
      <div className="relative">
        <div ref={el} dir="ltr" className="isolate z-0 h-[62vh] min-h-[360px] w-full overflow-hidden rounded-2xl border border-line" />
        {!ready && (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner />
          </div>
        )}
      </div>
      {show.sea && (
        <p className="text-[11px] text-muted">
          {gridErr
            ? t("تعذر تحميل الريح والموج حالياً.", "Couldn't load wind and waves right now.")
            : t(`الدوائر: لون السلامة (أسوأ قيمة بين الريح والموج). السهم اتجاه هبوب الريح. الرقم: الريح (${unit === "kmh" ? "كم/س" : unit === "kn" ? "عقدة" : "م/ث"}) · الموج بالمتر.`, "Circles: safety colour (worse of wind and waves). Arrow: direction the wind blows towards. Numbers: wind · wave height (m).")}
        </p>
      )}

      {picked && (
        <Card className="space-y-2 p-3.5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-bold">{picked.name ?? t("نقطة على الخريطة", "Point on the map")}</div>
              <div className="ltr text-[11px] text-muted">
                {picked.lat.toFixed(4)}, {picked.lng.toFixed(4)}
              </div>
            </div>
            <button type="button" className="text-xs text-muted" onClick={() => setPicked(null)} aria-label={t("إغلاق", "Close")}>
              ✕
            </button>
          </div>
          {!info ? (
            <div className="flex items-center gap-2 text-sm text-ink-2">
              <Spinner /> {t("أجيب حالة البحر…", "Loading sea conditions…")}
            </div>
          ) : info.err || !info.v ? (
            <div className="text-sm text-warn">{t("ما قدرت أجيب حالة البحر لهالنقطة (ممكن في البر أو ما فيه إنترنت).", "No sea data for this point (maybe on land or offline).")}</div>
          ) : (
            <>
              <div className="text-base font-bold">{verdictText(info.v.light)}</div>
              <div className="text-sm text-ink-2">
                {info.v.maxWindKmh != null && `${t("ريح", "Wind")} ${fmtWind(info.v.maxWindKmh, unit, lang)}${info.v.windDir != null ? " " + compass(info.v.windDir, lang) : ""}`}
                {info.v.maxWaveM != null && ` · ${t("موج", "Waves")} ${info.v.maxWaveM.toFixed(1)} ${t("م", "m")}`}
              </div>
              {info.tide && <div className="text-sm">🌊 {info.tide}</div>}
            </>
          )}
          {picked.spotId && (
            <Link
              href="/"
              onClick={() => {
                try {
                  localStorage.setItem("ft.marineSpot", picked.spotId as string);
                } catch {}
              }}
              className="inline-flex min-h-10 items-center rounded-xl bg-ocean/20 px-3 text-sm font-semibold text-white"
            >
              {t("افتح حالة البحر لهالموقع", "Open sea conditions for this spot")}
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}
