import { describe, expect, it } from 'vitest';
import { BootstrapCore } from './runtime';
import { createInitialBootstrapState, PROTOTYPE_ECONOMY_PROOF_TUNING } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
import { consumePrototypeComebackEligibility, PROTOTYPE_INACTIVITY_PROOF_TUNING, recordPrototypeInactivity, type InactivityStorage } from '../runtime/PrototypeInactivity';

function memoryStorage(): InactivityStorage {
  const entries = new Map<string, string>();
  return {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => { entries.set(key, value); },
    removeItem: key => { entries.delete(key); }
  };
}

function claimOnQualifyingReturn(core: BootstrapCore, storage: InactivityStorage, nowMs: number): boolean {
  if (!consumePrototypeComebackEligibility(storage, nowMs)) return false;
  core.dispatch({ type: 'CLAIM_COMEBACK_REWARD' });
  return true;
}

describe('FR-064 fixed comeback reward on a qualifying return', () => {
  const minimum = PROTOTYPE_INACTIVITY_PROOF_TUNING.minimumInactiveMs;
  const reward = PROTOTYPE_ECONOMY_PROOF_TUNING.comebackRewardCoins;

  for (const stage of ['prototype', 'mvp'] as const) {
    it(stage + ': equal fixed payout for minimum, extended and year-long inactivity', () => {
      const increases: number[] = [];
      for (const [index, duration] of [minimum, minimum * 60, 365 * 24 * 60 * 60 * 1000].entries()) {
        const initial = { ...createInitialBootstrapState('fr064-' + stage + '-' + index, undefined, stage), coins: 91, energy: 3 };
        const core = new BootstrapCore(initial);
        const storage = memoryStorage();
        const hiddenAt = 1_000_000;
        recordPrototypeInactivity(storage, hiddenAt);
        expect(claimOnQualifyingReturn(core, storage, hiddenAt + duration)).toBe(true);
        const after = core.getSnapshot();
        increases.push(after.coins - initial.coins);
        expect(after).toEqual({ ...initial, coins: initial.coins + reward });
        expect(claimOnQualifyingReturn(core, storage, hiddenAt + duration + minimum)).toBe(false);
        expect(core.getSnapshot()).toEqual(after);
        expect(normalizePersistedState(JSON.parse(JSON.stringify(after)))).toEqual(after);
      }
      expect(increases).toEqual([reward, reward, reward]);
    });
  }

  it('ineligible return gives no reward and cannot later claim the consumed absence', () => {
    const initial = createInitialBootstrapState('fr064-short');
    const core = new BootstrapCore(initial);
    const storage = memoryStorage();
    const hiddenAt = 1_000_000;
    recordPrototypeInactivity(storage, hiddenAt);
    expect(claimOnQualifyingReturn(core, storage, hiddenAt + minimum - 1)).toBe(false);
    expect(claimOnQualifyingReturn(core, storage, hiddenAt + minimum * 2)).toBe(false);
    expect(core.getSnapshot()).toEqual(initial);
  });

  it('independent qualifying absences each grant once but repeated visible events do not', () => {
    const initial = createInitialBootstrapState('fr064-episodes', undefined, 'mvp');
    const core = new BootstrapCore(initial);
    const storage = memoryStorage();
    const firstHidden = 1_000_000;
    recordPrototypeInactivity(storage, firstHidden);
    expect(claimOnQualifyingReturn(core, storage, firstHidden + minimum)).toBe(true);
    expect(claimOnQualifyingReturn(core, storage, firstHidden + minimum + 1)).toBe(false);
    expect(core.getSnapshot().coins).toBe(initial.coins + reward);
    const secondHidden = firstHidden + minimum + 100;
    recordPrototypeInactivity(storage, secondHidden);
    expect(claimOnQualifyingReturn(core, storage, secondHidden + minimum * 200)).toBe(true);
    expect(claimOnQualifyingReturn(core, storage, secondHidden + minimum * 201)).toBe(false);
    expect(core.getSnapshot()).toEqual({ ...initial, coins: initial.coins + 2 * reward });
  });
});
