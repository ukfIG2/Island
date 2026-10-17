import { describe, expect, it } from 'vitest';
import { consumePrototypeComebackEligibility, PROTOTYPE_INACTIVITY_PROOF_TUNING, recordPrototypeInactivity, type InactivityStorage } from './PrototypeInactivity';

function memoryStorage(): InactivityStorage {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } };
}

describe('Prototype inactivity lifecycle', () => {
  it('qualifies by a threshold but consumes only a boolean return fact, not elapsed reward magnitude', () => {
    const storage = memoryStorage();
    recordPrototypeInactivity(storage, 1000);
    expect(consumePrototypeComebackEligibility(storage, 1000 + PROTOTYPE_INACTIVITY_PROOF_TUNING.minimumInactiveMs - 1)).toBe(false);
    recordPrototypeInactivity(storage, 2000);
    expect(consumePrototypeComebackEligibility(storage, 2000 + PROTOTYPE_INACTIVITY_PROOF_TUNING.minimumInactiveMs)).toBe(true);
    expect(consumePrototypeComebackEligibility(storage, 2000 + PROTOTYPE_INACTIVITY_PROOF_TUNING.minimumInactiveMs * 100)).toBe(false);
  });

  it('keeps the earliest hidden timestamp until the return is consumed', () => {
    const storage = memoryStorage();
    recordPrototypeInactivity(storage, 1000);
    recordPrototypeInactivity(storage, 5000);
    expect(consumePrototypeComebackEligibility(storage, 1000 + PROTOTYPE_INACTIVITY_PROOF_TUNING.minimumInactiveMs)).toBe(true);
  });
});
