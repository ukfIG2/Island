import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveBuildingQualityBonus, normalWaveServiceCapacity, normalWaveServiceSpeed, normalWaveUpgradeQuote, NORMAL_SERVICE_IDS, type BootstrapState, type NormalWaveNeedId } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

function completed(stage: 'prototype' | 'mvp' = 'mvp', needIds: readonly NormalWaveNeedId[] = ['reception', 'food', 'drinks']): BootstrapState {
  const state = createInitialBootstrapState('fr029-mvp-proof', undefined, stage);
  return { ...state, coins: 500, normalWave: { ...state.normalWave, phase: 'complete', activeNeedIds: needIds, result: { rating: 5 } as BootstrapState['normalWave']['result'] } };
}
function buy(state: BootstrapState, need: NormalWaveNeedId): BootstrapState {
  expect(normalWaveUpgradeQuote(state, need)).not.toBeNull();
  const upgraded = applyBootstrapCommand(state, { type: 'UPGRADE_BUILDING', need });
  expect(upgraded).not.toBe(state);
  return upgraded;
}

describe('FR-029 five-level MVP building progression', () => {
  it.each([...NORMAL_SERVICE_IDS])('%s has Prototype levels 1–3, MVP levels 4–5, and exact distinct capability effects', need => {
    let state = completed('mvp', [need]);
    const startingSpeed = normalWaveServiceSpeed(state, need);
    const startingSlots = state.normalWave.workerSlotsByNeed[need];
    const initialCapacity = normalWaveServiceCapacity(state, need);
    state = buy(state, need);
    expect(state.normalWave.buildingLevelsByNeed[need]).toBe(2);
    state = buy(state, need);
    expect(state.normalWave.buildingLevelsByNeed[need]).toBe(3);
    expect(normalWaveServiceCapacity(state, need)).toBeGreaterThan(initialCapacity);
    expect(state.normalWave.workerSlotsByNeed[need]).toBe(startingSlots);
    expect(normalWaveBuildingQualityBonus(state, need)).toBe(0);
    const capacityAtThree = normalWaveServiceCapacity(state, need);
    const slotsAtThree = state.normalWave.workerSlotsByNeed[need];
    const offerFour = normalWaveUpgradeQuote(state, need)!;
    expect(offerFour.toLevel).toBe(4);
    expect(offerFour.afterCapacity).toBe(capacityAtThree);
    expect(offerFour.addedWorkerSlots).toBeGreaterThan(0);
    expect(offerFour.qualityBonusAfter).toBeGreaterThan(offerFour.qualityBonusBefore);
    state = buy(state, need);
    expect(state.normalWave.buildingLevelsByNeed[need]).toBe(4);
    expect(normalWaveServiceCapacity(state, need)).toBe(capacityAtThree);
    expect(state.normalWave.workerSlotsByNeed[need]).toBe(slotsAtThree + offerFour.addedWorkerSlots);
    const qualityAtFour = normalWaveBuildingQualityBonus(state, need);
    expect(qualityAtFour).toBeGreaterThan(0);
    const offerFive = normalWaveUpgradeQuote(state, need)!;
    expect(offerFive.toLevel).toBe(5);
    expect(offerFive.afterCapacity).toBeGreaterThan(offerFive.beforeCapacity);
    expect(offerFive.addedWorkerSlots).toBeGreaterThan(0);
    state = buy(state, need);
    expect(state.normalWave.buildingLevelsByNeed[need]).toBe(5);
    expect(normalWaveServiceCapacity(state, need)).toBeGreaterThan(capacityAtThree);
    expect(state.normalWave.workerSlotsByNeed[need]).toBe(slotsAtThree + offerFour.addedWorkerSlots + offerFive.addedWorkerSlots);
    expect(normalWaveBuildingQualityBonus(state, need)).toBeGreaterThan(qualityAtFour);
    expect(normalWaveServiceSpeed(state, need)).toBe(startingSpeed);
    expect(normalWaveUpgradeQuote(state, need)).toBeNull();
  });

  it('preserves the Prototype three-level ceiling and capacity-only upgrades', () => {
    let state = completed('prototype');
    const slots = state.normalWave.workerSlotsByNeed.reception;
    const speed = normalWaveServiceSpeed(state, 'reception');
    state = buy(buy(state, 'reception'), 'reception');
    expect(state.normalWave.buildingLevelsByNeed.reception).toBe(3);
    expect(state.normalWave.workerSlotsByNeed.reception).toBe(slots);
    expect(normalWaveBuildingQualityBonus(state, 'reception')).toBe(0);
    expect(normalWaveServiceSpeed(state, 'reception')).toBe(speed);
    expect(normalWaveUpgradeQuote(state, 'reception')).toBeNull();
  });

  it('carries Level 5, Worker slots and MVP stage into the next wave and persisted hydration', () => {
    let state = completed();
    for (let i = 0; i < 4; i++) state = buy(state, 'reception');
    const levelFiveSlots = state.normalWave.workerSlotsByNeed.reception;
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(state.currentWaveNumber).toBe(2);
    expect(state.normalWave.phase).toBe('awaiting');
    expect(state.progressionStage).toBe('mvp');
    expect(state.normalWave.buildingLevelsByNeed.reception).toBe(5);
    expect(state.normalWave.workerSlotsByNeed.reception).toBe(levelFiveSlots);
    const restored = normalizePersistedState(structuredClone(state));
    expect(restored.progressionStage).toBe('mvp');
    expect(restored.normalWave.buildingLevelsByNeed.reception).toBe(5);
    expect(restored.normalWave.workerSlotsByNeed.reception).toBe(levelFiveSlots);
    expect(normalWaveServiceCapacity(restored, 'reception')).toBe(normalWaveServiceCapacity(state, 'reception'));
  });
  it('Level 4 improves completed wave quality under identical capacity, staffing and demand', () => {
    const tuning = { totalDemand: 48, releasePerTick: 16, baseServiceCapacity: { reception: 12, food: 1, drinks: 12, relax: 1, oceanView: 1 }, queuePressurePerLostStar: 0.5, arrivalDurationMs: 1000, serviceDurationMs: 3000, useStudioDemandProfile: false } as const;
    const run = (level: 3 | 4, pressureThreshold = 0.5) => {
      const initial = createInitialBootstrapState('fr029-identical-load', { ...tuning, queuePressurePerLostStar: pressureThreshold }, 'mvp');
      let state: BootstrapState = { ...initial, normalWave: { ...initial.normalWave, buildingLevelsByNeed: { ...initial.normalWave.buildingLevelsByNeed, food: level } } };
      const capacity = normalWaveServiceCapacity(state, 'food');
      const speed = normalWaveServiceSpeed(state, 'food');
      state = applyBootstrapCommand(state, { type: 'START_WAVE' });
      for (let step = 0; step < 256 && state.normalWave.phase !== 'complete'; step++) state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
      expect(state.normalWave.phase).toBe('complete');
      expect(state.normalWave.result).not.toBeNull();
      return { capacity, speed, state, rating: state.normalWave.result!.rating, pressure: state.normalWave.result!.totalQueuePressure, released: state.normalWave.activeNeedIds.reduce((sum, need) => sum + state.normalWave.releasedByNeed[need], 0) };
    };
    const baseline = run(3);
    const averageWait = baseline.pressure / Math.max(1, baseline.released);
    expect(averageWait).toBeGreaterThan(0);
    const nonsaturatingThreshold = averageWait / 3;
    const three = run(3, nonsaturatingThreshold), four = run(4, nonsaturatingThreshold);
    expect(three.rating).toBeGreaterThan(1);
    expect(three.rating).toBeLessThan(5);
    expect(four.capacity).toBe(three.capacity);
    expect(four.speed).toBe(three.speed);
    expect(four.pressure).toBe(three.pressure);
    expect(three.pressure).toBeGreaterThan(0);
    expect(four.rating).toBeGreaterThan(three.rating);
    expect(four.state.normalWave.result!.satisfaction.totalWaitingTime).toBe(three.state.normalWave.result!.satisfaction.totalWaitingTime);
  });
});
