export interface InactivityStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const PROTOTYPE_INACTIVITY_STORAGE_KEY = 'resort-empire.prototype.inactive-since';
// Deterministic proof tuning only; canonical authority requires a qualifying return but fixes no duration.
export const PROTOTYPE_INACTIVITY_PROOF_TUNING = { minimumInactiveMs: 60_000 } as const;

export function recordPrototypeInactivity(storage: InactivityStorage, nowMs: number): void {
  try {
    const existing = Number(storage.getItem(PROTOTYPE_INACTIVITY_STORAGE_KEY));
    if (Number.isFinite(existing) && existing > 0 && existing <= nowMs) return;
    storage.setItem(PROTOTYPE_INACTIVITY_STORAGE_KEY, String(nowMs));
  } catch {}
}

export function consumePrototypeComebackEligibility(storage: InactivityStorage, nowMs: number): boolean {
  try {
    const raw = storage.getItem(PROTOTYPE_INACTIVITY_STORAGE_KEY);
    storage.removeItem(PROTOTYPE_INACTIVITY_STORAGE_KEY);
    if (raw === null) return false;
    const inactiveSince = Number(raw);
    return Number.isFinite(inactiveSince) && inactiveSince >= 0 && nowMs >= inactiveSince && nowMs - inactiveSince >= PROTOTYPE_INACTIVITY_PROOF_TUNING.minimumInactiveMs;
  } catch {
    return false;
  }
}
