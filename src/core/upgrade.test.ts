import { describe, expect, it } from 'vitest';
import {
  NORMAL_WAVE_PROOF_WORKER_ID,
  PROTOTYPE_UPGRADE_PROOF_TUNING,
  applyBootstrapCommand,
  createInitialBootstrapState,
  normalWaveServiceCapacity,
  normalWaveUpgradeQuote,
  type BootstrapState
} from './state';

function capacityInitial(bootId: string): BootstrapState {
  return createInitialBootstrapState(bootId, {
    totalDemand: 6,
    releasePerTick: 3,
    baseServiceCapacity: { reception: 10, food: 1, drinks: 10 },
    queuePressurePerLostStar: 4
  });
}

function completeWave(initial: BootstrapState): BootstrapState {
  let state = applyBootstrapCommand(initial, {
    type: 'REASSIGN_WORKER',
    workerId: NORMAL_WAVE_PROOF_WORKER_ID,
    to: 'food'
  });
  state = applyBootstrapCommand(state, { type: 'START_WAVE' });
  for (let i = 0; i < 32 && state.normalWave.phase !== 'complete'; i += 1) {
    state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  }
  expect(state.normalWave.phase).toBe('complete');
  return state;
}

describe('Prototype post-wave upgrade', () => {
  it('is unavailable before completion and applies only capacity/economy progression after the wave', () => {
    const initial = capacityInitial('upgrade-proof');
    const rejected = applyBootstrapCommand(initial, { type: 'UPGRADE_BUILDING', need: 'food' });
    expect(rejected).toEqual(initial);

    const active = applyBootstrapCommand(initial, { type: 'START_WAVE' });
    const rejectedActive = applyBootstrapCommand(active, { type: 'UPGRADE_BUILDING', need: 'food' });
    expect(rejectedActive).toEqual(active);

    const completed = completeWave(initial);
    const need = completed.normalWave.result!.bottleneckNeed;
    const quote = normalWaveUpgradeQuote(completed, need);
    expect(quote).not.toBeNull();
    expect(quote!.fromLevel).toBe(1);
    expect(quote!.toLevel).toBe(2);
    expect(quote!.afterCapacity).toBeGreaterThan(quote!.beforeCapacity);

    const slotsBefore = completed.normalWave.workerSlotsByNeed;
    const assignmentBefore = completed.normalWave.workerAssignments[NORMAL_WAVE_PROOF_WORKER_ID];
    const upgraded = applyBootstrapCommand(completed, { type: 'UPGRADE_BUILDING', need });
    expect(upgraded.normalWave.buildingLevelsByNeed[need]).toBe(2);
    expect(upgraded.coins).toBe(completed.coins - quote!.coinCost);
    expect(upgraded.resortValue).toBe(completed.resortValue + quote!.resortValueGain);
    expect(normalWaveServiceCapacity(upgraded, need)).toBe(quote!.afterCapacity);
    expect(upgraded.normalWave.workerSlotsByNeed).toEqual(slotsBefore);
    expect(upgraded.normalWave.workerAssignments[NORMAL_WAVE_PROOF_WORKER_ID]).toBe(assignmentBefore);

    const next = applyBootstrapCommand(upgraded, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(next.normalWave.phase).toBe('awaiting');
    expect(next.normalWave.buildingLevelsByNeed[need]).toBe(2);
    expect(next.normalWave.workerAssignments[NORMAL_WAVE_PROOF_WORKER_ID]).toBe(assignmentBefore);
    expect(normalWaveServiceCapacity(next, need)).toBe(quote!.afterCapacity);
  });

  it('keeps upgrade numbers explicitly in proof tuning and caps Prototype buildings at level 3', () => {
    let state = completeWave(capacityInitial('upgrade-cap'));
    const need = state.normalWave.result!.bottleneckNeed;
    const first = normalWaveUpgradeQuote(state, need)!;
    expect(first.coinCost).toBe(PROTOTYPE_UPGRADE_PROOF_TUNING.coinCostByTargetLevel[2]);
    state = applyBootstrapCommand(state, { type: 'UPGRADE_BUILDING', need });
    const second = normalWaveUpgradeQuote(state, need)!;
    expect(second.toLevel).toBe(3);
    state = applyBootstrapCommand(state, { type: 'UPGRADE_BUILDING', need });
    expect(state.normalWave.buildingLevelsByNeed[need]).toBe(3);
    expect(normalWaveUpgradeQuote(state, need)).toBeNull();
  });
});
