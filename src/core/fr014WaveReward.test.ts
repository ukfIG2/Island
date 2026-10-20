import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveCoinReward, PROTOTYPE_ECONOMY_PROOF_TUNING, NORMAL_WAVE_PROOF_WORKER_ID, type BootstrapState } from './state';

const adverseTuning = {
  totalDemand: 12,
  releasePerTick: 4,
  baseServiceCapacity: { reception: 10, food: 1, drinks: 10, relax: 1, oceanView: 1 },
  queuePressurePerLostStar: 0.5,
  arrivalDurationMs: 1000,
  serviceDurationMs: 1000
} as const;

function finish(state: BootstrapState): BootstrapState {
  let next = state.normalWave.phase === 'awaiting' ? applyBootstrapCommand(state, { type: 'START_WAVE' }) : state;
  for (let i = 0; i < 800 && next.normalWave.phase !== 'complete'; i++) {
    next = applyBootstrapCommand(next, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  }
  expect(next.normalWave.phase).toBe('complete');
  for (const need of next.normalWave.activeNeedIds) {
    expect(next.normalWave.servedByNeed[need]).toBe(next.normalWave.releasedByNeed[need]);
  }
  return next;
}

function expectedReward(state: BootstrapState): number {
  const rating = state.normalWave.result!.rating;
  return Math.round(state.normalWave.releasedDemand * PROTOTYPE_ECONOMY_PROOF_TUNING.perUnitCoinValue * PROTOTYPE_ECONOMY_PROOF_TUNING.ratingModifierByRating[rating]);
}

describe('FR-014 normal-wave Coin reward structure', () => {
  it('does not increase payable base volume when service is slower and rating is worse', () => {
    const poor = finish(createInitialBootstrapState('fr014-poor', adverseTuning));
    const managedStart = applyBootstrapCommand(createInitialBootstrapState('fr014-managed', adverseTuning), { type: 'REASSIGN_WORKER', workerId: NORMAL_WAVE_PROOF_WORKER_ID, to: 'food' });
    const managed = finish(managedStart);
    expect(poor.normalWave.waveElapsedMs).toBeGreaterThan(managed.normalWave.waveElapsedMs);
    expect(poor.normalWave.result!.rating).toBeLessThan(managed.normalWave.result!.rating);
    expect(poor.normalWave.releasedDemand).toBe(adverseTuning.totalDemand);
    expect(managed.normalWave.releasedDemand).toBe(adverseTuning.totalDemand);
    expect(poor.normalWave.releasedDemand).toBe(managed.normalWave.releasedDemand);
    expect(normalWaveCoinReward(poor.normalWave)).toBe(expectedReward(poor));
    expect(normalWaveCoinReward(managed.normalWave)).toBe(expectedReward(managed));
    expect(normalWaveCoinReward(poor.normalWave)).toBeLessThan(normalWaveCoinReward(managed.normalWave));
  });

  it('increases Coin reward with completed base demand at the same achieved rating', () => {
    const capacity = { reception: 64, food: 64, drinks: 64, relax: 64, oceanView: 64 };
    const tuning = { ...adverseTuning, baseServiceCapacity: capacity };
    const small = finish(createInitialBootstrapState('fr014-small', { ...tuning, totalDemand: 12 }));
    const large = finish(createInitialBootstrapState('fr014-large', { ...tuning, totalDemand: 24 }));
    expect(small.normalWave.result!.rating).toBe(5);
    expect(large.normalWave.result!.rating).toBe(5);
    expect(small.normalWave.releasedDemand).toBe(12);
    expect(large.normalWave.releasedDemand).toBe(24);
    expect(normalWaveCoinReward(small.normalWave)).toBe(expectedReward(small));
    expect(normalWaveCoinReward(large.normalWave)).toBe(expectedReward(large));
    expect(normalWaveCoinReward(large.normalWave)).toBe(2 * normalWaveCoinReward(small.normalWave));
  });
});
