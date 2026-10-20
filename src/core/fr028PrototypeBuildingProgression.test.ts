import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, NORMAL_SERVICE_IDS, normalWaveServiceCapacity, normalWaveServiceSpeed, normalWaveUpgradeQuote } from './state';

function finished() {
  const initial = createInitialBootstrapState('fr028-prototype-progression');
  const started = applyBootstrapCommand(initial, { type: 'START_WAVE' });
  const completed = applyBootstrapCommand(started, { type: 'ADVANCE_SIMULATION', deltaMs: 600_000 });
  expect(completed.normalWave.phase).toBe('complete');
  expect(completed.normalWave.result).not.toBeNull();
  // Isolate all five existing normal buildings from area-purchase prerequisites.
  return { ...completed, coins: 10_000, normalWave: { ...completed.normalWave, activeNeedIds: NORMAL_SERVICE_IDS } };
}

describe('FR-028 Prototype building progression', () => {
  it('permits precisely two capacity upgrades to Level 3 for each of the five buildings', () => {
    for (const need of NORMAL_SERVICE_IDS) {
      const level1 = finished();
      expect(level1.normalWave.buildingLevelsByNeed[need]).toBe(1);
      const quote2 = normalWaveUpgradeQuote(level1, need);
      expect(quote2).not.toBeNull();
      expect(quote2!.toLevel).toBe(2);
      const level2 = applyBootstrapCommand(level1, { type: 'UPGRADE_BUILDING', need });
      expect(level2.normalWave.buildingLevelsByNeed[need]).toBe(2);
      expect(normalWaveServiceCapacity(level2, need)).toBeGreaterThan(normalWaveServiceCapacity(level1, need));
      const quote3 = normalWaveUpgradeQuote(level2, need);
      expect(quote3?.toLevel).toBe(3);
      const level3 = applyBootstrapCommand(level2, { type: 'UPGRADE_BUILDING', need });
      expect(level3.normalWave.buildingLevelsByNeed[need]).toBe(3);
      expect(normalWaveServiceCapacity(level3, need)).toBeGreaterThan(normalWaveServiceCapacity(level2, need));
      expect(normalWaveUpgradeQuote(level3, need)).toBeNull();
      expect(applyBootstrapCommand(level3, { type: 'UPGRADE_BUILDING', need })).toBe(level3);
    }
  });
  it('leaves allocated Worker slots, workers, service-speed and intrinsic tuning unchanged on both upgrades', () => {
    for (const need of NORMAL_SERVICE_IDS) {
      let state: ReturnType<typeof createInitialBootstrapState> = finished();
      for (const level of [2, 3]) {
        const prior = state;
        const priorSpeed = normalWaveServiceSpeed(prior, need);
        state = applyBootstrapCommand(state, { type: 'UPGRADE_BUILDING', need });
        expect(state.normalWave.buildingLevelsByNeed[need]).toBe(level);
        expect(state.normalWave.workerSlotsByNeed).toEqual(prior.normalWave.workerSlotsByNeed);
        expect(state.normalWave.workerAssignments).toEqual(prior.normalWave.workerAssignments);
        expect(state.normalWave.hiredManagers).toEqual(prior.normalWave.hiredManagers);
        expect(state.normalWave.tuning).toEqual(prior.normalWave.tuning);
        expect(state.normalWave.result).toEqual(prior.normalWave.result);
        expect(normalWaveServiceSpeed(state, need)).toBeCloseTo(priorSpeed);
      }
    }
  });
  it('changes no wave state except the upgraded building level, retaining committed Worker slots and assignments', () => {
    const before = finished();
    const need = 'reception' as const;
    const quote = normalWaveUpgradeQuote(before, need);
    expect(quote).not.toBeNull();
    const after = applyBootstrapCommand(before, { type: 'UPGRADE_BUILDING', need });
    expect(after.normalWave.buildingLevelsByNeed[need]).toBe(2);
    expect(after.normalWave.workerSlotsByNeed).toEqual(before.normalWave.workerSlotsByNeed);
    expect(after.normalWave.workerAssignments).toEqual(before.normalWave.workerAssignments);
    expect({ ...after.normalWave, buildingLevelsByNeed: before.normalWave.buildingLevelsByNeed }).toEqual(before.normalWave);
    expect(after.coins).toBe(before.coins - quote!.coinCost);
    expect(after.resortValue).toBe(before.resortValue + quote!.resortValueGain);
    // MVP paid recruitment may separately activate extra slots; FR-029 governs slot-capability progression.
  });
  it('does not upgrade during an active wave or before the first completed wave', () => {
    const initial = createInitialBootstrapState('fr028-upgrade-phases');
    expect(normalWaveUpgradeQuote(initial, 'reception')).toBeNull();
    expect(applyBootstrapCommand(initial, { type: 'UPGRADE_BUILDING', need: 'reception' })).toBe(initial);
    const running = applyBootstrapCommand(initial, { type: 'START_WAVE' });
    expect(applyBootstrapCommand(running, { type: 'UPGRADE_BUILDING', need: 'reception' })).toBe(running);
  });
});
