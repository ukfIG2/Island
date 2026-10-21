import { afterEach, describe, expect, it, vi } from 'vitest';
import { BootstrapCore } from './runtime';
import { createInitialBootstrapState, type BootstrapState } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
import { SimulationClock } from '../runtime/SimulationClock';
import { consumePrototypeComebackEligibility, recordPrototypeInactivity, type InactivityStorage } from '../runtime/PrototypeInactivity';

function storage(): InactivityStorage {
  const entries = new Map<string, string>();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: key => { entries.delete(key); } };
}

describe('FR-063 inactivity does not degrade saved progression', () => {
  afterEach(() => vi.useRealTimers());
  for (const stage of ['prototype', 'mvp'] as const) {
    it(stage + ': preserves all earned state through an arbitrarily long offline return', () => {
      vi.useFakeTimers();
      const since = new Date('2026-01-01T00:00:00Z').getTime();
      vi.setSystemTime(since);
      const initial = createInitialBootstrapState('fr063-' + stage, undefined, stage);
      const saved: BootstrapState = {
        ...initial,
        coins: 345,
        energy: 4,
        reputation: stage === 'mvp' ? 21 : initial.reputation,
        materials: stage === 'mvp' ? 15 : initial.materials,
        gems: stage === 'mvp' ? 8 : initial.gems,
        resortValue: 275,
        currentWaveNumber: 4,
        simulationTick: 19,
        elapsedSimulationMs: 19000,
        purchasedAreas: { pool: true, bungalows: true },
        vipBuildings: { spa: stage === 'mvp' },
        premiumEntitlements: { resortCrest: stage === 'mvp' },
        hiredSpecialists: stage === 'mvp' ? ['photographer'] : [],
        normalWave: {
          ...initial.normalWave,
          buildingLevelsByNeed: { ...initial.normalWave.buildingLevelsByNeed, reception: 3, oceanView: 2 },
          hiredManagers: { ...initial.normalWave.hiredManagers, reception: true },
          workerAssignments: { ...initial.normalWave.workerAssignments, 'worker-2': 'relax', 'worker-3': 'oceanView' }
        }
      };
      const serialized = JSON.stringify(saved);
      const inactivity = storage();
      recordPrototypeInactivity(inactivity, since);
      vi.setSystemTime(since + 45 * 24 * 60 * 60 * 1000);
      const restored = normalizePersistedState(JSON.parse(serialized) as BootstrapState);
      expect(restored).toEqual(saved);
      const core = new BootstrapCore(restored);
      expect(core.getSnapshot()).toEqual(saved);
      expect(core.getSnapshot().elapsedSimulationMs).toBe(19000);
      expect(core.getSnapshot().simulationTick).toBe(19);
      expect(consumePrototypeComebackEligibility(inactivity, Date.now())).toBe(true);
      expect(core.getSnapshot()).toEqual(saved);
    });
  }
  it('stopped simulation never applies accumulated wall-clock time on resume', () => {
    vi.useFakeTimers();
    const core = new BootstrapCore(createInitialBootstrapState('fr063-clock'));
    core.dispatch({ type: 'START_WAVE' });
    const clock = new SimulationClock(core, 1000);
    clock.start();
    vi.advanceTimersByTime(1000);
    clock.stop();
    const paused = core.getSnapshot();
    vi.advanceTimersByTime(35 * 24 * 60 * 60 * 1000);
    expect(core.getSnapshot()).toBe(paused);
    clock.start();
    vi.advanceTimersByTime(1000);
    expect(core.getSnapshot().elapsedSimulationMs).toBe(paused.elapsedSimulationMs + 1000);
    expect(core.getSnapshot().simulationTick).toBe(paused.simulationTick + 1);
    clock.stop();
  });
});
