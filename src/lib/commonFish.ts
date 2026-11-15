// The fish most often caught in Kuwait waters, shown as quick buttons on the
// catch screen and as filters on «صيدي». A species row is created the first
// time one of them is saved (resolveSpecies), so nothing needs seeding.

import { normalizeName, speciesKeys } from "./normalize";
import type { Species } from "./types";

export const COMMON_FISH = ["هامور", "شعم", "مزيزي", "سبيطي", "ينم"] as const;

/** The species row matching a typed/Arabic name (by name, English name or alias), if there is one. */
export function findSpeciesByName(species: Species[], name: string): Species | null {
  const key = normalizeName(name);
  if (!key) return null;
  return species.find((s) => speciesKeys(s).includes(key)) ?? null;
}
