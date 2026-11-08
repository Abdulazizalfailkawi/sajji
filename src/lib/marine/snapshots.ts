"use client";

// Environmental snapshots: fetch the best available conditions for a trip
// or catch at ITS time and place and store them as new rows. Existing
// snapshots are never overwritten — a later snapshot is simply added, and
// readers pick the one whose valid time matches the record.

import type { useStore } from "../db/store";
import type { Catch, Dataset, EnvPurpose, EnvironmentObservation, Trip } from "../types";
import { getConditions, pressureRow, snapshotRows } from "./client";
import { catchEnv, hasSnapshotFor, tripEnv } from "./env";

type Store = ReturnType<typeof useStore>;

export function coordsForTrip(ds: Dataset, trip: Trip): { lat: number; lng: number } | null {
  if (trip.lat != null && trip.lng != null) return { lat: trip.lat, lng: trip.lng };
  const loc = trip.location_id ? ds.locations.find((l) => l.id === trip.location_id) : null;
  return loc?.lat != null && loc.lng != null ? { lat: loc.lat, lng: loc.lng } : null;
}

export function coordsForCatch(ds: Dataset, c: Catch): { lat: number; lng: number } | null {
  if (c.lat != null && c.lng != null) return { lat: c.lat, lng: c.lng };
  const loc = c.location_id ? ds.locations.find((l) => l.id === c.location_id) : null;
  if (loc?.lat != null && loc.lng != null) return { lat: loc.lat, lng: loc.lng };
  const trip = ds.trips.find((t) => t.id === c.trip_id);
  return trip ? coordsForTrip(ds, trip) : null;
}

export async function takeSnapshot(
  store: Pick<Store, "save">,
  args: { at: Date; tripId: string | null; catchId: string | null; purpose: EnvPurpose; coords: { lat: number; lng: number } | null },
): Promise<{ ok: boolean; error: string | null }> {
  const { at, coords } = args;
  let cond = null;
  let error: string | null = null;
  if (coords) {
    const r = await getConditions(coords.lat, coords.lng, new Date(at.getTime() - 13 * 3_600_000), new Date(at.getTime() + 13 * 3_600_000));
    cond = r.data;
    error = r.error;
    if (!cond && error === "OFFLINE") return { ok: false, error }; // try again later; store nothing
  } else error = "NO_COORDINATES";
  const ts = new Date().toISOString();
  const rows = snapshotRows(cond, at, {
    tripId: args.tripId,
    catchId: args.catchId,
    purpose: args.purpose,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    error,
  }).map((r) => ({ ...r, created_at: ts, updated_at: ts })) as EnvironmentObservation[];
  await store.save("environment_observations", rows);
  return { ok: !!cond, error };
}

const ATTEMPT_KEY = (c: Catch) => `ft.snap:${c.id}:${c.caught_at}`;

/** Catches that still need a snapshot for their current timestamp. */
export function catchesNeedingSnapshot(ds: Dataset): Catch[] {
  return ds.catches.filter((c) => {
    if (c.is_demo || hasSnapshotFor(ds, c)) return false;
    try {
      const last = Number(localStorage.getItem(ATTEMPT_KEY(c)) ?? 0);
      if (Date.now() - last < 6 * 3_600_000) return false;
    } catch {}
    return true;
  });
}

export async function snapshotCatch(store: Pick<Store, "save" | "ds">, c: Catch) {
  try {
    localStorage.setItem(ATTEMPT_KEY(c), String(Date.now()));
  } catch {}
  return takeSnapshot(store, {
    at: new Date(c.caught_at),
    tripId: c.trip_id,
    catchId: c.id,
    purpose: "catch",
    coords: coordsForCatch(store.ds, c),
  });
}

// ---- barometric pressure for records that were saved before pressure existed ----

const PR_KEY = (id: string, at: string) => `ft.press:${id}:${at}`;
const recentlyTried = (id: string, at: string) => {
  try {
    return Date.now() - Number(localStorage.getItem(PR_KEY(id, at)) ?? 0) < 6 * 3_600_000;
  } catch {
    return false;
  }
};

/** Catches/trips that have a snapshot but no pressure value yet (a few at a time). */
export function recordsNeedingPressure(ds: Dataset): { catches: Catch[]; trips: Trip[] } {
  const catches = ds.catches.filter((c) => !c.is_demo && hasSnapshotFor(ds, c) && catchEnv(ds, c).pressure == null && !recentlyTried(c.id, c.caught_at));
  const trips = ds.trips.filter((t) => !t.is_demo && t.status !== "cancelled" && coordsForTrip(ds, t) && tripEnv(ds, t).pressure == null && !recentlyTried(t.id, t.started_at));
  return { catches, trips };
}

async function addPressure(store: Pick<Store, "save">, args: { id: string; at: string; tripId: string | null; catchId: string | null; coords: { lat: number; lng: number } | null }) {
  try {
    localStorage.setItem(PR_KEY(args.id, args.at), String(Date.now()));
  } catch {}
  if (!args.coords) return;
  const t = new Date(args.at);
  const r = await getConditions(args.coords.lat, args.coords.lng, new Date(t.getTime() - 13 * 3_600_000), new Date(t.getTime() + 13 * 3_600_000));
  const row = pressureRow(r.data, t, { tripId: args.tripId, catchId: args.catchId, lat: args.coords.lat, lng: args.coords.lng });
  if (!row) return;
  const ts = new Date().toISOString();
  await store.save("environment_observations", [{ ...row, created_at: ts, updated_at: ts }] as unknown as EnvironmentObservation[]);
}

export async function backfillPressureCatch(store: Pick<Store, "save" | "ds">, c: Catch) {
  await addPressure(store, { id: c.id, at: c.caught_at, tripId: c.trip_id, catchId: c.id, coords: coordsForCatch(store.ds, c) });
}

export async function backfillPressureTrip(store: Pick<Store, "save" | "ds">, trip: Trip) {
  await addPressure(store, { id: trip.id, at: trip.started_at, tripId: trip.id, catchId: null, coords: coordsForTrip(store.ds, trip) });
}
