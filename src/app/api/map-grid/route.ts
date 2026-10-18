// GET /api/map-grid — current wind and wave height at a fixed set of sea points
// around Kuwait, for the map overlay. One Open-Meteo request per provider
// (multi-location), cached for 15 minutes.

import { clientIp, limited } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const maxDuration = 20;

const POINTS: [number, number][] = [
  [29.6, 48.2],
  [29.45, 48.0],
  [29.35, 48.3],
  [29.2, 48.35],
  [29.05, 48.5],
  [28.9, 48.55],
  [28.75, 48.6],
  [29.7, 48.5],
  [29.5, 48.55],
  [28.6, 48.7],
];

async function getJson(url: string) {
  const r = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(9000) });
  if (!r.ok) throw new Error(`HTTP_${r.status}`);
  return r.json();
}

const asArray = (j: unknown) => (Array.isArray(j) ? j : [j]) as Record<string, { [k: string]: number | null }>[];

export async function GET(req: Request) {
  if (limited(`grid:${clientIp(req)}`, 30, 60_000)) return Response.json({ error: "RATE_LIMITED" }, { status: 429 });
  const lats = POINTS.map((p) => p[0]).join(",");
  const lngs = POINTS.map((p) => p[1]).join(",");
  const [wx, sea] = await Promise.allSettled([
    getJson(`https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lngs}&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=GMT`),
    getJson(`https://marine-api.open-meteo.com/v1/marine?latitude=${lats}&longitude=${lngs}&current=wave_height,wave_direction&cell_selection=sea&timezone=GMT`),
  ]);
  const w = wx.status === "fulfilled" ? asArray(wx.value) : [];
  const s = sea.status === "fulfilled" ? asArray(sea.value) : [];
  const points = POINTS.map(([lat, lng], i) => ({
    lat,
    lng,
    wind: (w[i]?.current?.wind_speed_10m as number | null | undefined) ?? null,
    gust: (w[i]?.current?.wind_gusts_10m as number | null | undefined) ?? null,
    dir: (w[i]?.current?.wind_direction_10m as number | null | undefined) ?? null,
    wave: (s[i]?.current?.wave_height as number | null | undefined) ?? null,
  }));
  if (!points.some((p) => p.wind != null || p.wave != null)) return Response.json({ error: "UNAVAILABLE" }, { status: 502 });
  return Response.json({ fetched_at: new Date().toISOString(), points }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } });
}
